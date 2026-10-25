import type { SimulationLimits, SimulationSnapshot } from "./index";

export type ScenarioKind = "demand_surge" | "parking_full" | "charging_failure";
export interface ScenarioSimulationRequest {
  kind: ScenarioKind;
  hubId: string;
  horizonMinutes: number;
  stepMinutes: number;
  seed: number;
  baselineArrivalsPerStep: number;
  scenarioArrivalsPerStep: number;
  additionalOccupiedSpaces: number;
  failedChargingPointIds: string[];
  chargingServiceMinutes: number;
}
export interface ScenarioLimits extends SimulationLimits {
  maximumHorizonMinutes: number;
  maximumGeneratedRequests: number;
  historyPageSize: number;
}
export interface SimulationResourceProjection {
  hubId: string;
  eligibleVehicleIds: string[];
  parkingSpaceIds: string[];
  chargingPoints: {
    id: string;
    status: "available" | "occupied" | "failed";
    activeSession: boolean;
  }[];
  chargingQueueWaitMinutes: number[];
}
export interface ScenarioSnapshot extends SimulationSnapshot {
  resources: SimulationResourceProjection[];
}
export interface ScenarioStep {
  elapsedMinutes: number;
  demand: number;
  served: number;
  unserved: number;
  queued: number;
  completed: number;
  availableResources: number;
  occupiedParking: number;
  busyChargingPoints: number;
}
export interface ScenarioRun {
  demand: number;
  served: number;
  unserved: number;
  queued: number;
  completed: number;
  initialResources: number;
  remainingResources: number;
  peakParking: number | null;
  chargingUtilizationPercent: number | null;
  meanWaitMinutes: number | null;
  waitingAtEndMinutes: number | null;
  timeline: ScenarioStep[];
}
export interface SimulationRecommendation {
  kind:
    | "review_redistribution"
    | "redirect_parking"
    | "redirect_charging"
    | "review_capacity";
  sourceHubId: string;
  targetHubId: string | null;
  quantity: number;
  resource: "vehicle" | "parking_space" | "charging_point";
  snapshotCapturedAt: string;
  reason: string;
  requiresRevalidation: true;
}
export interface ScenarioSimulationResult {
  modelVersion: "resource-flow-v1";
  snapshotCapturedAt: string;
  hub: { id: string; name: string };
  parameters: ScenarioSimulationRequest;
  limits: ScenarioLimits;
  baseline: ScenarioRun;
  scenario: ScenarioRun;
  impact: {
    served: number;
    unserved: number;
    queued: number;
    meanWaitMinutes: number | null;
  };
  recommendations: SimulationRecommendation[];
}
export interface SavedSimulation {
  id: string;
  createdAt: string;
  createdBy: string;
  result: ScenarioSimulationResult;
}
export interface SimulationHistoryItem {
  id: string;
  createdAt: string;
  hubName: string;
  kind: ScenarioKind;
  modelVersion: string;
}
export interface SimulationHistoryPage {
  items: SimulationHistoryItem[];
  nextBefore: string | null;
}
