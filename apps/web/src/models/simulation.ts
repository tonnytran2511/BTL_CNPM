export interface SimulationForm {
  hubId: string;
  horizonMinutes: string;
  stepMinutes: string;
  seed: string;
  baselineArrivalsPerStep: string;
  scenarioArrivalsPerStep: string;
}
export const emptySimulationForm: SimulationForm = {
  hubId: "",
  horizonMinutes: "",
  stepMinutes: "",
  seed: "42",
  baselineArrivalsPerStep: "",
  scenarioArrivalsPerStep: "",
};
