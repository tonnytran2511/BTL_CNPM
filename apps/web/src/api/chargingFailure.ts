import type {
  ChargingFailureInput,
  ChargingFailureResult,
  ChargingPointFailureView,
} from "@emobility/contracts";
import { request } from "./client";
export const chargingFailureApi = {
  points: (signal?: AbortSignal) =>
    request<ChargingPointFailureView[]>("/mobility/charging/points", {
      signal,
    }),
  report: (id: string, body: ChargingFailureInput, key: string) =>
    request<ChargingFailureResult>(
      `/mobility/charging/points/${encodeURIComponent(id)}/fail`,
      {
        method: "POST",
        headers: { "Idempotency-Key": key },
        body: JSON.stringify(body),
      },
    ),
  recover: (id: string, key: string) =>
    request<{ pointId: string; status: "available" }>(
      `/mobility/charging/points/${encodeURIComponent(id)}/recover`,
      { method: "POST", headers: { "Idempotency-Key": key }, body: "{}" },
    ),
};
