import type { Incident } from "./planned";
export interface ChargingFailureInput {
  description: string;
  sessionId?: string;
  achievedBatteryPercent?: number;
}
export interface ChargingFailureResult {
  pointId: string;
  status: "failed";
  incident: Incident;
  interruptedSessionId: string | null;
  requestStatus: "queued" | "fulfilled" | null;
}
export interface ChargingPointFailureView {
  id: string;
  code: string;
  hubId: string;
  hubName: string;
  status: "available" | "occupied" | "failed";
  sessionId: string | null;
  sessionStatus: "scheduled" | "charging" | null;
  vehicleCode: string | null;
  vehicleKind: "private" | "rental" | null;
  batteryPercent: number | null;
  targetBatteryPercent: number | null;
  openIncidentId: string | null;
  openIncidentDescription: string | null;
}
