import { Injectable } from "@nestjs/common";
import type { PoolClient } from "pg";
import type {
  ChargingAllocation,
  ChargingRequestResource,
} from "./charging-allocation.model";

@Injectable()
export class ChargingAllocationRepository {
  async locateRequest(client: PoolClient, id: string) {
    return (
      await client.query<ChargingRequestResource>(
        "SELECT * FROM charging_requests WHERE id=$1",
        [id],
      )
    ).rows[0];
  }

  // Serialize Hub mutations without blocking FK KEY SHARE when rental creates a reservation.
  async lockHub(client: PoolClient, id: string) {
    return (
      await client.query<{ status: string }>(
        "SELECT status FROM hubs WHERE id=$1 FOR NO KEY UPDATE",
        [id],
      )
    ).rows[0];
  }

  async lockPrivateVehicle(client: PoolClient, id: string) {
    return (
      await client.query<{ owner_id: string; battery_percent: number | null }>(
        "SELECT owner_id,battery_percent FROM private_vehicles WHERE id=$1 FOR UPDATE",
        [id],
      )
    ).rows[0];
  }

  async lockRequest(client: PoolClient, id: string) {
    return (
      await client.query<ChargingRequestResource>(
        "SELECT * FROM charging_requests WHERE id=$1 FOR UPDATE",
        [id],
      )
    ).rows[0];
  }

  async lockPoint(client: PoolClient, id: string) {
    return (
      await client.query<{ hub_id: string; status: string }>(
        "SELECT hub_id,status FROM charging_points WHERE id=$1 FOR UPDATE",
        [id],
      )
    ).rows[0];
  }

  async parkedAt(client: PoolClient, vehicleId: string, hubId: string) {
    return Boolean(
      (
        await client.query(
          "SELECT id FROM parking_spaces WHERE private_vehicle_id=$1 AND hub_id=$2 AND status='occupied'",
          [vehicleId, hubId],
        )
      ).rowCount,
    );
  }

  async activeSession(client: PoolClient, requestId: string) {
    return (
      await client.query<ChargingAllocation>(
        `SELECT id,request_id AS "requestId",charging_point_id AS "chargingPointId",status
       FROM charging_sessions WHERE request_id=$1 AND status IN ('scheduled','charging')`,
        [requestId],
      )
    ).rows[0];
  }

  async claimPoint(client: PoolClient, id: string) {
    return Boolean(
      (
        await client.query(
          "UPDATE charging_points SET status='occupied' WHERE id=$1 AND status='available' RETURNING id",
          [id],
        )
      ).rowCount,
    );
  }

  async allocateRequest(client: PoolClient, id: string) {
    return Boolean(
      (
        await client.query(
          "UPDATE charging_requests SET status='allocated' WHERE id=$1 AND status='queued' RETURNING id",
          [id],
        )
      ).rowCount,
    );
  }

  async createSession(client: PoolClient, requestId: string, pointId: string) {
    return (
      await client.query<ChargingAllocation>(
        `INSERT INTO charging_sessions(request_id,charging_point_id,status) VALUES($1,$2,'scheduled')
       RETURNING id,request_id AS "requestId",charging_point_id AS "chargingPointId",status`,
        [requestId, pointId],
      )
    ).rows[0];
  }
}
