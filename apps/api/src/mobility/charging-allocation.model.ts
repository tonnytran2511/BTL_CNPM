export interface ChargingAllocation {
  id: string;
  requestId: string;
  chargingPointId: string;
  status: "scheduled" | "charging";
}

export interface ChargingRequestResource {
  id: string;
  hub_id: string;
  user_id: string;
  private_vehicle_id: string | null;
  vehicle_id: string | null;
  target_battery_percent: number;
  status: "queued" | "allocated" | "fulfilled" | "cancelled";
}
