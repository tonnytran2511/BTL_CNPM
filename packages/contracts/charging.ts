export interface ChargingQueueItem {
  id: string;
  hubId: string;
  hubName: string;
  vehicleCode: string;
  batteryPercent: number;
  targetBatteryPercent: number;
  requiredBy: string | null;
  createdAt: string;
}
export interface ChargingSessionView {
  id: string;
  hubId: string;
  hubName: string;
  pointCode: string;
  vehicleCode: string;
  status: "scheduled" | "charging" | "completed" | "cancelled" | "interrupted";
  targetBatteryPercent: number;
  batteryPercent: number | null;
  startedAt: string | null;
  endedAt: string | null;
}
export interface ChargingOverview {
  queue: ChargingQueueItem[];
  sessions: ChargingSessionView[];
}
