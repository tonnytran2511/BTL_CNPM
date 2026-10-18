import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import "reflect-metadata";
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const base = `http://127.0.0.1:${process.env.API_PORT}/api`;
async function call(path, { cookie, body, key, method = "GET" } = {}) {
  const response = await fetch(base + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      Origin: process.env.WEB_ORIGIN,
      ...(cookie ? { Cookie: cookie } : {}),
      ...(key ? { "Idempotency-Key": key } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return {
    status: response.status,
    body: await response.json(),
    cookie: response.headers.get("set-cookie")?.split(";")[0],
  };
}
async function login(role) {
  const response = await call("/auth/login", {
    method: "POST",
    body: {
      email: process.env[`SEED_${role}_EMAIL`],
      password: process.env[`SEED_${role}_PASSWORD`],
    },
  });
  assert.equal(response.status, 201);
  return response;
}
const marker = randomUUID();
let hub, otherUser;
const registered = [];
const keys = [];
const freshKey = () => {
  const k = randomUUID();
  keys.push(k);
  return k;
};
try {
  const student = await login("STUDENT"),
    operator = await login("OPERATOR");
  otherUser = (
    await pool.query(
      "INSERT INTO users(email,name,role,password_hash) SELECT $1,'Other student','student',password_hash FROM users WHERE id=$2 RETURNING id",
      [`${marker}@example.test`, student.body.id],
    )
  ).rows[0].id;
  const other = await call("/auth/login", {
    method: "POST",
    body: {
      email: `${marker}@example.test`,
      password: process.env.SEED_STUDENT_PASSWORD,
    },
  });
  assert.equal(other.status, 201);
  hub = (
    await pool.query(
      "INSERT INTO hubs(code,name,location) VALUES($1,'Parking test Hub','test') RETURNING id",
      [marker],
    )
  ).rows[0].id;
  await pool.query(
    "INSERT INTO parking_spaces(hub_id,code) VALUES($1,'LAST')",
    [hub],
  );
  assert.equal((await call("/mobility/private-vehicles")).status, 401);
  const registerBody = {
    code: `MA-${marker}`,
    type: "electric_bicycle",
    batteryPercent: 20,
  };
  assert.equal(
    (
      await call("/mobility/private-vehicles", {
        method: "POST",
        cookie: student.cookie,
        body: registerBody,
      })
    ).status,
    400,
  );
  const key = freshKey();
  const vehicle = await call("/mobility/private-vehicles", {
    method: "POST",
    cookie: student.cookie,
    key,
    body: registerBody,
  });
  assert.equal(vehicle.status, 201, JSON.stringify(vehicle.body));
  registered.push(vehicle.body.id);
  assert.deepEqual(
    (
      await call("/mobility/private-vehicles", {
        method: "POST",
        cookie: student.cookie,
        key,
        body: registerBody,
      })
    ).body,
    vehicle.body,
  );
  assert.equal(
    (
      await call("/mobility/private-vehicles", {
        method: "POST",
        cookie: student.cookie,
        key,
        body: { ...registerBody, batteryPercent: 30 },
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await call("/mobility/private-vehicles", {
        method: "POST",
        cookie: student.cookie,
        key: freshKey(),
        body: { ...registerBody, code: "Invalid", ownerId: otherUser },
      })
    ).status,
    400,
  );
  const now = Date.now(),
    t = (hours) => new Date(now + hours * 3600000).toISOString();
  const booking = {
    hubId: hub,
    privateVehicleId: vehicle.body.id,
    startsAt: t(1),
    endsAt: t(2),
  };
  const postBooking = (body, cookie = student.cookie, key = freshKey()) =>
    call("/mobility/parking/bookings", { method: "POST", cookie, key, body });
  assert.equal((await postBooking(booking, other.cookie)).status, 403);
  assert.equal((await postBooking({ ...booking, endsAt: t(0.5) })).status, 400);
  assert.equal((await postBooking({ ...booking, endsAt: t(27) })).status, 400);
  assert.equal(
    (await postBooking({ ...booking, startsAt: t(1).replace("Z", "") })).status,
    400,
  );
  const results = await Promise.all([
    postBooking(booking),
    postBooking(booking),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
  const booked = results.find((r) => r.status === 201);
  assert.equal(
    (
      await pool.query("SELECT status FROM parking_spaces WHERE hub_id=$1", [
        hub,
      ])
    ).rows[0].status,
    "available",
  );
  const adjacent = await postBooking({
    ...booking,
    startsAt: t(2),
    endsAt: t(3),
  });
  assert.equal(adjacent.status, 201, JSON.stringify(adjacent.body));
  const availability = await call(
    `/mobility/parking/availability?${new URLSearchParams({ hubId: hub, startsAt: t(1), endsAt: t(2) })}`,
    { cookie: student.cookie },
  );
  assert.equal(availability.body.available, 0);
  const action = (id, action, cookie = student.cookie, key = freshKey()) =>
    call(`/mobility/parking/bookings/${id}/${action}`, {
      method: "POST",
      cookie,
      key,
      body: {},
    });
  assert.equal(
    (await action(booked.body.id, "cancel", other.cookie)).status,
    403,
  );
  assert.equal((await action(booked.body.id, "check-in")).status, 409);
  await pool.query(
    "UPDATE parking_bookings SET starts_at=now()-interval '1 minute' WHERE id=$1",
    [booked.body.id],
  );
  const inKey = freshKey();
  assert.equal(
    (await action(booked.body.id, "check-in", student.cookie, inKey)).status,
    201,
  );
  assert.equal(
    (await action(booked.body.id, "check-in", student.cookie, inKey)).status,
    201,
  );
  assert.equal((await action(booked.body.id, "cancel")).status, 409);
  const charge = {
    hubId: hub,
    vehicle: { kind: "private", id: vehicle.body.id },
    targetBatteryPercent: 80,
  };
  const postCharge = (body, cookie = student.cookie, key = freshKey()) =>
    call("/mobility/charging/requests", { method: "POST", cookie, key, body });
  assert.equal((await postCharge(charge, other.cookie)).status, 403);
  assert.equal(
    (await postCharge({ ...charge, targetBatteryPercent: 10 })).status,
    400,
  );
  assert.equal(
    (await postCharge({ ...charge, requiredBy: t(-1) })).status,
    400,
  );
  assert.equal(
    (
      await postCharge({
        ...charge,
        vehicle: { kind: "rental", id: randomUUID() },
      })
    ).status,
    403,
  );
  const chargeKey = freshKey();
  const charged = await postCharge(charge, student.cookie, chargeKey);
  assert.equal(charged.status, 201, JSON.stringify(charged.body));
  assert.deepEqual(
    (await postCharge(charge, student.cookie, chargeKey)).body,
    charged.body,
  );
  assert.equal((await postCharge(charge)).status, 409);
  assert.ok(
    (
      await call("/mobility/charging/requests", { cookie: student.cookie })
    ).body.some((r) => r.id === charged.body.id),
  );
  assert.ok(
    !(
      await call("/mobility/charging/requests", { cookie: other.cookie })
    ).body.some((r) => r.id === charged.body.id),
  );
  assert.ok(
    (
      await call("/mobility/charging/requests", { cookie: operator.cookie })
    ).body.some((r) => r.id === charged.body.id),
  );
  assert.equal((await action(booked.body.id, "check-out")).status, 201);
  assert.equal(
    (
      await pool.query("SELECT status FROM charging_requests WHERE id=$1", [
        charged.body.id,
      ])
    ).rows[0].status,
    "cancelled",
  );
  assert.equal((await action(adjacent.body.id, "cancel")).status, 201);
  assert.equal((await postCharge(charge)).status, 409); // Vehicle has left the Hub.
  const { Database } =
    await import("../apps/api/dist/database/database.module.js");
  const { MobilityRepository } =
    await import("../apps/api/dist/mobility/mobility.repository.js");
  const { MobilityService } =
    await import("../apps/api/dist/mobility/mobility.service.js");
  const db = new Database();
  const service = new MobilityService(new MobilityRepository(db));
  const rental = (
    await pool.query(
      "INSERT INTO vehicles(code,hub_id,type,battery_percent,status) VALUES($1,NULL,'electric_bicycle',40,'in_use') RETURNING id",
      [marker],
    )
  ).rows[0].id;
  const rental2 = (
    await pool.query(
      "INSERT INTO vehicles(code,hub_id,type,battery_percent,status) VALUES($1,NULL,'electric_bicycle',40,'in_use') RETURNING id",
      [`${marker}-2`],
    )
  ).rows[0].id;
  try {
    const allocation = await Promise.allSettled(
      [rental, rental2].map((id) =>
        db.transaction((c) => service.claimRentalVehicleSpace(id, hub, c)),
      ),
    );
    assert.equal(allocation.filter((r) => r.status === "fulfilled").length, 1);
    const occupying = (
      await pool.query(
        "SELECT vehicle_id FROM parking_spaces WHERE hub_id=$1",
        [hub],
      )
    ).rows[0].vehicle_id;
    await assert.rejects(
      db.transaction(async (c) => {
        await service.releaseRentalVehicleSpace(occupying, hub, c);
        throw new Error("rollback probe");
      }),
      /rollback probe/,
    );
    assert.equal(
      (
        await pool.query(
          "SELECT vehicle_id FROM parking_spaces WHERE hub_id=$1",
          [hub],
        )
      ).rows[0].vehicle_id,
      occupying,
    );
    await db.transaction((c) =>
      service.releaseRentalVehicleSpace(occupying, hub, c),
    );
    const future = await postBooking({
      ...booking,
      startsAt: t(4),
      endsAt: t(5),
    });
    assert.equal(future.status, 201);
    await assert.rejects(
      db.transaction((c) => service.claimRentalVehicleSpace(rental, hub, c)),
      (e) => e.getStatus() === 409,
    );
    await action(future.body.id, "cancel");
    await pool.query("UPDATE hubs SET status='inactive' WHERE id=$1", [hub]);
    assert.equal(
      (await postBooking({ ...booking, startsAt: t(4), endsAt: t(5) })).status,
      409,
    );
  } finally {
    await db.onModuleDestroy();
    await pool.query("DELETE FROM vehicles WHERE id=ANY($1::uuid[])", [
      [rental, rental2],
    ]);
  }
  console.log(
    "Mobility: ownership, DTO/time validation, idempotency, adjacent slots, concurrent last space, physical state, charging queue and allocation rollback passed.",
  );
} finally {
  if (hub) {
    await pool.query("DELETE FROM charging_requests WHERE hub_id=$1", [hub]);
    await pool.query(
      "DELETE FROM parking_bookings WHERE parking_space_id IN (SELECT id FROM parking_spaces WHERE hub_id=$1)",
      [hub],
    );
    await pool.query("DELETE FROM parking_spaces WHERE hub_id=$1", [hub]);
    await pool.query("DELETE FROM hubs WHERE id=$1", [hub]);
  }
  await pool.query(
    "DELETE FROM mobility_idempotency WHERE key=ANY($1::text[])",
    [keys],
  );
  await pool.query("DELETE FROM private_vehicles WHERE id=ANY($1::uuid[])", [
    registered,
  ]);
  if (otherUser) await pool.query("DELETE FROM users WHERE id=$1", [otherUser]);
  await pool.end();
}
