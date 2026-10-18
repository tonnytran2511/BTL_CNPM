import type {
  PrivateVehicle,
  RegisterPrivateVehicleRequest,
  ReserveParkingRequest,
  ParkingBooking,
  ParkingAvailability,
  ChargingRequestInput,
  ChargingQueueEntry,
} from "@emobility/contracts";
import { request } from "./client";
function post<T>(path: string, body: unknown, key: string) {
  return request<T>(`/mobility/${path}`, {
    method: "POST",
    headers: { "Idempotency-Key": key },
    body: JSON.stringify(body),
  });
}
export const mobilityApi = {
  vehicles: (signal?: AbortSignal) =>
    request<PrivateVehicle[]>("/mobility/private-vehicles", { signal }),
  bookings: (signal?: AbortSignal) =>
    request<ParkingBooking[]>("/mobility/parking/bookings", { signal }),
  queue: (signal?: AbortSignal) =>
    request<ChargingQueueEntry[]>("/mobility/charging/requests", { signal }),
  register: (body: RegisterPrivateVehicleRequest, key: string) =>
    post<PrivateVehicle>("private-vehicles", body, key),
  reserve: (body: ReserveParkingRequest, key: string) =>
    post<ParkingBooking>("parking/bookings", body, key),
  transition: (id: string, action: string, key: string) =>
    post<ParkingBooking>(
      `parking/bookings/${encodeURIComponent(id)}/${action}`,
      {},
      key,
    ),
  charge: (body: ChargingRequestInput, key: string) =>
    post<{ id: string; status: "queued" }>("charging/requests", body, key),
  availability: (body: Omit<ReserveParkingRequest, "privateVehicleId">) =>
    request<ParkingAvailability>(
      `/mobility/parking/availability?${new URLSearchParams(body)}`,
    ),
};
