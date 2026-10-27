import test from "node:test";
import assert from "node:assert/strict";
import { simulateScenario } from "../apps/api/dist/simulation/scenario.engine.js";

export const limits = {
  maximumSteps: 288,
  maximumArrivalsPerStep: 1000,
  minimumBatteryPercent: 20,
  maximumGeneratedRequests: 100000,
  historyPageSize: 20,
  maximumHorizonMinutes: 10080,
};
const hub = (id) => ({
  id,
  name: id,
  status: "active",
  parking: { capacity: 4, occupied: 1, held: 0, available: 3 },
  vehicleList: [{ id: id + "v", status: "available", batteryPercent: 80 }],
  chargingPoints: [],
});
export const snapshot = {
  capturedAt: "2026-10-25T00:00:00.000Z",
  hubs: [hub("a"), hub("b")],
  resources: ["a", "b"].map((hubId) => ({
    hubId,
    eligibleVehicleIds: [hubId + "v"],
    parkingSpaceIds: [hubId + "p1", hubId + "p2", hubId + "p3"],
    chargingPoints: [
      { id: hubId + "c1", status: "available", activeSession: false },
      { id: hubId + "c2", status: "available", activeSession: false },
    ],
    chargingQueueWaitMinutes: [],
  })),
};
export const parameters = {
  kind: "demand_surge",
  hubId: "a",
  horizonMinutes: 60,
  stepMinutes: 5,
  seed: 42,
  baselineArrivalsPerStep: 0.2,
  scenarioArrivalsPerStep: 2,
  additionalOccupiedSpaces: 0,
  failedChargingPointIds: [],
  chargingServiceMinutes: 5,
};
test("T22 three scenarios produce dynamic results without modifying their snapshot", () => {
  const before = structuredClone(snapshot);
  const demand = simulateScenario(snapshot, parameters, limits);
  assert.equal(demand.baseline.demand, 6);
  assert.equal(demand.scenario.demand, 27);
  assert.equal(demand.scenario.served, 1);
  const parking = simulateScenario(
    snapshot,
    {
      ...parameters,
      kind: "parking_full",
      baselineArrivalsPerStep: 2,
      additionalOccupiedSpaces: 3,
    },
    limits,
  );
  assert.equal(parking.scenario.served, 0);
  assert.equal(parking.scenario.peakParking, 4);
  assert.ok(parking.baseline.served > parking.scenario.served);
  const charging = simulateScenario(
    snapshot,
    {
      ...parameters,
      kind: "charging_failure",
      baselineArrivalsPerStep: 2,
      failedChargingPointIds: ["ac1", "ac2"],
      chargingServiceMinutes: 10,
    },
    limits,
  );
  assert.equal(charging.scenario.served, 0);
  assert.equal(charging.scenario.queued, charging.scenario.demand);
  assert.equal(charging.scenario.meanWaitMinutes, null);
  assert.ok(charging.scenario.waitingAtEndMinutes > 0);
  assert.ok(charging.baseline.served > 0);
  assert.deepEqual(snapshot, before);
  assert.deepEqual(
    charging,
    simulateScenario(
      snapshot,
      {
        ...parameters,
        kind: "charging_failure",
        baselineArrivalsPerStep: 2,
        failedChargingPointIds: ["ac1", "ac2"],
        chargingServiceMinutes: 10,
      },
      limits,
    ),
  );
});
test("T22 validates scenario-specific resources and workload before simulation", () => {
  for (const change of [
    { kind: "unknown" },
    { stepMinutes: 7 },
    { horizonMinutes: 10085 },
    { additionalOccupiedSpaces: 1 },
    { failedChargingPointIds: ["ac1"] },
    {
      baselineArrivalsPerStep: 1000,
      scenarioArrivalsPerStep: 1000,
      horizonMinutes: 1440,
    },
  ])
    assert.throws(() =>
      simulateScenario(snapshot, { ...parameters, ...change }, limits),
    );
  assert.throws(() =>
    simulateScenario(
      snapshot,
      {
        ...parameters,
        kind: "parking_full",
        baselineArrivalsPerStep: 2,
        additionalOccupiedSpaces: 4,
      },
      limits,
    ),
  );
  assert.throws(() =>
    simulateScenario(
      snapshot,
      {
        ...parameters,
        kind: "charging_failure",
        baselineArrivalsPerStep: 2,
        failedChargingPointIds: ["bc1"],
      },
      limits,
    ),
  );
});

test("T36 known charging queue produces correct completion, utilization, served-only wait and censored wait", () => {
  const input = structuredClone(snapshot);
  input.resources[0].chargingQueueWaitMinutes = [30, 10, 0];
  const result = simulateScenario(
    input,
    {
      ...parameters,
      kind: "charging_failure",
      horizonMinutes: 20,
      baselineArrivalsPerStep: 0,
      scenarioArrivalsPerStep: 0,
      failedChargingPointIds: ["ac1"],
      chargingServiceMinutes: 10,
    },
    limits,
  );
  assert.equal(result.baseline.demand, 3);
  assert.equal(result.baseline.served, 3);
  assert.equal(result.baseline.completed, 3);
  assert.equal(result.baseline.queued, 0);
  assert.equal(result.baseline.meanWaitMinutes, 50 / 3);
  assert.equal(result.baseline.chargingUtilizationPercent, 75);
  assert.equal(result.scenario.served, 2);
  assert.equal(result.scenario.completed, 2);
  assert.equal(result.scenario.queued, 1);
  assert.equal(result.scenario.meanWaitMinutes, 25);
  assert.equal(result.scenario.waitingAtEndMinutes, 20);
  assert.equal(result.scenario.chargingUtilizationPercent, 50);
});

test("T36 failure interrupts an initial session only in copied state and preserves its outstanding demand", () => {
  const input = structuredClone(snapshot);
  input.resources[0].chargingPoints[0] = {
    id: "ac1",
    status: "occupied",
    activeSession: true,
  };
  const before = structuredClone(input);
  const result = simulateScenario(
    input,
    {
      ...parameters,
      kind: "charging_failure",
      horizonMinutes: 20,
      baselineArrivalsPerStep: 0,
      scenarioArrivalsPerStep: 0,
      failedChargingPointIds: ["ac1", "ac2"],
      chargingServiceMinutes: 10,
    },
    limits,
  );
  assert.equal(result.baseline.demand, 1);
  assert.equal(result.baseline.served, 1);
  assert.equal(result.baseline.completed, 1);
  assert.equal(result.scenario.demand, 1);
  assert.equal(result.scenario.served, 0);
  assert.equal(result.scenario.completed, 0);
  assert.equal(result.scenario.queued, 1);
  assert.equal(result.scenario.waitingAtEndMinutes, 20);
  assert.deepEqual(input, before);
});

test("T36 60 seeds preserve determinism, immutability, capacity and demand conservation across all scenarios", () => {
  const freeze = (value) => {
    if (value && typeof value === "object") {
      Object.freeze(value);
      for (const child of Object.values(value)) freeze(child);
    }
    return value;
  };
  const input = freeze(structuredClone(snapshot));
  for (let seed = 0; seed < 60; seed++)
    for (const kind of ["demand_surge", "parking_full", "charging_failure"]) {
      const p = {
        ...parameters,
        seed,
        kind,
        baselineArrivalsPerStep: 2,
        scenarioArrivalsPerStep: kind === "demand_surge" ? 4 : 2,
        additionalOccupiedSpaces: kind === "parking_full" ? 2 : 0,
        failedChargingPointIds: kind === "charging_failure" ? ["ac1"] : [],
        chargingServiceMinutes: 10,
      };
      const result = simulateScenario(input, p, limits);
      assert.deepEqual(result, simulateScenario(input, p, limits));
      for (const run of [result.baseline, result.scenario]) {
        assert.equal(run.timeline.length, 12);
        assert.equal(run.demand, run.served + run.unserved + run.queued);
        assert.ok(run.remainingResources >= 0);
        assert.ok(run.completed <= run.served);
        if (kind !== "charging_failure")
          assert.equal(
            run.initialResources - run.served,
            run.remainingResources,
          );
        if (kind === "parking_full")
          assert.ok(run.peakParking <= input.hubs[0].parking.capacity);
        if (kind === "charging_failure") {
          assert.ok(
            run.chargingUtilizationPercent >= 0 &&
              run.chargingUtilizationPercent <= 100,
          );
          assert.ok(
            run.timeline.every(
              (step) =>
                step.busyChargingPoints <= 2 && step.availableResources >= 0,
            ),
          );
          assert.equal(
            run.timeline.reduce((sum, step) => sum + step.completed, 0),
            run.completed,
          );
        }
      }
      if (kind === "demand_surge")
        assert.ok(result.scenario.unserved >= result.baseline.unserved);
      else assert.ok(result.scenario.served <= result.baseline.served);
    }
});

test("T36 recommendations stay bounded by source/target snapshot resources and disappear without a deficit", () => {
  const demand = simulateScenario(snapshot, parameters, limits);
  const recommendation = demand.recommendations[0];
  assert.equal(recommendation.kind, "review_redistribution");
  assert.equal(recommendation.sourceHubId, "b");
  assert.equal(recommendation.targetHubId, "a");
  assert.equal(recommendation.quantity, 1);
  assert.equal(recommendation.requiresRevalidation, true);
  assert.equal(recommendation.snapshotCapturedAt, snapshot.capturedAt);
  const full = structuredClone(snapshot);
  full.resources[0].parkingSpaceIds = [];
  assert.equal(
    simulateScenario(full, parameters, limits).recommendations[0].kind,
    "review_capacity",
  );
  const unavailable = structuredClone(snapshot);
  unavailable.hubs[1].status = "inactive";
  assert.equal(
    simulateScenario(unavailable, parameters, limits).recommendations[0].kind,
    "review_capacity",
  );
  const zero = simulateScenario(
    snapshot,
    { ...parameters, baselineArrivalsPerStep: 0, scenarioArrivalsPerStep: 0 },
    limits,
  );
  assert.equal(zero.recommendations.length, 0);
  assert.equal(zero.scenario.remainingResources, 1);
});

test("T36 empty fleet, minimum battery, zero charger service samples and invalid edge inputs", () => {
  const empty = structuredClone(snapshot);
  empty.resources[0].eligibleVehicleIds = [];
  empty.hubs[0].vehicleList = [];
  const result = simulateScenario(empty, parameters, limits);
  assert.equal(result.scenario.served, 0);
  assert.equal(result.scenario.demand, result.scenario.unserved);
  const battery = structuredClone(snapshot);
  battery.hubs[0].vehicleList[0].batteryPercent = 19;
  assert.equal(
    simulateScenario(battery, parameters, limits).scenario.served,
    0,
  );
  battery.hubs[0].vehicleList[0].batteryPercent = 20;
  assert.equal(
    simulateScenario(battery, parameters, limits).scenario.served,
    1,
  );
  const noDemand = simulateScenario(
    snapshot,
    {
      ...parameters,
      kind: "charging_failure",
      baselineArrivalsPerStep: 0,
      scenarioArrivalsPerStep: 0,
      failedChargingPointIds: ["ac1"],
    },
    limits,
  );
  assert.equal(noDemand.scenario.meanWaitMinutes, null);
  assert.equal(noDemand.scenario.waitingAtEndMinutes, null);
  assert.equal(noDemand.scenario.chargingUtilizationPercent, 0);
  for (const change of [
    { seed: -1 },
    { seed: 4294967296 },
    { seed: 0.5 },
    { horizonMinutes: 0 },
    { stepMinutes: 0 },
    { baselineArrivalsPerStep: NaN },
    { scenarioArrivalsPerStep: Infinity },
    { kind: "parking_full", additionalOccupiedSpaces: 0 },
    { kind: "charging_failure", failedChargingPointIds: ["ac1", "ac1"] },
    { chargingServiceMinutes: 7 },
  ])
    assert.throws(() =>
      simulateScenario(snapshot, { ...parameters, ...change }, limits),
    );
  const inactive = structuredClone(snapshot);
  inactive.hubs[0].status = "inactive";
  assert.throws(() => simulateScenario(inactive, parameters, limits));
  const failed = structuredClone(snapshot);
  failed.resources[0].chargingPoints[0].status = "failed";
  assert.throws(() =>
    simulateScenario(
      failed,
      {
        ...parameters,
        kind: "charging_failure",
        baselineArrivalsPerStep: 2,
        failedChargingPointIds: ["ac1"],
      },
      limits,
    ),
  );
  assert.doesNotThrow(() =>
    simulateScenario(snapshot, { ...parameters, seed: 4294967295 }, limits),
  );
});
