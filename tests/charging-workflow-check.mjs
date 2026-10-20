import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const base = `http://127.0.0.1:${process.env.API_PORT}/api`;
const keys = [];
const key = () => {
  const k = randomUUID();
  keys.push(k);
  return k;
};
let hub;
const cars = [];
async function call(path, cookie, body, k) {
  const r = await fetch(base + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: process.env.WEB_ORIGIN,
      ...(cookie ? { Cookie: cookie } : {}),
      ...(k ? { "Idempotency-Key": k } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return {
    status: r.status,
    body: await r.json(),
    cookie: r.headers.get("set-cookie")?.split(";")[0],
  };
}
const login = (role) =>
  call("/auth/login", undefined, {
    email: process.env[`SEED_${role}_EMAIL`],
    password: process.env[`SEED_${role}_PASSWORD`],
  });
try {
  const student = await login("STUDENT"),
    operator = await login("OPERATOR");
  assert.equal(operator.status, 201);
  const op = operator.cookie;
  assert.equal(
    (await call("/mobility/charging/overview", student.cookie)).status,
    403,
  );
  assert.equal((await call("/mobility/charging/overview")).status, 401);
  hub = (
    await pool.query(
      "INSERT INTO hubs(code,name,location) VALUES($1,'T19 fixture','isolated') RETURNING id",
      [randomUUID()],
    )
  ).rows[0].id;
  const point = (
    await pool.query(
      "INSERT INTO charging_points(hub_id,code) VALUES($1,'C1') RETURNING id",
      [hub],
    )
  ).rows[0].id;
  for (let i = 0; i < 2; i++) {
    const v = (
      await pool.query(
        "INSERT INTO private_vehicles(owner_id,code,type,battery_percent) VALUES($1,$2,'electric_bicycle',20) RETURNING id",
        [student.body.id, randomUUID()],
      )
    ).rows[0].id;
    cars.push(v);
    await pool.query(
      "INSERT INTO parking_spaces(hub_id,code,status,private_vehicle_id) VALUES($1,$2,'occupied',$3)",
      [hub, `P${i}`, v],
    );
  }
  const request = async (vehicle, target = 80) => {
    const r = await call(
      "/mobility/charging/requests",
      student.cookie,
      {
        hubId: hub,
        vehicle: { kind: "private", id: vehicle },
        targetBatteryPercent: target,
      },
      key(),
    );
    assert.equal(r.status, 201, JSON.stringify(r.body));
    return r.body.id;
  };
  const r1 = await request(cars[0]),
    r2 = await request(cars[1]);
  await pool.query(
    "UPDATE charging_requests SET created_at=now()-interval '130 minutes' WHERE id=$1",
    [r1],
  );
  const schedule = (k) =>
    call("/mobility/charging/schedule", op, { hubId: hub }, k ?? key());
  const action = (id, type, body = {}, k = key()) =>
    call(`/mobility/charging/sessions/${id}/${type}`, op, body, k);
  assert.equal(
    (await call("/mobility/charging/schedule", op, { hubId: hub })).status,
    400,
  );
  const sk = key();
  const scheduled = await Promise.all([schedule(sk), schedule(sk)]);
  assert.equal(scheduled[0].status, 201, JSON.stringify(scheduled[0].body));
  assert.deepEqual(scheduled[0].body, scheduled[1].body);
  assert.equal(scheduled[0].body.sessions.length, 1);
  const s1 = scheduled[0].body.sessions[0];
  assert.equal(s1.requestId, r1);
  assert.equal((await schedule()).body.sessions.length, 0);
  assert.equal(
    (await action(s1.id, "complete", { achievedBatteryPercent: 80 })).status,
    409,
  );
  const startKey = key();
  const started = await action(s1.id, "start", {}, startKey);
  assert.equal(started.status, 201);
  assert.equal(started.body.status, "charging");
  assert.deepEqual(
    (await action(s1.id, "start", {}, startKey)).body,
    started.body,
  );
  assert.equal(
    (await action(s1.id, "complete", { achievedBatteryPercent: 40 })).status,
    400,
  );
  assert.equal((await action(s1.id, "complete", {})).status, 400);
  const completeKey = key();
  const completed = await action(
    s1.id,
    "complete",
    { achievedBatteryPercent: 80 },
    completeKey,
  );
  assert.equal(completed.status, 201);
  assert.equal(completed.body.status, "completed");
  assert.deepEqual(
    (
      await action(
        s1.id,
        "complete",
        { achievedBatteryPercent: 80 },
        completeKey,
      )
    ).body,
    completed.body,
  );
  assert.equal(
    (
      await pool.query(
        "SELECT battery_percent FROM private_vehicles WHERE id=$1",
        [cars[0]],
      )
    ).rows[0].battery_percent,
    80,
  );
  assert.equal(
    (
      await pool.query("SELECT status FROM charging_points WHERE id=$1", [
        point,
      ])
    ).rows[0].status,
    "available",
  );
  const next = await schedule();
  assert.equal(next.body.sessions[0].requestId, r2);
  const s2 = next.body.sessions[0].id;
  assert.equal((await action(s2, "cancel")).body.status, "cancelled");
  assert.equal(
    (await pool.query("SELECT status FROM charging_requests WHERE id=$1", [r2]))
      .rows[0].status,
    "cancelled",
  );
  const r3 = await request(cars[0], 90);
  const s3 = (await schedule()).body.sessions.find(
    (s) => s.requestId === r3,
  ).id;
  await action(s3, "start");
  const race = await Promise.all([
    action(s3, "complete", { achievedBatteryPercent: 90 }),
    action(s3, "cancel", { achievedBatteryPercent: 85 }),
  ]);
  assert.deepEqual(race.map((r) => r.status).sort(), [201, 409]);
  const final = (
    await pool.query(
      "SELECT battery_percent FROM private_vehicles WHERE id=$1",
      [cars[0]],
    )
  ).rows[0].battery_percent;
  assert.equal(final, race[0].status === 201 ? 90 : 85);
  const overview = await call("/mobility/charging/overview", op);
  assert.equal(overview.status, 200);
  assert.ok(overview.body.sessions.some((s) => s.id === s3));
  console.log(
    "T19 workflow: auth, ordering, scheduler idempotency, start, complete, cancel, actual pin and concurrent terminal requests passed.",
  );
} finally {
  if (hub) {
    await pool.query(
      "DELETE FROM charging_sessions WHERE request_id IN (SELECT id FROM charging_requests WHERE hub_id=$1)",
      [hub],
    );
    await pool.query("DELETE FROM charging_requests WHERE hub_id=$1", [hub]);
    await pool.query("DELETE FROM parking_spaces WHERE hub_id=$1", [hub]);
    await pool.query("DELETE FROM charging_points WHERE hub_id=$1", [hub]);
    await pool.query("DELETE FROM hubs WHERE id=$1", [hub]);
  }
  await pool.query(
    "DELETE FROM mobility_idempotency WHERE key=ANY($1::text[])",
    [keys],
  );
  await pool.query("DELETE FROM private_vehicles WHERE id=ANY($1::uuid[])", [
    cars,
  ]);
  await pool.end();
}
