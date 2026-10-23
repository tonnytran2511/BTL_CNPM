import { clientConfig } from "./config";
import type {
  User,
  PublicConfig,
  HubSummary,
  HubDetail,
  NetworkOverview,
  VehicleSearchQuery,
  VehicleSearchResult,
  VehicleReservationView,
  TripView,
  ApiError,
  CreateHubRequest,
  UpdateHubRequest,
} from "@emobility/contracts";
export class RequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string = `HTTP_${status}`,
    readonly details?: unknown,
  ) {
    super(message);
  }
}
async function readResponse<T>(path: string, options: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      ...options,
      credentials: "include",
      headers: { "Content-Type": "application/json", ...options.headers },
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError")
      throw error;
    throw new RequestError(
      "Không thể kết nối máy chủ. Kiểm tra kết nối và thử lại.",
      0,
    );
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError")
      throw error;
    throw new RequestError(
      "Máy chủ tạm thời chưa sẵn sàng. Vui lòng thử lại.",
      response.ok ? 502 : response.status,
    );
  }
  if (!response.ok)
    throw new RequestError(
      body && typeof body === "object" && "message" in body
        ? String((body as ApiError).message)
        : "Yêu cầu thất bại.",
      response.status,
      body &&
        typeof body === "object" &&
        "code" in body &&
        typeof body.code === "string"
        ? body.code
        : undefined,
      body && typeof body === "object" && "details" in body
        ? body.details
        : undefined,
    );
  return body as T;
}
export async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const controller = new AbortController();
  const callerSignal = options.signal;
  const cancel = () => controller.abort(callerSignal?.reason);
  if (callerSignal?.aborted) {
    throw callerSignal.reason ?? new DOMException("Aborted", "AbortError");
  }
  callerSignal?.addEventListener("abort", cancel, { once: true });
  let timedOut = false;
  const timer = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, clientConfig.requestTimeoutMs);
  try {
    return await readResponse<T>(path, {
      ...options,
      signal: controller.signal,
    });
  } catch (error) {
    if (callerSignal?.aborted) throw callerSignal.reason ?? error;
    if (timedOut)
      throw new RequestError(
        "Máy chủ phản hồi quá lâu. Vui lòng thử lại. Nếu vừa gửi thao tác, kiểm tra kết quả trước khi gửi lại.",
        0,
        "REQUEST_TIMEOUT",
      );
    throw error;
  } finally {
    window.clearTimeout(timer);
    callerSignal?.removeEventListener("abort", cancel);
  }
}
export const api = {
  config: (signal?: AbortSignal) =>
    request<PublicConfig>("/config", { signal }),
  me: (signal?: AbortSignal) => request<User>("/auth/me", { signal }),
  login: (email: string, password: string) =>
    request<User>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  logout: () =>
    request<{ success: boolean }>("/auth/logout", { method: "POST" }),
  hubs: (signal?: AbortSignal) => request<HubSummary[]>("/hubs", { signal }),
  overview: (signal?: AbortSignal) =>
    request<NetworkOverview>("/network/overview", { signal }),
  detail: (id: string, signal?: AbortSignal) =>
    request<HubDetail>(`/hubs/${encodeURIComponent(id)}`, { signal }),
  createHub: (body: CreateHubRequest) =>
    request("/hubs", { method: "POST", body: JSON.stringify(body) }),
  updateHub: (id: string, body: UpdateHubRequest) =>
    request(`/hubs/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  deleteHub: (id: string) =>
    request(`/hubs/${encodeURIComponent(id)}`, { method: "DELETE" }),
  setParkingCapacity: (id: string, capacity: number) =>
    request(`/hubs/${encodeURIComponent(id)}/parking-capacity`, {
      method: "PUT",
      body: JSON.stringify({ capacity }),
    }),
  addChargingPoint: (id: string, code: string) =>
    request(`/hubs/${encodeURIComponent(id)}/charging-points`, {
      method: "POST",
      body: JSON.stringify({ code }),
    }),
  removeChargingPoint: (id: string, pointId: string) =>
    request(
      `/hubs/${encodeURIComponent(id)}/charging-points/${encodeURIComponent(pointId)}`,
      { method: "DELETE" },
    ),
  vehicles: (query: VehicleSearchQuery, signal?: AbortSignal) => {
    const params = new URLSearchParams();
    if (query.hubId) params.set("hubId", query.hubId);
    if (query.type) params.set("type", query.type);
    if (query.minBatteryPercent !== undefined)
      params.set("minBatteryPercent", String(query.minBatteryPercent));
    const qs = params.toString();
    return request<VehicleSearchResult>(`/vehicles${qs ? `?${qs}` : ""}`, {
      signal,
    });
  },
  reservations: (signal?: AbortSignal) =>
    request<VehicleReservationView[]>("/vehicle-reservations", { signal }),
  // BR-11: mỗi thao tác thuê xe gửi Idempotency-Key; caller có thể truyền key cũ khi thử lại cùng một thao tác.
  reserveVehicle: (vehicleId: string, key: string = crypto.randomUUID()) =>
    request<VehicleReservationView>("/vehicle-reservations", {
      method: "POST",
      headers: { "Idempotency-Key": key },
      body: JSON.stringify({ vehicleId }),
    }),
  cancelReservation: (id: string, key: string = crypto.randomUUID()) =>
    request<VehicleReservationView>(
      `/vehicle-reservations/${encodeURIComponent(id)}/cancel`,
      { method: "POST", headers: { "Idempotency-Key": key } },
    ),
  pickupReservation: (id: string, key: string = crypto.randomUUID()) =>
    request<TripView>(
      `/vehicle-reservations/${encodeURIComponent(id)}/pickup`,
      { method: "POST", headers: { "Idempotency-Key": key } },
    ),
  trips: (signal?: AbortSignal) => request<TripView[]>("/trips", { signal }),
  returnTrip: (
    id: string,
    targetHubId: string,
    key: string = crypto.randomUUID(),
  ) =>
    request<TripView>(`/trips/${encodeURIComponent(id)}/return`, {
      method: "POST",
      headers: { "Idempotency-Key": key },
      body: JSON.stringify({ targetHubId }),
    }),
};
