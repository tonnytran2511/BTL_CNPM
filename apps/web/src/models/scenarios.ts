import type {
  ScenarioKind,
  ScenarioSimulationRequest,
} from "@emobility/contracts";
export interface ScenarioForm {
  kind: ScenarioKind;
  hubId: string;
  horizonMinutes: string;
  stepMinutes: string;
  seed: string;
  baselineArrivalsPerStep: string;
  scenarioArrivalsPerStep: string;
  additionalOccupiedSpaces: string;
  failedChargingPointIds: string[];
  chargingServiceMinutes: string;
}
/** Editable trial parameters, never operational state or business limits. */
export const initialScenarioForm: ScenarioForm = {
  kind: "demand_surge",
  hubId: "",
  horizonMinutes: "60",
  stepMinutes: "5",
  seed: "42",
  baselineArrivalsPerStep: "0.2",
  scenarioArrivalsPerStep: "2",
  additionalOccupiedSpaces: "1",
  failedChargingPointIds: [],
  chargingServiceMinutes: "15",
};
export const scenarioLabels: Record<ScenarioKind, string> = {
  demand_surge: "Tăng nhu cầu lấy xe",
  parking_full: "Chỗ đỗ bị chiếm thêm",
  charging_failure: "Cổng sạc bị hỏng",
};
export function scenarioRequest(form: ScenarioForm): ScenarioSimulationRequest {
  return {
    kind: form.kind,
    hubId: form.hubId,
    horizonMinutes: Number(form.horizonMinutes),
    stepMinutes: Number(form.stepMinutes),
    seed: Number(form.seed),
    baselineArrivalsPerStep: Number(form.baselineArrivalsPerStep),
    scenarioArrivalsPerStep: Number(
      form.kind === "demand_surge"
        ? form.scenarioArrivalsPerStep
        : form.baselineArrivalsPerStep,
    ),
    additionalOccupiedSpaces:
      form.kind === "parking_full" ? Number(form.additionalOccupiedSpaces) : 0,
    failedChargingPointIds:
      form.kind === "charging_failure"
        ? [...form.failedChargingPointIds].sort()
        : [],
    chargingServiceMinutes:
      form.kind === "charging_failure"
        ? Number(form.chargingServiceMinutes)
        : Number(form.stepMinutes),
  };
}
