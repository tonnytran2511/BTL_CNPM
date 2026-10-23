import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";

// Runs only against the disposable PostgreSQL/API owned by foundation.test.mjs.
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const base = `http://127.0.0.1:${process.env.API_PORT}/api`;
async function call(path, { method = "GET", cookie, body, key } = {}) {
  const response = await fetch(base + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      Origin: process.env.WEB_ORIGIN,
      ...(cookie ? { Cookie: cookie } : {}),
      ...(key ? { "Idempotency-Key": key } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  return {
    status: response.status,
    body: await response.json(),
    cookie: response.headers.get("set-cookie")?.split(";")[0],
  };
}
async function login(role) {
  const result = await call("/auth/login", {
    method: "POST",
    body: {
      email: process.env[`SEED_${role}_EMAIL`],
      password: process.env[`SEED_${role}_PASSWORD`],
    },
  });
  assert.equal(result.status, 201);
  return result;
}
const hubs = [],
  points = [],
  keys = [];
let privateVehicle;
try {
  const operator = await login("OPERATOR"),
    student = await login("STUDENT");
  const write = (path, method, body, cookie = operator.cookie) =>
    call(path, { method, body, cookie });
  const create = async () => {
    const result = await write("/hubs", "POST", {
      code: `t14-${randomUUID().slice(0, 12)}`,
      name: "T14 integration Hub",
      location: "Disposable test",
    });
    assert.equal(result.status, 201, JSON.stringify(result));
    hubs.push(result.body.id);
    return result.body;
  };
  const missing = randomUUID();
  for (const [path, method, body] of [
    ["/hubs", "POST", {}],
    [`/hubs/${missing}`, "PATCH", {}],
    [`/hubs/${missing}`, "DELETE"],
    [`/hubs/${missing}/parking-capacity`, "PUT", { capacity: 1 }],
    [`/hubs/${missing}/charging-points`, "POST", { code: "C1" }],
    [`/hubs/${missing}/charging-points/${randomUUID()}`, "DELETE"],
  ]) {
    assert.equal((await call(path, { method, body })).status, 401);
    assert.equal((await write(path, method, body, student.cookie)).status, 403);
  }
  const before = (await call("/network/overview", { cookie: operator.cookie }))
    .body;
  const hub = await create(),
    path = `/hubs/${hub.id}`;
  assert.equal(hub.code, hub.code.toUpperCase());
  assert.equal(
    (
      await write("/hubs", "POST", {
        code: hub.code.toLowerCase(),
        name: "Duplicate",
        location: "Test",
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await write(path, "PATCH", {
        name: "Updated Hub",
        location: "Updated location",
      })
    ).status,
    200,
  );
  assert.equal((await write(path, "PATCH", { capacity: 100 })).status, 400);
  assert.equal(
    (await write(`${path}/parking-capacity`, "PUT", { capacity: 1.5 })).status,
    400,
  );
  const maximum = (
    await pool.query(
      "SELECT value FROM settings WHERE key='maxParkingCapacityPerHub'",
    )
  ).rows[0].value;
  assert.equal(
    (await write(`${path}/parking-capacity`, "PUT", { capacity: maximum + 1 }))
      .status,
    409,
  );
  assert.equal(
    (await write(`${path}/parking-capacity`, "PUT", { capacity: 3 })).status,
    200,
  );
  const detail = (await call(path, { cookie: operator.cookie })).body;
  assert.equal(detail.name, "Updated Hub");
  assert.equal(detail.location, "Updated location");
  assert.equal(detail.parking.capacity, 3);
  const after = (await call("/network/overview", { cookie: operator.cookie }))
    .body;
  assert.equal(
    after.totals.availableParking,
    before.totals.availableParking + 3,
  );
  assert.equal(after.hubs.find((h) => h.id === hub.id).parking.capacity, 3);
  assert.equal(
    (await call("/hubs", { cookie: student.cookie })).body.find(
      (h) => h.id === hub.id,
    ).parking.capacity,
    3,
  );
  assert.equal(
    (await write(path, "PATCH", { status: "inactive" })).status,
    200,
  );
  assert.ok(
    !(await call("/hubs", { cookie: student.cookie })).body.some(
      (h) => h.id === hub.id,
    ),
  );
  assert.equal((await call(path, { cookie: student.cookie })).status, 404);
  assert.equal(
    (await call(path, { cookie: operator.cookie })).body.parking.available,
    0,
  );
  assert.equal((await write(path, "PATCH", { status: "active" })).status, 200);

  // Physical holds and future bookings must survive capacity edits atomically.
  const space = (
    await pool.query(
      "SELECT id FROM parking_spaces WHERE hub_id=$1 ORDER BY code LIMIT 1",
      [hub.id],
    )
  ).rows[0].id;
  await pool.query(
    "UPDATE parking_spaces SET status='held',hold_expires_at=now()+interval '1 hour' WHERE id=$1",
    [space],
  );
  assert.equal(
    (await write(`${path}/parking-capacity`, "PUT", { capacity: 0 })).status,
    409,
  );
  assert.equal(
    (await call(path, { cookie: operator.cookie })).body.parking.capacity,
    3,
  );
  await pool.query(
    "UPDATE parking_spaces SET status='available',hold_expires_at=NULL WHERE id=$1",
    [space],
  );
  const key = randomUUID();
  keys.push(key);
  const vehicle = await call("/mobility/private-vehicles", {
    cookie: student.cookie,
    method: "POST",
    key,
    body: {
      code: `T14-${randomUUID()}`,
      type: "electric_bicycle",
      batteryPercent: 30,
    },
  });
  assert.equal(vehicle.status, 201);
  privateVehicle = vehicle.body.id;
  const bookingKey = randomUUID();
  keys.push(bookingKey);
  const booking = await call("/mobility/parking/bookings", {
    cookie: student.cookie,
    method: "POST",
    key: bookingKey,
    body: {
      hubId: hub.id,
      privateVehicleId: privateVehicle,
      startsAt: new Date(Date.now() + 60000).toISOString(),
      endsAt: new Date(Date.now() + 120000).toISOString(),
    },
  });
  assert.equal(booking.status, 201, JSON.stringify(booking));
  assert.equal(
    (await write(`${path}/parking-capacity`, "PUT", { capacity: 0 })).status,
    409,
  );
  assert.equal(
    (await call(path, { cookie: operator.cookie })).body.parking.capacity,
    3,
  );
  assert.equal((await write(path, "DELETE")).status, 409);

  const point = await write(`${path}/charging-points`, "POST", { code: "c1" });
  assert.equal(point.status, 201);
  points.push(point.body.id);
  assert.equal(point.body.code, "C1");
  const pointPath = `${path}/charging-points/${point.body.id}`;
  assert.equal(
    (await write(`${path}/charging-points`, "POST", { code: "C1" })).status,
    409,
  );
  assert.equal(
    (await write(`${path}/charging-points/${randomUUID()}`, "DELETE")).status,
    404,
  );
  const empty = await create();
  assert.equal(
    (
      await write(
        `/hubs/${empty.id}/charging-points/${point.body.id}`,
        "DELETE",
      )
    ).status,
    404,
  );
  await pool.query("UPDATE charging_points SET status='occupied' WHERE id=$1", [
    point.body.id,
  ]);
  assert.equal((await write(pointPath, "DELETE")).status, 409);
  await pool.query(
    "UPDATE charging_points SET status='available' WHERE id=$1",
    [point.body.id],
  );

  // Reproduce the original review interleaving: incident owns the point lock;
  // DELETE waits, then must see the committed incident and return 409.
  const incidentClient = await pool.connect();
  let deletion;
  try {
    await incidentClient.query("BEGIN");
    await incidentClient.query(
      "SELECT id FROM charging_points WHERE id=$1 FOR UPDATE",
      [point.body.id],
    );
    deletion = write(pointPath, "DELETE");
    const deadline = Date.now() + 5000;
    let waiting = false;
    while (Date.now() < deadline) {
      const result = await pool.query(
        "SELECT 1 FROM pg_stat_activity WHERE wait_event_type='Lock' AND query LIKE 'SELECT id FROM charging_points WHERE id=$1 AND hub_id=$2 FOR UPDATE%'",
      );
      if (result.rowCount) {
        waiting = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    assert.ok(waiting, "DELETE must wait for the charging point lock");
    await incidentClient.query(
      "INSERT INTO incidents(resource_type,resource_id,description,reported_by) VALUES('charging_point',$1,'T14 concurrent incident',$2)",
      [point.body.id, operator.body.id],
    );
    await incidentClient.query("COMMIT");
    assert.equal((await deletion).status, 409);
  } finally {
    await incidentClient.query("ROLLBACK");
    incidentClient.release();
    if (deletion) await deletion;
  }
  const incident = (
    await pool.query(
      "SELECT id FROM incidents WHERE resource_id=$1 AND status='open'",
      [point.body.id],
    )
  ).rows[0];
  assert.ok(incident);
  assert.ok(
    (await call(path, { cookie: operator.cookie })).body.chargingPoints.some(
      (p) => p.id === point.body.id,
    ),
  );
  assert.equal(
    (await write(`/incidents/${incident.id}/resolve`, "POST")).status,
    201,
  );
  assert.equal((await write(pointPath, "DELETE")).status, 200);
  assert.equal(
    (await call(path, { cookie: operator.cookie })).body.chargingPoints.length,
    0,
  );

  assert.equal(
    (await write(`/hubs/${empty.id}/parking-capacity`, "PUT", { capacity: 2 }))
      .status,
    200,
  );
  assert.equal(
    (await write(`/hubs/${empty.id}/parking-capacity`, "PUT", { capacity: 0 }))
      .status,
    200,
  );
  assert.equal((await write(`/hubs/${empty.id}`, "DELETE")).status, 200);
  assert.equal(
    (await call(`/hubs/${empty.id}`, { cookie: operator.cookie })).status,
    404,
  );
  console.log(
    "T14/T35: permissions, CRUD, dynamic dashboard, inactive Hub, configuration, held/booked capacity rollback, occupied point and concurrent incident/delete passed.",
  );
} finally {
  await pool.query("DELETE FROM incidents WHERE resource_id=ANY($1::uuid[])", [
    [...hubs, ...points],
  ]);
  await pool.query(
    "DELETE FROM mobility_idempotency WHERE key=ANY($1::text[])",
    [keys],
  );
  await pool.query(
    "DELETE FROM parking_bookings WHERE parking_space_id IN (SELECT id FROM parking_spaces WHERE hub_id=ANY($1::uuid[]))",
    [hubs],
  );
  await pool.query("DELETE FROM parking_spaces WHERE hub_id=ANY($1::uuid[])", [
    hubs,
  ]);
  await pool.query("DELETE FROM charging_points WHERE hub_id=ANY($1::uuid[])", [
    hubs,
  ]);
  if (privateVehicle)
    await pool.query("DELETE FROM private_vehicles WHERE id=$1", [
      privateVehicle,
    ]);
  await pool.query("DELETE FROM hubs WHERE id=ANY($1::uuid[])", [hubs]);
  await pool.end();
}
