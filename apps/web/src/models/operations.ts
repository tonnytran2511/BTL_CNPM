import type {
  HubDetail,
  Incident,
  OperationLogEntry,
  Redistribution,
  HubSummary,
  VehicleSummary,
} from "@emobility/contracts";
import type { FormEvent } from "react";

export interface IncidentForm {
  resourceType: Incident["resourceType"];
  resourceId: string;
  description: string;
}

export interface RedistributionForm {
  sourceHubId: string;
  targetHubId: string;
  vehicleIds: string[];
}

export interface OperationsModel {
  hubs: HubDetail[];
  sourceHubs: HubSummary[];
  incidentResources: Array<{ id: string; label: string }>;
  availableVehicles: VehicleSummary[];
  targetHubs: HubSummary[];
  hubNames: Record<string, string>;
  actorNames: Record<string, string>;
  incidents: Incident[];
  redistributions: Redistribution[];
  log: OperationLogEntry[];
  incidentForm: IncidentForm;
  redistributionForm: RedistributionForm;
  error: string;
  loading: boolean;
  busy: boolean;
  refresh(): Promise<void>;
  changeIncident<K extends keyof IncidentForm>(
    field: K,
    value: IncidentForm[K],
  ): void;
  changeRedistribution<K extends keyof RedistributionForm>(
    field: K,
    value: RedistributionForm[K],
  ): void;
  toggleVehicle(id: string): void;
  createIncident(event: FormEvent<HTMLFormElement>): Promise<void>;
  resolveIncident(id: string): Promise<void>;
  createRedistribution(event: FormEvent<HTMLFormElement>): Promise<void>;
  startRedistribution(id: string): Promise<void>;
  cancelRedistribution(id: string): Promise<void>;
  completeRedistribution(id: string): Promise<void>;
}

export function operationTime(value: string | null) {
  return value
    ? new Intl.DateTimeFormat("vi-VN", {
        dateStyle: "short",
        timeStyle: "short",
      }).format(new Date(value))
    : "—";
}

export function operationStatus(value: string) {
  const labels: Record<string, string> = {
    open: "Đang mở",
    resolved: "Đã xử lý",
    pending: "Đang chờ",
    in_progress: "Đang điều chuyển",
    completed: "Hoàn tất",
    cancelled: "Đã hủy",
    active: "Đang hoạt động",
    inactive: "Ngừng hoạt động",
  };
  return labels[value] ?? value;
}

export function operationActionLabel(action: OperationLogEntry["action"]) {
  const labels: Record<OperationLogEntry["action"], string> = {
    created: "Tạo",
    resolved: "Xử lý sự cố",
    started: "Bắt đầu",
    cancelled: "Hủy",
    completed: "Hoàn tất",
  };
  return labels[action];
}
