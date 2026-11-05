import test from "node:test";
import assert from "node:assert/strict";
import { simulateScenario } from "../apps/api/dist/simulation/scenario.engine.js";

const limits = {
  maximumSteps: 12,
  maximumArrivalsPerStep: 10,
  minimumBatteryPercent: 20,
  maximumGeneratedRequests: 1000,
  maximumHorizonMinutes: 60,
  historyPageSize: 20,
};
const params = {
  kind: "charging_failure",
  hubId: "a",
  horizonMinutes: 20,
  stepMinutes: 5,
  seed: 27,
  baselineArrivalsPerStep: 0,
  scenarioArrivalsPerStep: 0,
  additionalOccupiedSpaces: 0,
  failedChargingPointIds: ["a-free"],
  chargingServiceMinutes: 10,
};
function fixture() {
  return {
    capturedAt: "2026-11-05T12:00:00.000Z",
    hubs: ["a", "b", "inactive"].map((id) => ({
      id,
      name: id,
      status: id === "inactive" ? "inactive" : "active",
      parking: { capacity: 6, occupied: 1, held: 1, available: 4 },
      vehicleList: [],
      chargingPoints: [],
    })),
    resources: ["a", "b", "inactive"].map((hubId) => ({
      hubId,
      eligibleVehicleIds: [],
      parkingSpaceIds: [`${hubId}-p`],
      chargingPoints: [
        { id: `${hubId}-active`, status: "occupied", activeSession: true },
        { id: `${hubId}-free`, status: "available", activeSession: false },
        { id: `${hubId}-failed`, status: "failed", activeSession: false },
      ],
      chargingQueueWaitMinutes: hubId === "a" ? [20, 10] : [],
    })),
  };
}
function freeze(v) {
  if (v && typeof v === "object") {
    Object.freeze(v);
    Object.values(v).forEach(freeze);
  }
  return v;
}
test("T27 IT-34/35: independent charging oracle includes active session, queue age, failed port and completion at horizon", () => {
  const input = freeze(fixture()),
    before = structuredClone(input);
  const result = simulateScenario(input, params, limits);
  // Baseline: active + first waiter at t=0, second waiter at t=10.
  // Scenario: only active port survives; waiters start t=10 and t=20
  // (the latter lies outside the horizon and remains queued).
  for (const [run, served, completed, queued, wait, waiting, utilization] of [
    [result.baseline, 3, 3, 0, 20, null, 50],
    [result.scenario, 2, 2, 1, 30, 30, 100 / 3],
  ]) {
    assert.equal(run.demand, 3);
    assert.equal(run.served, served);
    assert.equal(run.completed, completed);
    assert.equal(run.queued, queued);
    assert.equal(run.meanWaitMinutes, wait);
    assert.equal(run.waitingAtEndMinutes, waiting);
    assert.ok(Math.abs(run.chargingUtilizationPercent - utilization) < 1e-10);
    assert.equal(run.demand, run.served + run.queued);
    assert.equal(
      run.timeline.reduce((sum, s) => sum + s.completed, 0),
      completed,
    );
    assert.equal(
      run.timeline.reduce((sum, s) => sum + s.served, 1),
      served,
    );
    assert.ok(run.timeline.every((s) => s.availableResources >= 0));
  }
  assert.deepEqual(result, simulateScenario(input, params, limits));
  assert.deepEqual(input, before);
  assert.equal(result.impact.served, -1);
  assert.equal(result.impact.queued, 1);
  assert.equal(result.impact.meanWaitMinutes, 10);
  result.parameters.failedChargingPointIds.push("mutated");
  result.recommendations[0].quantity = 999;
  assert.deepEqual(input, before);
  assert.deepEqual(params.failedChargingPointIds, ["a-free"]);
});
test("T27 IT-35: parking/charging advice excludes inactive, occupied and failed resources and has explicit fallback", () => {
  for (const kind of ["parking_full", "charging_failure"]) {
    const input = fixture();
    const p = {
      ...params,
      kind,
      baselineArrivalsPerStep: 5,
      scenarioArrivalsPerStep: 5,
      additionalOccupiedSpaces: kind === "parking_full" ? 1 : 0,
      failedChargingPointIds:
        kind === "charging_failure" ? ["a-active", "a-free"] : [],
    };
    const result = simulateScenario(input, p, limits),
      advice = result.recommendations[0];
    assert.equal(advice.targetHubId, "b");
    assert.equal(advice.quantity, 1);
    assert.equal(
      advice.kind,
      kind === "parking_full" ? "redirect_parking" : "redirect_charging",
    );
    assert.equal(advice.snapshotCapturedAt, input.capturedAt);
    assert.equal(advice.requiresRevalidation, true);
    assert.ok(advice.reason.length > 0);
    input.resources[1].parkingSpaceIds = [];
    input.resources[1].chargingPoints.forEach((p) => (p.status = "failed"));
    const fallback = simulateScenario(input, p, limits).recommendations[0];
    assert.equal(fallback.kind, "review_capacity");
    assert.equal(fallback.targetHubId, null);
    assert.ok(fallback.quantity > 0);
  }
});
