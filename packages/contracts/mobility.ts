export type ElectricVehicleType = "electric_bicycle" | "electric_motorcycle";
export interface PrivateVehicle {
  id: string;
  code: string;
  type: ElectricVehicleType;
  batteryPercent: number | null;
}
export interface RegisterPrivateVehicleRequest {
  code: string;
  type: ElectricVehicleType;
  batteryPercent: number;
}
export interface ParkingBooking {
  id: string;
  privateVehicleId: string;
  parkingSpaceId: string;
  hubId: string;
  hubName: string;
  vehicleCode: string;
  spaceCode: string;
  startsAt: string;
  endsAt: string;
  status: "reserved" | "checked_in" | "completed" | "cancelled";
}
export interface ParkingAvailability {
  hubId: string;
  startsAt: string;
  endsAt: string;
  available: number;
}
export interface ChargingQueueEntry {
  id: string;
  hubId: string;
  hubName: string;
  vehicleCode: string;
  targetBatteryPercent: number;
  requiredBy: string | null;
  status: "queued" | "allocated" | "fulfilled" | "cancelled";
  createdAt: string;
}
