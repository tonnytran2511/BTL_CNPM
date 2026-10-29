import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

// T23/T29: one integrated HTTP/DB workflow. Fixtures exist only in the
// foundation suite's disposable cluster; production state is never used.
export async function checkRelease({ t, request, pool, operator, student }) {
  const missing = randomUUID();
  const post = async (
    path,
    body = {},
    cookie = operator.cookie,
    key = randomUUID(),
  ) =>
    request(path, {
      method: "POST",
      cookie,
      body,
      headers: { "Idempotency-Key": key },
    });
  const get = (path, cookie = operator.cookie) => request(path, { cookie });
  const ok = (response, status = 201) => {
    assert.equal(response.status, status, JSON.stringify(response.body));
    return response.body;
  };
  await t.test(
    "T29 all operator route families reject anonymous/student before mutation",
    async () => {
      const routes = [
        ["GET", "/network/overview"],
        ["GET", "/simulation/snapshot"],
        ["GET", "/simulations/config"],
        ["GET", "/simulations/scenario-config"],
        ["GET", "/simulations/runs"],
        ["GET", `/simulations/runs/${missing}`],
        ["POST", "/simulations/demand-surge"],
        ["POST", "/simulations/runs"],
        ["POST", "/hubs"],
        ["PATCH", `/hubs/${missing}`],
        ["DELETE", `/hubs/${missing}`],
        ["PUT", `/hubs/${missing}/parking-capacity`],
        ["POST", `/hubs/${missing}/charging-points`],
        ["DELETE", `/hubs/${missing}/charging-points/${missing}`],
        ["GET", "/incidents"],
        ["POST", "/incidents"],
        ["POST", `/incidents/${missing}/resolve`],
        ["GET", "/operations/log"],
        ["GET", "/redistributions"],
        ["POST", "/redistributions"],
        ...["start", "complete", "cancel"].map((action) => [
          "POST",
          `/redistributions/${missing}/${action}`,
        ]),
        ["GET", "/mobility/charging/overview"],
        ["POST", "/mobility/charging/schedule"],
        ...["start", "complete", "cancel"].map((action) => [
          "POST",
          `/mobility/charging/sessions/${missing}/${action}`,
        ]),
        ["POST", `/mobility/charging/requests/${missing}/cancel`],
        ["GET", "/mobility/charging/points"],
        ["POST", `/mobility/charging/points/${missing}/fail`],
        ["POST", `/mobility/charging/points/${missing}/recover`],
      ];
      for (const [method, path] of routes) {
        for (const [cookie, expected] of [
          [undefined, 401],
          [student.cookie, 403],
        ]) {
          const response = await request(path, {
            method,
            cookie,
            ...(method === "GET" ? {} : { body: {} }),
          });
          assert.equal(response.status, expected, `${method} ${path}`);
          assert.equal(response.body.statusCode, expected);
          assert.equal(typeof response.body.code, "string");
          assert.equal(typeof response.body.message, "string");
        }
      }
    },
  );

  let source, target, vehicle, trip, run;
  await t.test(
    "T23 rental return, charging interruption/recovery and redistribution share the same vehicle",
    async () => {
      const createHub = async () => {
        const code = `R${randomUUID().replaceAll("-", "").slice(0, 20)}`;
        return ok(
          await post("/hubs", {
            code,
            name: code,
            location: "Isolated release fixture",
          }),
        );
      };
      source = await createHub();
      target = await createHub();
      for (const hub of [source, target])
        ok(
          await request(`/hubs/${hub.id}/parking-capacity`, {
            method: "PUT",
            cookie: operator.cookie,
            body: { capacity: 2 },
          }),
          200,
        );
      const point = ok(
        await post(`/hubs/${target.id}/charging-points`, {
          code: "release-point",
        }),
      );
      // There is no fleet-creation API: provision only the fixture through SQL.
      vehicle = (
        await pool.query(
          `INSERT INTO vehicles(code,hub_id,type,battery_percent,status)
      VALUES($1,$2,'electric_bicycle',60,'available') RETURNING id,code`,
          [randomUUID(), source.id],
        )
      ).rows[0];
      await pool.query(
        `UPDATE parking_spaces SET status='occupied',vehicle_id=$2
      WHERE id=(SELECT id FROM parking_spaces WHERE hub_id=$1 ORDER BY id LIMIT 1)`,
        [source.id, vehicle.id],
      );
      const reservation = ok(
        await post(
          "/vehicle-reservations",
          { vehicleId: vehicle.id },
          student.cookie,
        ),
      );
      trip = ok(
        await post(
          `/vehicle-reservations/${reservation.id}/pickup`,
          {},
          student.cookie,
        ),
        200,
      );
      const returnKey = randomUUID();
      const returned = ok(
        await post(
          `/trips/${trip.id}/return`,
          { targetHubId: target.id },
          student.cookie,
          returnKey,
        ),
        200,
      );
      assert.equal(returned.status, "completed");
      assert.deepEqual(
        ok(
          await post(
            `/trips/${trip.id}/return`,
            { targetHubId: target.id },
            student.cookie,
            returnKey,
          ),
          200,
        ),
        returned,
      );
      const charge = ok(
        await post("/mobility/charging/requests", {
          hubId: target.id,
          vehicle: { kind: "rental", id: vehicle.id },
          targetBatteryPercent: 90,
        }),
      );
      const scheduled = ok(
        await post("/mobility/charging/schedule", { hubId: target.id }),
      );
      assert.equal(scheduled.sessions.length, 1);
      const session = scheduled.sessions[0];
      ok(await post(`/mobility/charging/sessions/${session.id}/start`));
      assert.equal(
        (
          await post(
            "/vehicle-reservations",
            { vehicleId: vehicle.id },
            student.cookie,
          )
        ).status,
        409,
      );
      const failure = ok(
        await post(`/mobility/charging/points/${point.id}/fail`, {
          description: "Release test interruption",
          sessionId: session.id,
          achievedBatteryPercent: 70,
        }),
      );
      assert.equal(failure.interruptedSessionId, session.id);
      assert.equal(failure.requestStatus, "queued");
      assert.equal(
        ok(await post("/mobility/charging/schedule", { hubId: target.id }))
          .sessions.length,
        0,
      );
      ok(await post(`/mobility/charging/points/${point.id}/recover`));
      const resumed = ok(
        await post("/mobility/charging/schedule", { hubId: target.id }),
      ).sessions[0];
      assert.ok(resumed);
      assert.notEqual(resumed.id, session.id);
      ok(await post(`/mobility/charging/sessions/${resumed.id}/start`));
      const completeKey = randomUUID();
      const complete = ok(
        await post(
          `/mobility/charging/sessions/${resumed.id}/complete`,
          { achievedBatteryPercent: 90 },
          operator.cookie,
          completeKey,
        ),
      );
      assert.deepEqual(
        ok(
          await post(
            `/mobility/charging/sessions/${resumed.id}/complete`,
            { achievedBatteryPercent: 90 },
            operator.cookie,
            completeKey,
          ),
        ),
        complete,
      );
      assert.equal(complete.status, "completed");
      assert.equal(
        (
          await pool.query("SELECT status FROM charging_requests WHERE id=$1", [
            charge.id,
          ])
        ).rows[0].status,
        "fulfilled",
      );
      const order = ok(
        await post("/redistributions", {
          sourceHubId: target.id,
          targetHubId: source.id,
          vehicleIds: [vehicle.id],
        }),
      );
      ok(await post(`/redistributions/${order.id}/start`));
      assert.equal(
        (
          await post(
            "/vehicle-reservations",
            { vehicleId: vehicle.id },
            student.cookie,
          )
        ).status,
        409,
      );
      assert.equal(
        ok(await post(`/redistributions/${order.id}/complete`)).status,
        "completed",
      );
      const stored = (
        await pool.query(
          "SELECT hub_id,status,battery_percent FROM vehicles WHERE id=$1",
          [vehicle.id],
        )
      ).rows[0];
      assert.deepEqual(stored, {
        hub_id: source.id,
        status: "available",
        battery_percent: 90,
      });
      const spaces = (
        await pool.query(
          "SELECT hub_id FROM parking_spaces WHERE vehicle_id=$1",
          [vehicle.id],
        )
      ).rows;
      assert.deepEqual(spaces, [{ hub_id: source.id }]);
      const hubs = ok(await get("/hubs"), 200);
      assert.equal(hubs.find((h) => h.id === source.id).parking.occupied, 1);
      assert.equal(hubs.find((h) => h.id === target.id).parking.occupied, 0);
      const logs = ok(await get("/operations/log"), 200).filter(
        (log) => log.commandId === order.id,
      );
      assert.deepEqual(logs.map((log) => log.action).sort(), [
        "completed",
        "created",
        "started",
      ]);
      assert.ok(
        logs.every(
          (log) =>
            log.actorId === operator.body.id && Date.parse(log.occurredAt),
        ),
      );
    },
  );

  await t.test(
    "T29 saved simulation remains read-only and stale dispatch is revalidated",
    async () => {
      assert.ok(
        source && target && vehicle,
        "release workflow must have completed",
      );
      const state = async () =>
        (
          await pool.query(
            `SELECT v.id,v.hub_id,v.status,v.battery_percent,p.id space_id
      FROM vehicles v LEFT JOIN parking_spaces p ON p.vehicle_id=v.id WHERE v.id=$1`,
            [vehicle.id],
          )
        ).rows;
      const before = await state();
      run = ok(
        await post("/simulations/runs", {
          kind: "demand_surge",
          hubId: target.id,
          horizonMinutes: 60,
          stepMinutes: 5,
          seed: 42,
          baselineArrivalsPerStep: 0.2,
          scenarioArrivalsPerStep: 2,
          additionalOccupiedSpaces: 0,
          failedChargingPointIds: [],
          chargingServiceMinutes: 5,
        }),
      );
      assert.deepEqual(await state(), before);
      const pending = ok(
        await post("/redistributions", {
          sourceHubId: source.id,
          targetHubId: target.id,
          vehicleIds: [vehicle.id],
        }),
      );
      const reservation = ok(
        await post(
          "/vehicle-reservations",
          { vehicleId: vehicle.id },
          student.cookie,
        ),
      );
      assert.equal(
        (await post(`/redistributions/${pending.id}/start`)).status,
        409,
      );
      assert.equal(
        (
          await pool.query("SELECT status FROM redistributions WHERE id=$1", [
            pending.id,
          ])
        ).rows[0].status,
        "pending",
      );
      assert.deepEqual(ok(await get(`/simulations/runs/${run.id}`), 200), run);
      ok(
        await post(
          `/vehicle-reservations/${reservation.id}/cancel`,
          {},
          student.cookie,
        ),
        200,
      );
      ok(await post(`/redistributions/${pending.id}/start`));
      ok(
        await request(`/hubs/${target.id}/parking-capacity`, {
          method: "PUT",
          cookie: operator.cookie,
          body: { capacity: 0 },
        }),
        200,
      );
      const moving = await state();
      assert.equal(
        (await post(`/redistributions/${pending.id}/complete`)).status,
        409,
      );
      assert.deepEqual(await state(), moving);
      assert.ok(
        !ok(await get("/operations/log"), 200).some(
          (log) => log.commandId === pending.id && log.action === "completed",
        ),
      );
      ok(
        await request(`/hubs/${target.id}/parking-capacity`, {
          method: "PUT",
          cookie: operator.cookie,
          body: { capacity: 1 },
        }),
        200,
      );
      ok(await post(`/redistributions/${pending.id}/complete`));
      assert.equal((await state())[0].hub_id, target.id);
    },
  );
}
