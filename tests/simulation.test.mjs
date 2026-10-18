import test from "node:test";
import assert from "node:assert/strict";
import { simulateDemand } from "../apps/api/dist/simulation/simulation.engine.js";

const limits = {
  maximumSteps: 100,
  maximumArrivalsPerStep: 100,
  minimumBatteryPercent: 20,
};
const parameters = {
  hubId: "hub",
  horizonMinutes: 60,
  stepMinutes: 5,
  seed: 42,
  baselineArrivalsPerStep: 0.5,
  scenarioArrivalsPerStep: 4,
};
const snapshot = {
  capturedAt: "2026-10-17T00:00:00.000Z",
  hubs: [
    {
      id: "hub",
      name: "Test",
      status: "active",
      vehicleList: [
        { id: "a", status: "available", batteryPercent: 80 },
        { id: "b", status: "available", batteryPercent: 20 },
        { id: "c", status: "available", batteryPercent: 19 },
        { id: "d", status: "reserved", batteryPercent: 100 },
      ],
    },
  ],
};

test("T13 is reproducible, immutable, conserves vehicles and demand; higher demand cannot reduce unmet demand", () => {
  const before = structuredClone(snapshot);
  const result = simulateDemand(snapshot, parameters, limits);
  assert.deepEqual(result, simulateDemand(snapshot, parameters, limits));
  assert.deepEqual(snapshot, before);
  assert.equal(result.initialEligibleVehicles, 2);
  for (const run of [result.baseline, result.scenario]) {
    assert.equal(run.demand, run.served + run.unserved);
    assert.equal(run.served + run.remainingVehicles, 2);
    assert.equal(run.timeline.length, 12);
    assert.equal(
      run.timeline.reduce((n, s) => n + s.demand, 0),
      run.demand,
    );
    assert.ok(run.timeline.every((s) => s.availableVehicles >= 0));
  }
  assert.ok(result.scenario.demand >= result.baseline.demand);
  assert.ok(result.scenario.unserved >= result.baseline.unserved);
  const same = simulateDemand(
    snapshot,
    { ...parameters, scenarioArrivalsPerStep: 0.5 },
    limits,
  );
  assert.deepEqual(same.baseline, same.scenario);
  assert.notDeepEqual(
    result.scenario.timeline,
    simulateDemand(snapshot, { ...parameters, seed: 43 }, limits).scenario
      .timeline,
  );
});
test("T13 zero demand, empty fleet, minimum battery and invalid parameters", () => {
  const zero = simulateDemand(
    snapshot,
    {
      ...parameters,
      baselineArrivalsPerStep: 0,
      scenarioArrivalsPerStep: 0,
      seed: 0,
    },
    limits,
  );
  assert.equal(zero.scenario.demand, 0);
  assert.equal(zero.scenario.remainingVehicles, 2);
  const empty = simulateDemand(
    { ...snapshot, hubs: [{ ...snapshot.hubs[0], vehicleList: [] }] },
    parameters,
    limits,
  );
  assert.equal(empty.scenario.served, 0);
  assert.equal(empty.scenario.unserved, empty.scenario.demand);
  assert.equal(
    simulateDemand(snapshot, parameters, {
      ...limits,
      minimumBatteryPercent: 81,
    }).initialEligibleVehicles,
    0,
  );
  for (const changes of [
    { stepMinutes: 0 },
    { stepMinutes: 7 },
    { stepMinutes: 61 },
    { horizonMinutes: 505 },
    { seed: -1 },
    { seed: 2 ** 32 },
    { scenarioArrivalsPerStep: Infinity },
    { scenarioArrivalsPerStep: 101 },
    { baselineArrivalsPerStep: -1 },
    { scenarioArrivalsPerStep: 0 },
    { hubId: "unknown" },
  ])
    assert.throws(() =>
      simulateDemand(snapshot, { ...parameters, ...changes }, limits),
    );
  assert.throws(() =>
    simulateDemand(
      { ...snapshot, hubs: [{ ...snapshot.hubs[0], status: "inactive" }] },
      parameters,
      limits,
    ),
  );
});
