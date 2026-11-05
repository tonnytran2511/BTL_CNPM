import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

// Runs inside the operations suite's disposable PostgreSQL database and HTTP API.
export async function checkT38({
  t,
  pool,
  fleet,
  order,
  post,
  call,
  operator,
  student,
  states,
}) {
  for (const changed of ["source", "destination"]) {
    await t.test(
      `T38 stale recommendation: ${changed} resources change before execution`,
      async () => {
        // Isolate the recommendation candidates from earlier test fixtures.
        await pool.query("UPDATE hubs SET status='inactive'");
        const f = await fleet();
        await pool.query(
          "INSERT INTO parking_spaces(hub_id,code,status) VALUES($1,'t38-a','available'),($1,'t38-b','available')",
          [f.targetHubId],
        );
        const parameters = {
          kind: "demand_surge",
          hubId: f.targetHubId,
          horizonMinutes: 60,
          stepMinutes: 5,
          seed: 42,
          baselineArrivalsPerStep: 0.2,
          scenarioArrivalsPerStep: 2,
          additionalOccupiedSpaces: 0,
          failedChargingPointIds: [],
          chargingServiceMinutes: 5,
        };
        const run = async () => {
          const response = await fetchRun(parameters);
          assert.equal(response.status, 201, JSON.stringify(response));
          return response.body;
        };
        // Use the authenticated helper, including the required idempotency header.
        const fetchRun = (body) =>
          call("POST", "/simulations/runs", operator, body, {
            "Idempotency-Key": randomUUID(),
          });
        const before = await states(f.vehicleIds);
        const original = await run();
        const rec = original.result.recommendations[0];
        assert.equal(rec.kind, "review_redistribution");
        assert.equal(rec.sourceHubId, f.sourceHubId);
        assert.equal(rec.targetHubId, f.targetHubId);
        assert.equal(rec.quantity, 2);
        assert.equal(rec.requiresRevalidation, true);
        assert.equal(
          rec.snapshotCapturedAt,
          original.result.snapshotCapturedAt,
        );
        assert.deepEqual(
          await states(f.vehicleIds),
          before,
          "simulation must not move/claim source vehicles",
        );
        const pending = await order(f);
        if (changed === "source") {
          assert.equal(
            (
              await post(
                "/vehicle-reservations",
                { vehicleId: f.vehicleIds[0] },
                student,
              )
            ).status,
            201,
          );
          const reserved = await states(f.vehicleIds);
          assert.equal(
            (await post(`/redistributions/${pending.id}/start`)).status,
            409,
          );
          assert.deepEqual(
            await states(f.vehicleIds),
            reserved,
            "failed start must not claim the remaining vehicle",
          );
          assert.equal(
            (await post("/redistributions", f)).status,
            409,
            "stale fleet must also fail when creating a new command",
          );
          const fresh = await run();
          assert.equal(
            fresh.result.recommendations[0].quantity,
            1,
            "fresh snapshot must bound advice by the remaining eligible vehicle",
          );
        } else {
          // Another operation consumes capacity after the recommendation was generated.
          await pool.query(
            "UPDATE parking_spaces SET status='held', hold_expires_at=now()+interval '2 hours' WHERE hub_id=$1",
            [f.targetHubId],
          );
          const fresh = await run();
          assert.equal(
            fresh.result.recommendations[0].kind,
            "review_capacity",
            "full destination cannot receive a redistribution recommendation",
          );
          assert.equal(
            (await post(`/redistributions/${pending.id}/start`)).status,
            201,
          );
          const inTransit = await states(f.vehicleIds);
          assert.equal(
            (await post(`/redistributions/${pending.id}/complete`)).status,
            409,
          );
          assert.deepEqual(await states(f.vehicleIds), inTransit);
          const sourceSpaces = (
            await pool.query(
              "SELECT vehicle_id FROM parking_spaces WHERE hub_id=$1 AND status='occupied' ORDER BY vehicle_id",
              [f.sourceHubId],
            )
          ).rows;
          assert.deepEqual(
            sourceSpaces.map((s) => s.vehicle_id),
            [...f.vehicleIds].sort(),
            "failed completion restores every source allocation",
          );
        }
        const status = (
          await pool.query("SELECT status FROM redistributions WHERE id=$1", [
            pending.id,
          ])
        ).rows[0].status;
        assert.equal(status, changed === "source" ? "pending" : "in_progress");
        const logs = await call("GET", "/operations/log", operator);
        assert.equal(
          logs.body.some(
            (e) => e.commandId === pending.id && e.action === "completed",
          ),
          false,
        );
        const stored = await call(
          "GET",
          `/simulations/runs/${original.id}`,
          operator,
        );
        assert.deepEqual(
          stored.body,
          original,
          "history remains evidence of its original snapshot, not live advice",
        );
      },
    );
  }
}
