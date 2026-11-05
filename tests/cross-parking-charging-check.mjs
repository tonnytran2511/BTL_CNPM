import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import "reflect-metadata";

// T26 cross-check of parking and charging. Executed only by the foundation
// harness against its isolated temporary database and real HTTP server.
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const base = `http://127.0.0.1:${process.env.API_PORT}/api`;
const marker = randomUUID();
const keys = [];
const key = () => {
  const value = randomUUID();
  keys.push(value);
  return value;
};
async function call(path, { cookie, body, k, method = "GET" } = {}) {
  const response = await fetch(base + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      Origin: process.env.WEB_ORIGIN,
      ...(cookie ? { Cookie: cookie } : {}),
      ...(k ? { "Idempotency-Key": k } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return {
    status: response.status,
    body: await response.json().catch(() => null),
    cookie: response.headers.get("set-cookie")?.split(";")[0],
  };
}
async function login(email, password) {
  const response = await call("/auth/login", {
    method: "POST",
    body: { email, password },
  });
  assert.equal(response.status, 201);
  return response;
}
const post = (path, cookie, body) =>
  call(path, { method: "POST", cookie, k: key(), body });
const hours = (n) => new Date(Date.now() + n * 3600000);
const hubs = [];
const vehicles = [];
let otherUser;
try {
  const student = await login(
    process.env.SEED_STUDENT_EMAIL,
    process.env.SEED_STUDENT_PASSWORD,
  );
  const operator = await login(
    process.env.SEED_OPERATOR_EMAIL,
    process.env.SEED_OPERATOR_PASSWORD,
  );
  otherUser = (
    await pool.query(
      "INSERT INTO users(email,name,role,password_hash) SELECT $1,'T26 other student','student',password_hash FROM users WHERE id=$2 RETURNING id",
      [`${marker}@example.test`, student.body.id],
    )
  ).rows[0].id;
  const other = await login(
    `${marker}@example.test`,
    process.env.SEED_STUDENT_PASSWORD,
  );
  async function hub(spaces, points = 0) {
    const id = (
      await pool.query(
        "INSERT INTO hubs(code,name,location) VALUES($1,'T26 fixture','isolated test') RETURNING id",
        [randomUUID()],
      )
    ).rows[0].id;
    hubs.push(id);
    for (let i = 0; i < spaces; i++)
      await pool.query(
        "INSERT INTO parking_spaces(hub_id,code) VALUES($1,$2)",
        [id, `P${i}`],
      );
    const pointIds = [];
    for (let i = 0; i < points; i++)
      pointIds.push(
        (
          await pool.query(
            "INSERT INTO charging_points(hub_id,code) VALUES($1,$2) RETURNING id",
            [id, `C${i}`],
          )
        ).rows[0].id,
      );
    return { id, pointIds };
  }
  async function vehicle(battery = 20, owner = student) {
    const response = await call("/mobility/private-vehicles", {
      method: "POST",
      cookie: owner.cookie,
      k: key(),
      body: {
        code: `T26-${randomUUID().slice(0, 8)}`,
        type: "electric_bicycle",
        batteryPercent: battery,
      },
    });
    assert.equal(response.status, 201, JSON.stringify(response.body));
    vehicles.push(response.body.id);
    return response.body.id;
  }
  const book = (hubId, privateVehicleId, start, end, cookie = student.cookie) =>
    post("/mobility/parking/bookings", cookie, {
      hubId,
      privateVehicleId,
      startsAt: start.toISOString(),
      endsAt: end.toISOString(),
    });
  const availability = async (hubId, start, end) =>
    (
      await call(
        `/mobility/parking/availability?hubId=${hubId}&startsAt=${encodeURIComponent(start.toISOString())}&endsAt=${encodeURIComponent(end.toISOString())}`,
        { cookie: student.cookie },
      )
    ).body.available;

  // 1. Capacity boundary: the last space goes to exactly one booking.
  {
    const { id } = await hub(2);
    const [a, b, c] = [await vehicle(), await vehicle(), await vehicle()];
    const [t1, t2, t3] = [hours(2), hours(3), hours(4)];
    const first = await book(id, a, t1, t2);
    assert.equal(first.status, 201, JSON.stringify(first.body));
    assert.equal((await book(id, b, t1, t2)).status, 201);
    assert.equal(await availability(id, t1, t2), 0);
    assert.equal((await book(id, c, t1, t2)).status, 409, "full Hub rejects");
    // Half-open [start,end): the next slot starting at t2 is free.
    assert.equal(await availability(id, t2, t3), 2);
    assert.equal((await book(id, c, t2, t3)).status, 201);
    // One millisecond of overlap is a conflict once both spaces are taken.
    assert.equal(
      (await book(id, c, new Date(t2.getTime() - 1), t3)).status,
      409,
    );
    // Cancelling releases the slot for the same window.
    const cancelled = await post(
      `/mobility/parking/bookings/${first.body.id}/cancel`,
      student.cookie,
    );
    assert.equal(cancelled.status, 201);
    assert.equal(cancelled.body.status, "cancelled");
    assert.equal(await availability(id, t1, t2), 1);
    assert.equal((await book(id, c, t1, t2)).status, 201);
  }

  // 2. Schedule conflicts across time-zone notation and window limits.
  {
    const { id } = await hub(1);
    const [a, b] = [await vehicle(), await vehicle()];
    const start = hours(5),
      end = hours(6);
    assert.equal((await book(id, a, start, end)).status, 201);
    const offset = (date) => {
      const local = new Date(date.getTime() + 7 * 3600000);
      return local.toISOString().replace("Z", "+07:00");
    };
    // Same instants written with +07:00 are the same booking window.
    const sameInstant = await post(
      "/mobility/parking/bookings",
      student.cookie,
      {
        hubId: id,
        privateVehicleId: b,
        startsAt: offset(start),
        endsAt: offset(end),
      },
    );
    assert.equal(sameInstant.status, 409, JSON.stringify(sameInstant.body));
    // Missing offset, inverted or past windows are rejected before any write.
    const bad = (startsAt, endsAt) =>
      post("/mobility/parking/bookings", student.cookie, {
        hubId: id,
        privateVehicleId: b,
        startsAt,
        endsAt,
      });
    assert.equal(
      (
        await bad(
          start.toISOString().replace("Z", ""),
          end.toISOString().replace("Z", ""),
        )
      ).status,
      400,
    );
    assert.equal(
      (await bad(end.toISOString(), start.toISOString())).status,
      400,
    );
    assert.equal(
      (await bad(start.toISOString(), start.toISOString())).status,
      400,
    );
    assert.equal(
      (await bad(hours(-1).toISOString(), hours(1).toISOString())).status,
      400,
    );
    // maximumParkingDurationMinutes (1440 in the seed) is inclusive.
    const far = hours(48);
    assert.equal(
      (await book(id, b, far, new Date(far.getTime() + 1440 * 60000))).status,
      201,
    );
    const farther = hours(100);
    assert.equal(
      (await book(id, a, farther, new Date(farther.getTime() + 1441 * 60000)))
        .status,
      400,
    );
    // A Hub that stopped operating accepts no new booking.
    await pool.query("UPDATE hubs SET status='inactive' WHERE id=$1", [id]);
    assert.equal((await book(id, a, hours(10), hours(11))).status, 409);
  }

  // 3. Ownership, repeated actions and time gates.
  {
    const { id } = await hub(2);
    const [mine, theirs] = [await vehicle(), await vehicle(20, other)];
    assert.equal(
      (await book(id, theirs, hours(2), hours(3))).status,
      403,
      "cannot park someone else's vehicle",
    );
    const booking = await book(id, mine, hours(2), hours(3));
    assert.equal(booking.status, 201);
    const path = (action) =>
      `/mobility/parking/bookings/${booking.body.id}/${action}`;
    assert.equal((await post(path("cancel"), other.cookie)).status, 403);
    assert.equal((await post(path("check-in"), student.cookie)).status, 409);
    assert.equal((await post(path("check-out"), student.cookie)).status, 409);
    const replayKey = key();
    const first = await call(path("cancel"), {
      method: "POST",
      cookie: student.cookie,
      k: replayKey,
    });
    const replay = await call(path("cancel"), {
      method: "POST",
      cookie: student.cookie,
      k: replayKey,
    });
    assert.equal(first.status, 201);
    assert.deepEqual(replay.body, first.body, "same key replays the result");
    // Current behaviour: a new key on an already cancelled booking is a no-op
    // that still answers 201 with status "cancelled" (to be confirmed).
    const again = await post(path("cancel"), student.cookie);
    assert.equal(again.status, 201);
    assert.equal(again.body.status, "cancelled");
    assert.equal((await post(path("check-in"), student.cookie)).status, 409);
  }

  // 4. Charging boundaries and device failure.
  {
    const { id, pointIds } = await hub(2, 1);
    const car = await vehicle(20);
    const booking = await book(id, car, hours(1), hours(2));
    assert.equal(booking.status, 201);
    const charge = (target, cookie = student.cookie, vehicleId = car) =>
      post("/mobility/charging/requests", cookie, {
        hubId: id,
        vehicle: { kind: "private", id: vehicleId },
        targetBatteryPercent: target,
      });
    // Charging needs the vehicle to be checked in at this Hub first.
    assert.equal((await charge(80)).status, 409);
    await pool.query(
      "UPDATE parking_bookings SET starts_at=now()-interval '1 minute' WHERE id=$1",
      [booking.body.id],
    );
    const checkIn = await post(
      `/mobility/parking/bookings/${booking.body.id}/check-in`,
      student.cookie,
    );
    assert.equal(checkIn.status, 201, JSON.stringify(checkIn.body));
    // Target battery must be strictly above the current 20% and within 1..100.
    for (const target of [20, 10, 0, 101])
      assert.equal((await charge(target)).status, 400, `target ${target}`);
    assert.equal((await charge(80, other.cookie)).status, 403);
    assert.equal(
      (
        await post("/mobility/charging/requests", student.cookie, {
          hubId: id,
          vehicle: { kind: "rental", id: randomUUID() },
          targetBatteryPercent: 80,
        })
      ).status,
      403,
      "students cannot request charging for rental vehicles",
    );
    // requiredBy must be in the future.
    assert.equal(
      (
        await post("/mobility/charging/requests", student.cookie, {
          hubId: id,
          vehicle: { kind: "private", id: car },
          targetBatteryPercent: 80,
          requiredBy: hours(-1).toISOString(),
        })
      ).status,
      400,
    );
    const requested = await charge(21);
    assert.equal(requested.status, 201, JSON.stringify(requested.body));
    assert.equal(requested.body.status, "queued");

    // Device failure: only operators report it, and it needs a description.
    const fail = (cookie, body) =>
      post(`/mobility/charging/points/${pointIds[0]}/fail`, cookie, body);
    assert.equal(
      (await fail(student.cookie, { description: "broken" })).status,
      403,
    );
    assert.equal((await fail(operator.cookie, {})).status, 400);
    assert.equal(
      (await fail(operator.cookie, { description: "   " })).status,
      400,
    );
    const failed = await fail(operator.cookie, { description: "T26 fault" });
    assert.ok([200, 201].includes(failed.status), JSON.stringify(failed.body));
    assert.equal(
      (
        await pool.query("SELECT status FROM charging_points WHERE id=$1", [
          pointIds[0],
        ])
      ).rows[0].status,
      "failed",
    );
    // A failed point must not be handed to a queued request.
    assert.equal(
      (
        await pool.query(
          "SELECT count(*)::int n FROM charging_requests WHERE hub_id=$1 AND status='allocated'",
          [id],
        )
      ).rows[0].n,
      0,
    );
    const recovered = await post(
      `/mobility/charging/points/${pointIds[0]}/recover`,
      operator.cookie,
    );
    assert.ok(
      [200, 201].includes(recovered.status),
      JSON.stringify(recovered.body),
    );
    assert.equal(
      (
        await pool.query("SELECT status FROM charging_points WHERE id=$1", [
          pointIds[0],
        ])
      ).rows[0].status,
      "available",
    );
    // Leaving the Hub cancels the still-queued charging request.
    const out = await post(
      `/mobility/parking/bookings/${booking.body.id}/check-out`,
      student.cookie,
    );
    assert.equal(out.status, 201, JSON.stringify(out.body));
    assert.equal(
      (
        await pool.query("SELECT status FROM charging_requests WHERE id=$1", [
          requested.body.id,
        ])
      ).rows[0].status,
      "cancelled",
    );
    assert.equal(
      (
        await pool.query(
          "SELECT count(*)::int n FROM parking_spaces WHERE hub_id=$1 AND status<>'available'",
          [id],
        )
      ).rows[0].n,
      0,
      "check-out frees the parking space",
    );
  }
  console.log(
    "T26 cross-check: capacity/window boundaries, +07:00 overlap, ownership, repeat actions, charging target boundaries and device failure passed.",
  );
} finally {
  for (const id of hubs) {
    await pool
      .query(
        "DELETE FROM charging_sessions WHERE charging_point_id IN (SELECT id FROM charging_points WHERE hub_id=$1)",
        [id],
      )
      .catch(() => {});
    await pool.query("DELETE FROM charging_requests WHERE hub_id=$1", [id]);
    await pool.query(
      "DELETE FROM parking_bookings WHERE parking_space_id IN (SELECT id FROM parking_spaces WHERE hub_id=$1)",
      [id],
    );
    await pool.query("DELETE FROM parking_spaces WHERE hub_id=$1", [id]);
    await pool.query("DELETE FROM charging_points WHERE hub_id=$1", [id]);
    await pool.query("DELETE FROM hubs WHERE id=$1", [id]).catch(() => {});
  }
  await pool.query(
    "DELETE FROM mobility_idempotency WHERE key=ANY($1::text[])",
    [keys],
  );
  await pool.query("DELETE FROM private_vehicles WHERE id=ANY($1::uuid[])", [
    vehicles,
  ]);
  if (otherUser) await pool.query("DELETE FROM users WHERE id=$1", [otherUser]);
  await pool.end();
}
