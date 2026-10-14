import type { PoolClient } from "pg";

/** Contract for TV3. A provider must implement it before another module injects it. */
export const ALLOCATION_PORT = Symbol("ALLOCATION_PORT");
export interface AllocationPort {
  /** Called during pickup in the caller's transaction. Must validate source Hub. */
  releaseRentalVehicleSpace(
    vehicleId: string,
    sourceHubId: string,
    client: PoolClient,
  ): Promise<void>;
  /** Called during return/redistribution. Locks and claims an available space. */
  claimRentalVehicleSpace(
    vehicleId: string,
    targetHubId: string,
    client: PoolClient,
  ): Promise<{ parkingSpaceId: string }>;
}

// No default/no-op provider: allocation is a real TV3 implementation obligation.
