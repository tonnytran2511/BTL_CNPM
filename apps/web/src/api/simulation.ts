import type {
  DemandSimulationRequest,
  DemandSimulationResult,
  SimulationLimits,
} from "@emobility/contracts";
import { request } from "./client";

export const simulationApi = {
  config: (signal?: AbortSignal) =>
    request<SimulationLimits>("/simulations/config", { signal }),
  run: (body: DemandSimulationRequest, signal?: AbortSignal) =>
    request<DemandSimulationResult>("/simulations/demand-surge", {
      method: "POST",
      body: JSON.stringify(body),
      signal,
    }),
};
