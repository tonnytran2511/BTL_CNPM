import type { ScenarioSimulationResult } from "@emobility/contracts";
export interface SimulationRow {
  id: string;
  created_at: Date;
  created_by: string;
  result: ScenarioSimulationResult;
  payload: string;
}
