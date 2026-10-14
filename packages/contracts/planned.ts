/** Proposed module contracts. These endpoints are not implemented yet. */
export interface TimeWindow {
  startsAt: string;
  endsAt: string;
}
export type ReservationStatus =
  "active" | "cancelled" | "expired" | "fulfilled";
export interface ReserveVehicleRequest {
  vehicleId: string;
}
export interface VehicleReservation {
  id: string;
  userId: string;
  vehicleId: string;
  status: ReservationStatus;
  expiresAt: string;
}
export interface ReturnTripRequest {
  targetHubId: string;
}
export interface ReserveParkingRequest extends TimeWindow {
  hubId: string;
  privateVehicleId: string;
}
export interface ChargingRequestInput {
  hubId: string;
  vehicle: { kind: "rental" | "private"; id: string };
  targetBatteryPercent: number;
  requiredBy?: string;
}
export interface RedistributionRequest {
  sourceHubId: string;
  targetHubId: string;
  vehicleIds: string[];
}
export type ScenarioInput =
  | { kind: "demand_surge"; hubId: string; arrivalsPerStep: number }
  | { kind: "parking_full"; hubId: string; additionalOccupiedSpaces: number }
  | { kind: "charging_failure"; hubId: string; chargingPointIds: string[] };
export interface RunSimulationRequest {
  scenario: ScenarioInput;
  horizonMinutes: number;
  stepMinutes: number;
  seed: number;
}
