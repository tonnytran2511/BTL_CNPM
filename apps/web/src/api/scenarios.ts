import type {
  ScenarioLimits,
  ScenarioSimulationRequest,
  SavedSimulation,
  SimulationHistoryPage,
} from "@emobility/contracts";
import { request } from "./client";
export const scenariosApi = {
  config: (signal?: AbortSignal) =>
    request<ScenarioLimits>("/simulations/scenario-config", { signal }),
  run: (body: ScenarioSimulationRequest, key: string, signal?: AbortSignal) =>
    request<SavedSimulation>("/simulations/runs", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Idempotency-Key": key },
      signal,
    }),
  history: (before?: string, signal?: AbortSignal) =>
    request<SimulationHistoryPage>(
      `/simulations/runs${before ? `?before=${encodeURIComponent(before)}` : ""}`,
      { signal },
    ),
  detail: (id: string, signal?: AbortSignal) =>
    request<SavedSimulation>(`/simulations/runs/${encodeURIComponent(id)}`, {
      signal,
    }),
};
