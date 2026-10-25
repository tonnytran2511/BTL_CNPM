import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

export async function checkScenarios({
  request,
  pool,
  operator,
  student,
  hubs,
}) {
  const hub = hubs.find(
    (h) =>
      h.status === "active" &&
      h.parking.available > 0 &&
      h.charging.available > 0,
  );
  assert.ok(hub);
  const points = (
    await pool.query(
      "SELECT id FROM charging_points WHERE hub_id=$1 AND status='available' ORDER BY id",
      [hub.id],
    )
  ).rows;
  const base = {
    kind: "demand_surge",
    hubId: hub.id,
    horizonMinutes: 60,
    stepMinutes: 5,
    seed: 42,
    baselineArrivalsPerStep: 0.2,
    scenarioArrivalsPerStep: 2,
    additionalOccupiedSpaces: 0,
    failedChargingPointIds: [],
    chargingServiceMinutes: 5,
  };
  const run = (body = base, key = randomUUID(), cookie = operator.cookie) =>
    request("/simulations/runs", {
      method: "POST",
      cookie,
      body,
      headers: { "Idempotency-Key": key },
    });
  for (const path of ["/simulations/runs", "/simulations/scenario-config"]) {
    assert.equal((await request(path)).status, 401);
    assert.equal((await request(path, { cookie: student.cookie })).status, 403);
  }
  assert.equal((await run(base, randomUUID(), student.cookie)).status, 403);
  assert.equal(
    (
      await request("/simulations/runs", {
        method: "POST",
        cookie: operator.cookie,
        body: base,
      })
    ).status,
    400,
  );
  const capture = async () => {
    const names = [
      "hubs",
      "vehicles",
      "parking_spaces",
      "parking_bookings",
      "charging_points",
      "charging_requests",
      "charging_sessions",
      "vehicle_reservations",
      "trips",
      "redistributions",
      "incidents",
      "operation_logs",
    ];
    const state = {};
    for (const name of names)
      state[name] = (
        await pool.query(`SELECT * FROM ${name} ORDER BY id`)
      ).rows;
    return state;
  };
  const before = await capture();
  const key = randomUUID();
  const [first, concurrent] = await Promise.all([
    run(base, key),
    run(base, key),
  ]);
  assert.equal(first.status, 201, JSON.stringify(first.body));
  assert.deepEqual(concurrent.body, first.body);
  assert.equal(first.body.createdBy, operator.body.id);
  assert.equal(first.body.result.modelVersion, "resource-flow-v1");
  const id = first.body.id;
  assert.deepEqual((await run(base, key)).body, first.body);
  assert.equal((await run({ ...base, seed: 43 }, key)).status, 409);
  assert.equal(
    Number(
      (
        await pool.query(
          "SELECT count(*) FROM simulation_runs WHERE idempotency_key=$1",
          [key],
        )
      ).rows[0].count,
    ),
    1,
  );
  const parking = await run({
    ...base,
    kind: "parking_full",
    baselineArrivalsPerStep: 2,
    additionalOccupiedSpaces: 1,
  });
  assert.equal(parking.status, 201, JSON.stringify(parking.body));
  const charging = await run({
    ...base,
    kind: "charging_failure",
    baselineArrivalsPerStep: 2,
    failedChargingPointIds: [points[0].id],
    chargingServiceMinutes: 15,
  });
  assert.equal(charging.status, 201, JSON.stringify(charging.body));
  assert.deepEqual(await capture(), before);
  const original = (
    await pool.query(
      "SELECT value FROM settings WHERE key='simulationHistoryPageSize'",
    )
  ).rows[0].value;
  await pool.query(
    "UPDATE settings SET value='2' WHERE key='simulationHistoryPageSize'",
  );
  try {
    const page = await request("/simulations/runs", {
      cookie: operator.cookie,
    });
    assert.equal(page.body.items.length, 2);
    assert.ok(page.body.nextBefore);
    const next = await request(
      `/simulations/runs?before=${page.body.nextBefore}`,
      { cookie: operator.cookie },
    );
    assert.ok(next.body.items.some((item) => item.id === id));
    assert.ok(
      next.body.items.every(
        (item) => !page.body.items.some((old) => old.id === item.id),
      ),
    );
  } finally {
    await pool.query(
      "UPDATE settings SET value=$1 WHERE key='simulationHistoryPageSize'",
      [JSON.stringify(original)],
    );
  }
  assert.deepEqual(
    (await request(`/simulations/runs/${id}`, { cookie: operator.cookie }))
      .body,
    first.body,
  );
  assert.equal(
    (await request(`/simulations/runs/${id}`, { cookie: student.cookie }))
      .status,
    403,
  );
  assert.equal(
    (
      await request(`/simulations/runs/${randomUUID()}`, {
        cookie: operator.cookie,
      })
    ).status,
    404,
  );
  assert.equal(
    (await request("/simulations/runs?before=bad", { cookie: operator.cookie }))
      .status,
    400,
  );
  for (const change of [
    { stepMinutes: 7 },
    { seed: "42" },
    { kind: "other" },
    { role: "operator" },
    { snapshot: {} },
    { additionalOccupiedSpaces: -1 },
    { failedChargingPointIds: ["bad"] },
    { kind: "charging_failure", failedChargingPointIds: [randomUUID()] },
    {
      kind: "parking_full",
      baselineArrivalsPerStep: 2,
      additionalOccupiedSpaces: 9999,
    },
  ])
    assert.equal(
      (await run({ ...base, ...change })).status,
      400,
      JSON.stringify(change),
    );
  const saved = await pool.query(
    "SELECT snapshot FROM simulation_runs WHERE id=$1",
    [id],
  );
  assert.ok(saved.rows[0].snapshot.resources.length);
  // Stored evidence survives live Hub metadata changes and uses the original snapshot.
  const name = (await pool.query("SELECT name FROM hubs WHERE id=$1", [hub.id]))
    .rows[0].name;
  try {
    await pool.query(
      "UPDATE hubs SET name='Changed after simulation' WHERE id=$1",
      [hub.id],
    );
    assert.deepEqual(
      (await request(`/simulations/runs/${id}`, { cookie: operator.cookie }))
        .body,
      first.body,
    );
  } finally {
    await pool.query("UPDATE hubs SET name=$2 WHERE id=$1", [hub.id, name]);
  }
  // The snapshot excludes physical free spaces promised to a future booking.
  const projected = saved.rows[0].snapshot.resources.find(
    (r) => r.hubId === hub.id,
  ).parkingSpaceIds;
  const conflicts = (
    await pool.query(
      `SELECT DISTINCT parking_space_id FROM parking_bookings
    WHERE status IN ('reserved','checked_in') AND starts_at < $1::timestamptz + interval '60 minutes'
    AND ends_at > $1::timestamptz`,
      [first.body.result.snapshotCapturedAt],
    )
  ).rows;
  assert.ok(
    conflicts.every((row) => !projected.includes(row.parking_space_id)),
  );
  // T36 fixtures live only in this isolated test DB.
  const space = projected[0];
  assert.ok(space);
  const vehicle = await pool.query(
    "INSERT INTO private_vehicles(owner_id,code,type,battery_percent) VALUES($1,$2,'electric_bicycle',40) RETURNING id",
    [student.body.id, `T36-${randomUUID()}`],
  );
  let bookingId, pointIncidentId, fleetIncidentId;
  try {
    bookingId = (
      await pool.query(
        `INSERT INTO parking_bookings(user_id,private_vehicle_id,parking_space_id,starts_at,ends_at)
      VALUES($1,$2,$3,clock_timestamp()+interval '10 minutes',clock_timestamp()+interval '20 minutes') RETURNING id`,
        [student.body.id, vehicle.rows[0].id, space],
      )
    ).rows[0].id;
    pointIncidentId = (
      await pool.query(
        "INSERT INTO incidents(resource_type,resource_id,description,reported_by) VALUES('charging_point',$1,'T36 projection fixture',$2) RETURNING id",
        [points[0].id, operator.body.id],
      )
    ).rows[0].id;
    const fleet = saved.rows[0].snapshot.resources.find(
      (r) => r.hubId === hub.id,
    ).eligibleVehicleIds[0];
    if (fleet)
      fleetIncidentId = (
        await pool.query(
          "INSERT INTO incidents(resource_type,resource_id,description,reported_by) VALUES('vehicle',$1,'T36 fleet fixture',$2) RETURNING id",
          [fleet, operator.body.id],
        )
      ).rows[0].id;
    const evidence = await capture();
    const check = await run();
    assert.equal(check.status, 201, JSON.stringify(check.body));
    const stored = (
      await pool.query("SELECT snapshot FROM simulation_runs WHERE id=$1", [
        check.body.id,
      ])
    ).rows[0].snapshot.resources.find((r) => r.hubId === hub.id);
    assert.ok(!stored.parkingSpaceIds.includes(space));
    assert.equal(
      stored.chargingPoints.find((p) => p.id === points[0].id).status,
      "failed",
    );
    if (fleet) assert.ok(!stored.eligibleVehicleIds.includes(fleet));
    assert.equal(
      (
        await run({
          ...base,
          kind: "charging_failure",
          baselineArrivalsPerStep: 2,
          failedChargingPointIds: [points[0].id],
        })
      ).status,
      400,
    );
    assert.deepEqual(await capture(), evidence);
  } finally {
    if (bookingId)
      await pool.query("DELETE FROM parking_bookings WHERE id=$1", [bookingId]);
    for (const incidentId of [pointIncidentId, fleetIncidentId])
      if (incidentId)
        await pool.query("DELETE FROM incidents WHERE id=$1", [incidentId]);
    await pool.query("DELETE FROM private_vehicles WHERE id=$1", [
      vehicle.rows[0].id,
    ]);
  }
}
