import type {
  DemandRun,
  DemandSimulationRequest,
  DemandSimulationResult,
  SimulationLimits,
  SimulationSnapshot,
} from "@emobility/contracts";

/** Pure domain validation, also used before loading the operational snapshot. */
export function validateDemandParameters(
  p: DemandSimulationRequest,
  limits: SimulationLimits,
) {
  if (
    !Number.isSafeInteger(p.horizonMinutes) ||
    p.horizonMinutes <= 0 ||
    !Number.isSafeInteger(p.stepMinutes) ||
    p.stepMinutes <= 0 ||
    p.stepMinutes > p.horizonMinutes ||
    p.horizonMinutes % p.stepMinutes !== 0 ||
    p.horizonMinutes / p.stepMinutes > limits.maximumSteps
  )
    throw new Error(
      `Thời lượng phải chia hết cho bước thời gian; tối đa ${limits.maximumSteps} bước.`,
    );
  if (!Number.isInteger(p.seed) || p.seed < 0 || p.seed > 4294967295)
    throw new Error("Seed phải là số nguyên từ 0 đến 4294967295.");
  if (
    ![p.baselineArrivalsPerStep, p.scenarioArrivalsPerStep].every(
      (n) => Number.isFinite(n) && n >= 0 && n <= limits.maximumArrivalsPerStep,
    ) ||
    p.scenarioArrivalsPerStep < p.baselineArrivalsPerStep
  )
    throw new Error(
      `Nhu cầu kịch bản phải ≥ ban đầu và không vượt ${limits.maximumArrivalsPerStep} yêu cầu/bước.`,
    );
}

/** No database, clock, global randomness or mutation of input. */
export function simulateDemand(
  snapshot: SimulationSnapshot,
  p: DemandSimulationRequest,
  limits: SimulationLimits,
): DemandSimulationResult {
  validateDemandParameters(p, limits);
  const hub = snapshot.hubs.find((h) => h.id === p.hubId);
  if (!hub || hub.status !== "active")
    throw new Error("Chọn Hub đang hoạt động trong snapshot.");
  const eligible = hub.vehicleList.filter(
    (v) =>
      v.status === "available" &&
      v.batteryPercent >= limits.minimumBatteryPercent,
  ).length;
  const run = (rate: number): DemandRun => {
    let state = p.seed >>> 0;
    const random = () => {
      state = (Math.imul(1664525, state) + 1013904223) >>> 0;
      return state / 4294967296;
    };
    const result: DemandRun = {
      demand: 0,
      served: 0,
      unserved: 0,
      remainingVehicles: eligible,
      timeline: [],
    };
    for (let step = 1; step <= p.horizonMinutes / p.stepMinutes; step++) {
      // Uniform variation around the configured mean, with unbiased stochastic rounding.
      // Always consume two draws per step so both runs use common random numbers.
      const expected = 2 * rate * random();
      const rounding = random();
      const demand = Math.floor(expected) + (rounding < expected % 1 ? 1 : 0);
      const served = Math.min(demand, result.remainingVehicles);
      result.remainingVehicles -= served;
      result.demand += demand;
      result.served += served;
      result.unserved += demand - served;
      result.timeline.push({
        elapsedMinutes: step * p.stepMinutes,
        demand,
        served,
        unserved: demand - served,
        availableVehicles: result.remainingVehicles,
      });
    }
    return result;
  };
  return {
    modelVersion: "departures-v1",
    snapshotCapturedAt: snapshot.capturedAt,
    hub: { id: hub.id, name: hub.name },
    parameters: { ...p },
    limits: { ...limits },
    initialEligibleVehicles: eligible,
    baseline: run(p.baselineArrivalsPerStep),
    scenario: run(p.scenarioArrivalsPerStep),
  };
}
