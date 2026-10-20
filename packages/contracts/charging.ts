export interface ChargingQueueItem {
  id: string;
  hubId: string;
  hubName: string;
  vehicleCode: string;
  vehicleKind: "private" | "rental";
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
  vehicleKind: "private" | "rental";
  status: "scheduled" | "charging" | "completed" | "cancelled" | "interrupted";
  targetBatteryPercent: number;
  batteryPercent: number | null;
  startedAt: string | null;
  endedAt: string | null;
}
export interface ChargingOverview {
  queue: ChargingQueueItem[];
  sessions: ChargingSessionView[];
  rentalCandidates: RentalChargingCandidate[];
  rentalPending: { id: string; vehicleCode: string; hubName: string }[];
}

export interface RentalChargingCandidate {
  id: string;
  code: string;
  hubId: string;
  hubName: string;
  batteryPercent: number;
}
