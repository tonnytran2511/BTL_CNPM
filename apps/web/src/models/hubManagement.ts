import type { FormEvent } from "react";
import type { HubDetail, HubSummary } from "@emobility/contracts";

export interface HubCreateForm {
  code: string;
  name: string;
  location: string;
}

export interface HubEditForm {
  name: string;
  location: string;
  status: HubSummary["status"];
  capacity: string;
  chargingPointCode: string;
}

export type HubEditField = keyof HubEditForm;
export type HubCreateField = keyof HubCreateForm;

export interface HubManagementModel {
  hubs: HubDetail[];
  error: string;
  busy: boolean;
  createForm: HubCreateForm;
  editForms: Record<string, HubEditForm>;
  refresh: () => Promise<boolean>;
  changeCreateField: <K extends HubCreateField>(
    field: K,
    value: HubCreateForm[K],
  ) => void;
  changeHubField: <K extends HubEditField>(
    hubId: string,
    field: K,
    value: HubEditForm[K],
  ) => void;
  submitCreate: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  submitUpdate: (
    hubId: string,
    event: FormEvent<HTMLFormElement>,
  ) => Promise<void>;
  submitCapacity: (
    hubId: string,
    event: FormEvent<HTMLFormElement>,
  ) => Promise<void>;
  submitChargingPoint: (
    hubId: string,
    event: FormEvent<HTMLFormElement>,
  ) => Promise<void>;
  removeHub: (hubId: string) => void;
  removeChargingPoint: (hubId: string, pointId: string) => void;
}
