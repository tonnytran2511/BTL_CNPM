import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { simulateScenario } from "../apps/api/dist/simulation/scenario.engine.js";

// Invoked exclusively inside foundation's disposable PostgreSQL/HTTP harness.
export async function checkT27({ t, request, pool, operator, student }) {
  const post = (path, body, cookie = operator.cookie, key = randomUUID()) =>
    request(path, {
      method: "POST",
      body,
      cookie,
      headers: { "Idempotency-Key": key },
    });
  const ok = (r, status = 201) => {
    assert.equal(r.status, status, JSON.stringify(r.body));
    return r.body;
  };
  // Capture every public base table except auth bookkeeping and the intentional
  // simulation output. This includes private vehicles, settings and retry rows.
  const capture = async () => {
    const tables = (
      await pool.query(`SELECT tablename FROM pg_tables
      WHERE schemaname='public' AND tablename NOT IN
      ('sessions','login_attempts','simulation_runs') ORDER BY tablename`)
    ).rows;
    const state = {};
    for (const { tablename } of tables) {
      const quoted = '"' + tablename.replaceAll('"', '""') + '"';
      state[tablename] = (
        await pool.query(
          `SELECT row_to_json(t) AS row FROM ${quoted} t ORDER BY row_to_json(t)::text`,
        )
      ).rows;
    }
    return state;
  };
  const digest = (value) =>
    createHash("sha256").update(JSON.stringify(value)).digest("hex");
  const hub = ok(
    await post("/hubs", {
      code: `T27-${randomUUID().slice(0, 8)}`,
      name: "T27 isolated fixture",
      location: "Temporary test database",
    }),
  );
  ok(
    await request(`/hubs/${hub.id}/parking-capacity`, {
      method: "PUT",
      cookie: operator.cookie,
      body: { capacity: 6 },
    }),
    200,
  );
  const points = [];
  for (let i = 0; i < 3; i++)
    points.push(
      ok(await post(`/hubs/${hub.id}/charging-points`, { code: `T27-C${i}` }))
        .id,
    );
  const car = ok(
    await post(
      "/mobility/private-vehicles",
      {
        code: `T27-${randomUUID().slice(0, 8)}`,
        type: "electric_bicycle",
        batteryPercent: 30,
      },
      student.cookie,
    ),
  );
  // One future booking, a live hold and an expired hold. Fixture writes are
  // confined to the temporary DB, before taking the isolation baseline.
  const spaces = (
    await pool.query(
      "SELECT id FROM parking_spaces WHERE hub_id=$1 ORDER BY id",
      [hub.id],
    )
  ).rows.map((r) => r.id);
  await pool.query(
    `INSERT INTO parking_bookings(user_id,private_vehicle_id,parking_space_id,starts_at,ends_at)
    VALUES($1,$2,$3,now()+interval '10 minutes',now()+interval '20 minutes')`,
    [student.body.id, car.id, spaces[0]],
  );
  await pool.query(
    `UPDATE parking_spaces SET status='held',hold_expires_at=now()+interval '2 hours' WHERE id=$1`,
    [spaces[1]],
  );
  await pool.query(
    `UPDATE parking_spaces SET status='held',hold_expires_at=now()-interval '1 minute' WHERE id=$1`,
    [spaces[2]],
  );
  await pool.query(`UPDATE charging_points SET status='failed' WHERE id=$1`, [
    points[0],
  ]);
  await pool.query(
    `INSERT INTO incidents(resource_type,resource_id,description,reported_by) VALUES('charging_point',$1,'T27 open incident projection',$2)`,
    [points[1], operator.body.id],
  );
  const base = {
    kind: "demand_surge",
    hubId: hub.id,
    horizonMinutes: 20,
    stepMinutes: 5,
    seed: 27,
    baselineArrivalsPerStep: 2,
    scenarioArrivalsPerStep: 2,
    additionalOccupiedSpaces: 0,
    failedChargingPointIds: [],
    chargingServiceMinutes: 10,
  };
  let savedParking;
  await t.test(
    "T27 IT-33/35: HTTP projection excludes bookings, live holds and failed/open-incident chargers; all operational tables unchanged",
    async () => {
      const before = await capture();
      for (const changes of [
        {},
        { kind: "parking_full", additionalOccupiedSpaces: 4 },
        { kind: "charging_failure", failedChargingPointIds: [points[2]] },
      ]) {
        const saved = ok(
          await post("/simulations/runs", { ...base, ...changes }),
        );
        const row = (
          await pool.query("SELECT snapshot FROM simulation_runs WHERE id=$1", [
            saved.id,
          ])
        ).rows[0];
        const resources = row.snapshot.resources.find(
          (r) => r.hubId === hub.id,
        );
        assert.deepEqual(resources.parkingSpaceIds, spaces.slice(2));
        assert.deepEqual(
          resources.chargingPoints
            .filter((p) => p.status === "failed")
            .map((p) => p.id)
            .sort(),
          points.slice(0, 2).sort(),
        );
        assert.deepEqual(
          saved.result,
          simulateScenario(
            row.snapshot,
            saved.result.parameters,
            saved.result.limits,
          ),
        );
        assert.deepEqual(await capture(), before);
        if (changes.kind === "parking_full") {
          savedParking = saved;
          assert.equal(saved.result.baseline.initialResources, 4);
          assert.equal(saved.result.scenario.initialResources, 0);
          assert.equal(saved.result.scenario.served, 0);
          assert.equal(saved.result.scenario.peakParking, 5); // live hold + four modeled spaces, not the future booking
        }
        if (changes.kind === "charging_failure") {
          assert.equal(saved.result.baseline.initialResources, 1);
          assert.equal(saved.result.scenario.initialResources, 0);
          assert.equal(saved.result.scenario.served, 0);
          assert.equal(
            saved.result.scenario.queued,
            saved.result.scenario.demand,
          );
          assert.equal(saved.result.scenario.chargingUtilizationPercent, 0);
        }
        for (const metric of ["served", "unserved", "queued"])
          assert.equal(
            saved.result.impact[metric],
            saved.result.scenario[metric] - saved.result.baseline[metric],
          );
      }
      console.log(
        `T27 operational tables=${Object.keys(before).length}; before/after SHA256=${digest(before)}`,
      );
    },
  );
  await t.test(
    "T27 IT-32: HTTP invalid resources/time rejected without simulation history or operational writes",
    async () => {
      const before = await capture();
      const count = (await pool.query("SELECT count(*) FROM simulation_runs"))
        .rows[0].count;
      for (const changes of [
        { stepMinutes: 0 },
        { stepMinutes: 7 },
        { kind: "parking_full", additionalOccupiedSpaces: 5 },
        { kind: "charging_failure", failedChargingPointIds: [points[0]] },
        { kind: "charging_failure", failedChargingPointIds: [points[1]] },
      ])
        ok(await post("/simulations/runs", { ...base, ...changes }), 400);
      assert.equal(
        (await pool.query("SELECT count(*) FROM simulation_runs")).rows[0]
          .count,
        count,
      );
      assert.deepEqual(await capture(), before);
    },
  );
  await t.test(
    "T27 IT-33/35: old report remains immutable after real booking consumes a modeled free space",
    async () => {
      const advice = savedParking.result.recommendations[0];
      assert.ok(advice.reason.length > 0);
      assert.equal(advice.requiresRevalidation, true);
      const before = await capture();
      assert.deepEqual(
        ok(
          await request(`/simulations/runs/${savedParking.id}`, {
            cookie: operator.cookie,
          }),
          200,
        ),
        savedParking,
      );
      assert.deepEqual(await capture(), before);
      // Real booking consumes a previously modeled free space; new snapshot
      // must change while the historical report remains byte-for-byte stable.
      const other = ok(
        await post(
          "/mobility/private-vehicles",
          {
            code: `T27-${randomUUID().slice(0, 8)}`,
            type: "electric_bicycle",
            batteryPercent: 40,
          },
          student.cookie,
        ),
      );
      ok(
        await post(
          "/mobility/parking/bookings",
          {
            hubId: hub.id,
            privateVehicleId: other.id,
            startsAt: new Date(Date.now() + 60000).toISOString(),
            endsAt: new Date(Date.now() + 900000).toISOString(),
          },
          student.cookie,
        ),
      );
      const current = await capture();
      const fresh = ok(
        await post("/simulations/runs", {
          ...base,
          kind: "parking_full",
          additionalOccupiedSpaces: 3,
        }),
      );
      assert.equal(fresh.result.baseline.initialResources, 3);
      assert.deepEqual(
        ok(
          await request(`/simulations/runs/${savedParking.id}`, {
            cookie: operator.cookie,
          }),
          200,
        ),
        savedParking,
      );
      assert.deepEqual(await capture(), current);
    },
  );
  await t.test(
    "T27 IT-36: dispatch from actual recommendation revalidates reserved source and full destination",
    async () => {
      const makeHub = async () => {
        const id = ok(
          await post("/hubs", {
            code: `T27-${randomUUID().slice(0, 8)}`,
            name: "T27 stale advice",
            location: "Temporary database",
          }),
        ).id;
        ok(
          await request(`/hubs/${id}/parking-capacity`, {
            method: "PUT",
            cookie: operator.cookie,
            body: { capacity: 1 },
          }),
          200,
        );
        return id;
      };
      const source =
        "00000000-0000-4000-8000-" +
        randomUUID().replaceAll("-", "").slice(0, 12);
      await pool.query(
        "INSERT INTO hubs(id,code,name,location) VALUES($1,$2,'T27 advice source','Temporary database')",
        [source, randomUUID()],
      );
      ok(
        await request(`/hubs/${source}/parking-capacity`, {
          method: "PUT",
          cookie: operator.cookie,
          body: { capacity: 1 },
        }),
        200,
      );
      const target = await makeHub();
      const vehicle = (
        await pool.query(
          "INSERT INTO vehicles(code,hub_id,type,battery_percent,status) VALUES($1,$2,'electric_bicycle',80,'available') RETURNING id",
          [randomUUID(), source],
        )
      ).rows[0].id;
      await pool.query(
        "UPDATE parking_spaces SET status='occupied',vehicle_id=$2 WHERE hub_id=$1",
        [source, vehicle],
      );
      // Stable low UUID selects this donor before the seed Hubs.
      const run = ok(
        await post("/simulations/runs", { ...base, hubId: target }),
      );
      const advice = run.result.recommendations[0];
      assert.equal(advice.kind, "review_redistribution");
      assert.equal(advice.sourceHubId, source);
      assert.equal(advice.targetHubId, target);
      assert.equal(advice.quantity, 1);
      const order = ok(
        await post("/redistributions", {
          sourceHubId: advice.sourceHubId,
          targetHubId: advice.targetHubId,
          vehicleIds: [vehicle],
        }),
      );
      const reservation = ok(
        await post(
          "/vehicle-reservations",
          { vehicleId: vehicle },
          student.cookie,
        ),
      );
      const before = await capture();
      ok(await post(`/redistributions/${order.id}/start`, {}), 409);
      assert.deepEqual(await capture(), before);
      ok(
        await post(
          `/vehicle-reservations/${reservation.id}/cancel`,
          {},
          student.cookie,
        ),
        200,
      );
      ok(await post(`/redistributions/${order.id}/start`, {}));
      ok(
        await request(`/hubs/${target}/parking-capacity`, {
          method: "PUT",
          cookie: operator.cookie,
          body: { capacity: 0 },
        }),
        200,
      );
      const moving = await capture();
      ok(await post(`/redistributions/${order.id}/complete`, {}), 409);
      assert.deepEqual(await capture(), moving);
      assert.deepEqual(
        ok(
          await request(`/simulations/runs/${run.id}`, {
            cookie: operator.cookie,
          }),
          200,
        ),
        run,
      );
      assert.equal(
        (
          await pool.query("SELECT status FROM redistributions WHERE id=$1", [
            order.id,
          ])
        ).rows[0].status,
        "in_progress",
      );
    },
  );
}
