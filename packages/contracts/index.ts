export type Role = "student" | "operator";
export type * from "./simulation";
export type * from "./planned";
export type * from "./mobility";
export type * from "./charging";
export type * from "./rental";
export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
}
export interface PublicConfig {
  appName: string;
  pollIntervalMs: number;
}
export type VehicleStatus =
  | "available"
  | "reserved"
  | "in_use"
  | "charging"
  | "maintenance"
  | "redistributing";
export type ChargingPointStatus = "available" | "occupied" | "failed";
export interface VehicleSummary {
  id: string;
  code: string;
  type: string;
  batteryPercent: number;
  status: VehicleStatus;
}
export interface ChargingPointSummary {
  id: string;
  code: string;
  status: ChargingPointStatus;
}
export interface HubSummary {
  id: string;
  name: string;
  location: string;
  status: "active" | "inactive";
  parking: {
    capacity: number;
    occupied: number;
    held: number;
    available: number;
  };
  vehicles: { total: number; available: number; lowBattery: number };
  charging: {
    total: number;
    available: number;
    occupied: number;
    failed: number;
  };
  utilizationPercent: number;
}
export interface HubDetail extends HubSummary {
  vehicleList: VehicleSummary[];
  chargingPoints: ChargingPointSummary[];
}
export interface NetworkOverview {
  hubs: HubSummary[];
  totals: {
    hubs: number;
    vehicles: number;
    availableVehicles: number;
    availableParking: number;
    availableCharging: number;
    failedCharging: number;
  };
  updatedAt: string;
}
export interface ApiError {
  statusCode: number;
  message: string;
  code: string;
}
export interface SimulationSnapshot {
  capturedAt: string;
  hubs: HubDetail[];
}
