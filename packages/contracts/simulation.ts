/** T13 implemented contract. Other scenario variants remain proposed in planned.ts. */
export interface DemandSimulationRequest {
  hubId: string;
  horizonMinutes: number;
  stepMinutes: number;
  seed: number;
  baselineArrivalsPerStep: number;
  scenarioArrivalsPerStep: number;
}
export interface SimulationLimits {
  maximumSteps: number;
  maximumArrivalsPerStep: number;
  minimumBatteryPercent: number;
}
export interface DemandStep {
  elapsedMinutes: number;
  demand: number;
  served: number;
  unserved: number;
  availableVehicles: number;
}
export interface DemandRun {
  demand: number;
  served: number;
  unserved: number;
  remainingVehicles: number;
  timeline: DemandStep[];
}
export interface DemandSimulationResult {
  modelVersion: "departures-v1";
  snapshotCapturedAt: string;
  hub: { id: string; name: string };
  parameters: DemandSimulationRequest;
  limits: SimulationLimits;
  initialEligibleVehicles: number;
  baseline: DemandRun;
  scenario: DemandRun;
}
