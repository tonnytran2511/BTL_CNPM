import type {
  ChargingOverview,
  ChargingSessionView,
} from "@emobility/contracts";
import { request } from "./client";
function post<T>(path: string, body: unknown, key: string) {
  return request<T>(`/mobility/charging/${path}`, {
    method: "POST",
    headers: { "Idempotency-Key": key },
    body: JSON.stringify(body),
  });
}
export const chargingApi = {
  createRental: (
    hubId: string,
    vehicleId: string,
    targetBatteryPercent: number,
    requiredBy: string | undefined,
    key: string,
  ) =>
    request("/mobility/charging/requests", {
      method: "POST",
      headers: { "Idempotency-Key": key },
      body: JSON.stringify({
        hubId,
        vehicle: { kind: "rental", id: vehicleId },
        targetBatteryPercent,
        requiredBy,
      }),
    }),
  cancelQueued: (id: string, key: string) =>
    post(`requests/${encodeURIComponent(id)}/cancel`, {}, key),
  overview: (signal?: AbortSignal) =>
    request<ChargingOverview>("/mobility/charging/overview", { signal }),
  schedule: (hubId: string, key: string) =>
    post<{ sessions: unknown[] }>("schedule", { hubId }, key),
  transition: (
    id: string,
    action: string,
    battery: number | undefined,
    key: string,
  ) =>
    post<ChargingSessionView>(
      `sessions/${encodeURIComponent(id)}/${action}`,
      battery === undefined ? {} : { achievedBatteryPercent: battery },
      key,
    ),
};
