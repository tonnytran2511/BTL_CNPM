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
