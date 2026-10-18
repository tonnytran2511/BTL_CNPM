/**
 * Domain rules for vehicle rental (T06). Pure functions and constants only:
 * no database access and no HTTP. Services and repositories apply these rules.
 * Contract: docs/business-rules.md (BR-01, BR-02, BR-03, BR-10).
 */
export const VEHICLE_TYPES = [
  "electric_bicycle",
  "electric_motorcycle",
] as const;
export type VehicleType = (typeof VEHICLE_TYPES)[number];

export const VEHICLE_STATUSES = [
  "available",
  "reserved",
  "in_use",
  "charging",
  "maintenance",
  "redistributing",
] as const;
export type VehicleStatus = (typeof VEHICLE_STATUSES)[number];

export const RESERVATION_STATUSES = [
  "active",
  "cancelled",
  "expired",
  "fulfilled",
] as const;
export type ReservationStatus = (typeof RESERVATION_STATUSES)[number];

export const TRIP_STATUSES = ["active", "completed"] as const;
export type TripStatus = (typeof TRIP_STATUSES)[number];

/** Reservation: active -> cancelled | expired | fulfilled. Final states never return to active. */
const RESERVATION_TRANSITIONS: Record<
  ReservationStatus,
  readonly ReservationStatus[]
> = {
  active: ["cancelled", "expired", "fulfilled"],
  cancelled: [],
  expired: [],
  fulfilled: [],
};
export function canTransitionReservation(
  from: ReservationStatus,
  to: ReservationStatus,
): boolean {
  return RESERVATION_TRANSITIONS[from].includes(to);
}

/** Trip: active -> completed. An incident never completes a trip by itself (BR-10). */
const TRIP_TRANSITIONS: Record<TripStatus, readonly TripStatus[]> = {
  active: ["completed"],
  completed: [],
};
export function canTransitionTrip(from: TripStatus, to: TripStatus): boolean {
  return TRIP_TRANSITIONS[from].includes(to);
}

/**
 * Vehicle status change caused by each rental event. The repository must apply it as a
 * conditional update (`WHERE status = from`) so a stale request cannot overwrite the state.
 */
export type RentalEvent = "reserve" | "cancel" | "expire" | "pickup" | "return";
export const VEHICLE_STATUS_BY_EVENT: Record<
  RentalEvent,
  { from: VehicleStatus; to: VehicleStatus }
> = {
  reserve: { from: "available", to: "reserved" },
  cancel: { from: "reserved", to: "available" },
  expire: { from: "reserved", to: "available" },
  pickup: { from: "reserved", to: "in_use" },
  return: { from: "in_use", to: "available" },
};

/** The reservation status that each event leaves behind (the trip is created by `pickup`). */
export const RESERVATION_STATUS_BY_EVENT: Partial<
  Record<RentalEvent, ReservationStatus>
> = {
  cancel: "cancelled",
  expire: "expired",
  pickup: "fulfilled",
};

/** Rentable means: free, in an active Hub and with enough battery. Broken vehicles never qualify. */
export function isRentable(
  vehicle: { status: VehicleStatus; batteryPercent: number },
  hubStatus: "active" | "inactive",
  minimumBatteryPercent: number,
): boolean {
  return (
    hubStatus === "active" &&
    vehicle.status === "available" &&
    vehicle.batteryPercent >= minimumBatteryPercent
  );
}

/** The configured minimum always applies; a user filter can only raise it. */
export function effectiveMinimumBattery(
  configuredMinimum: number,
  requested?: number,
): number {
  return Math.max(configuredMinimum, requested ?? 0);
}
