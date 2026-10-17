import type { SimulationLimits } from "@emobility/contracts";
import type { SimulationForm } from "../models/simulation";

/** Samples are five independent values in [0, 1); this function has no random source or side effects. */
export function randomizeSimulationForm(
  form: SimulationForm,
  limits: SimulationLimits,
  samples: readonly number[],
): SimulationForm {
  const [time, count, baseline, scenario, seed] = samples;
  // Pick minute-based steps up to an hour for readable trial runs.
  const stepMinutes = 1 + Math.floor(time * 60);
  const maximumSteps = Math.min(
    limits.maximumSteps,
    Math.floor(Number.MAX_SAFE_INTEGER / stepMinutes),
  );
  const steps = 1 + Math.floor(count * maximumSteps);
  const baselineRate = Math.floor(
    baseline * (limits.maximumArrivalsPerStep + 1),
  );
  const scenarioRate =
    baselineRate +
    Math.floor(scenario * (limits.maximumArrivalsPerStep - baselineRate + 1));
  return {
    ...form,
    stepMinutes: String(stepMinutes),
    horizonMinutes: String(stepMinutes * steps),
    baselineArrivalsPerStep: String(baselineRate),
    scenarioArrivalsPerStep: String(scenarioRate),
    seed: String(Math.floor(seed * 4294967296)),
  };
}
