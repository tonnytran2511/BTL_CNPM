export type RentalVehicleType = "electric_bicycle" | "electric_motorcycle";
/** Query of GET /vehicles. Every field is optional; omit a field to not filter by it. */
export interface VehicleSearchQuery {
  hubId?: string;
  type?: RentalVehicleType;
  /** Requested minimum battery in %; the server also applies the configured rental minimum. */
  minBatteryPercent?: number;
}
export interface RentableVehicle {
  id: string;
  code: string;
  type: RentalVehicleType;
  batteryPercent: number;
  status: "available";
  hubId: string;
  hubName: string;
  hubLocation: string;
}
export interface VehicleSearchResult {
  /** Battery threshold from settings (`minimumRentalBatteryPercent`), in %. */
  minimumBatteryPercent: number;
  vehicles: RentableVehicle[];
}
export type TripStatus = "active" | "completed";
export interface Trip {
  id: string;
  reservationId: string;
  userId: string;
  vehicleId: string;
  sourceHubId: string;
  targetHubId: string | null;
  status: TripStatus;
  startedAt: string;
  endedAt: string | null;
  startBatteryPercent: number;
  endBatteryPercent: number | null;
}
