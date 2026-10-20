export interface CreateHubRequest {
  code: string;
  name: string;
  location: string;
}
export interface UpdateHubRequest {
  name?: string;
  location?: string;
  status?: "active" | "inactive";
}
export interface ParkingCapacityRequest {
  capacity: number;
}
export interface CreateChargingPointRequest {
  code: string;
}
