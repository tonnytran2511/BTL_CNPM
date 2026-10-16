import type {
  RentalVehicleType,
  VehicleSearchQuery,
} from "@emobility/contracts";

export interface VehicleFilterState {
  hubId: string; // "" = every Hub
  type: "" | RentalVehicleType; // "" = every type
  minBattery: string; // raw input; "" = no extra filter
}
export const emptyVehicleFilter: VehicleFilterState = {
  hubId: "",
  type: "",
  minBattery: "",
};
export const vehicleTypeOptions: RentalVehicleType[] = [
  "electric_bicycle",
  "electric_motorcycle",
];

/** Returns a 0-100 integer, or undefined when the input is empty or not a valid number. */
export function parseMinBattery(raw: string): number | undefined {
  if (!raw.trim()) return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value)) return undefined;
  return Math.min(100, Math.max(0, Math.round(value)));
}

export function toSearchQuery(filter: VehicleFilterState): VehicleSearchQuery {
  return {
    hubId: filter.hubId || undefined,
    type: filter.type || undefined,
    minBatteryPercent: parseMinBattery(filter.minBattery),
  };
}
