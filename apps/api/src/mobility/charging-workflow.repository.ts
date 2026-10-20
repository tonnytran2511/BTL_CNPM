import { Injectable } from "@nestjs/common";
import type { PoolClient } from "pg";
import type {
  ChargingQueueItem,
  ChargingSessionView,
} from "@emobility/contracts";
const sessionView = `SELECT s.id,r.hub_id AS "hubId",h.name AS "hubName",c.code AS "pointCode",v.code AS "vehicleCode",s.status,
 r.target_battery_percent AS "targetBatteryPercent",v.battery_percent AS "batteryPercent",s.started_at AS "startedAt",s.ended_at AS "endedAt"
 FROM charging_sessions s JOIN charging_requests r ON r.id=s.request_id JOIN hubs h ON h.id=r.hub_id
 JOIN charging_points c ON c.id=s.charging_point_id JOIN private_vehicles v ON v.id=r.private_vehicle_id`;
@Injectable()
export class ChargingWorkflowRepository {
  async policy(c: PoolClient) {
    return (
      await c.query(
        "SELECT key,value FROM settings WHERE key=ANY($1::text[])",
        [
          [
            "chargingMaximumWaitMinutes",
            "chargingUrgencyWindowMinutes",
            "lowBatteryThreshold",
          ],
        ],
      )
    ).rows;
  }
  async clock(c: PoolClient) {
    return Number(
      (
        await c.query(
          "SELECT extract(epoch FROM clock_timestamp())*1000 AS now",
        )
      ).rows[0].now,
    );
  }
  async queue(c: PoolClient, hubId?: string): Promise<ChargingQueueItem[]> {
    return (
      await c.query<ChargingQueueItem>(
        `SELECT r.id,r.hub_id AS "hubId",h.name AS "hubName",v.code AS "vehicleCode",
  v.battery_percent AS "batteryPercent",r.target_battery_percent AS "targetBatteryPercent",r.required_by AS "requiredBy",r.created_at AS "createdAt"
  FROM charging_requests r JOIN hubs h ON h.id=r.hub_id JOIN private_vehicles v ON v.id=r.private_vehicle_id
  WHERE r.status='queued' AND h.status='active' AND v.owner_id=r.user_id AND v.battery_percent<r.target_battery_percent
  AND ($1::uuid IS NULL OR r.hub_id=$1) AND EXISTS(SELECT 1 FROM parking_spaces p WHERE p.hub_id=r.hub_id AND p.private_vehicle_id=v.id AND p.status='occupied')`,
        [hubId ?? null],
      )
    ).rows;
  }
  async points(c: PoolClient, hubId: string) {
    return (
      await c.query<{ id: string }>(
        "SELECT id FROM charging_points WHERE hub_id=$1 AND status='available' ORDER BY code,id",
        [hubId],
      )
    ).rows;
  }
  async sessions(c: PoolClient) {
    return (
      await c.query<ChargingSessionView>(
        `${sessionView} ORDER BY CASE WHEN s.status IN ('scheduled','charging') THEN 0 ELSE 1 END, r.created_at DESC, s.id`,
      )
    ).rows;
  }
  async view(c: PoolClient, id: string) {
    return (
      await c.query<ChargingSessionView>(`${sessionView} WHERE s.id=$1`, [id])
    ).rows[0];
  }
  async locate(c: PoolClient, id: string) {
    return (
      await c.query(
        "SELECT r.hub_id,r.private_vehicle_id,r.id AS request_id,s.charging_point_id FROM charging_sessions s JOIN charging_requests r ON r.id=s.request_id WHERE s.id=$1",
        [id],
      )
    ).rows[0];
  }
  async lockSession(c: PoolClient, id: string) {
    return (
      await c.query("SELECT * FROM charging_sessions WHERE id=$1 FOR UPDATE", [
        id,
      ])
    ).rows[0];
  }
  async lockRequest(c: PoolClient, id: string) {
    return (
      await c.query("SELECT * FROM charging_requests WHERE id=$1 FOR UPDATE", [
        id,
      ])
    ).rows[0];
  }
  async lockPoint(c: PoolClient, id: string) {
    return (
      await c.query("SELECT * FROM charging_points WHERE id=$1 FOR UPDATE", [
        id,
      ])
    ).rows[0];
  }
  async change(c: PoolClient, id: string, status: string) {
    await c.query(
      "UPDATE charging_sessions SET status=$2,started_at=CASE WHEN $2='charging' THEN clock_timestamp() ELSE started_at END,ended_at=CASE WHEN $2 IN ('completed','cancelled') THEN clock_timestamp() ELSE ended_at END WHERE id=$1",
      [id, status],
    );
  }
  async finish(
    c: PoolClient,
    requestId: string,
    pointId: string,
    vehicleId: string,
    status: string,
    battery?: number,
  ) {
    if (battery !== undefined)
      await c.query(
        "UPDATE private_vehicles SET battery_percent=$2 WHERE id=$1",
        [vehicleId, battery],
      );
    await c.query("UPDATE charging_requests SET status=$2 WHERE id=$1", [
      requestId,
      status,
    ]);
    await c.query(
      "UPDATE charging_points SET status='available' WHERE id=$1 AND status='occupied'",
      [pointId],
    );
  }
}
