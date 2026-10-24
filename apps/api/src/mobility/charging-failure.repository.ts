import { Injectable } from "@nestjs/common";
import type { PoolClient } from "pg";
import type { ChargingPointFailureView } from "@emobility/contracts";
@Injectable()
export class ChargingFailureRepository {
  async point(c: PoolClient, id: string) {
    return (
      await c.query<{ hub_id: string }>(
        "SELECT hub_id FROM charging_points WHERE id=$1",
        [id],
      )
    ).rows[0];
  }
  async active(c: PoolClient, point: string) {
    return (
      await c.query<{
        id: string;
        request_id: string;
        private_vehicle_id: string | null;
        vehicle_id: string | null;
      }>(
        `SELECT s.id,s.request_id,r.private_vehicle_id,r.vehicle_id FROM charging_sessions s JOIN charging_requests r ON r.id=s.request_id WHERE s.charging_point_id=$1 AND s.status IN ('scheduled','charging')`,
        [point],
      )
    ).rows[0];
  }
  async fail(c: PoolClient, point: string) {
    await c.query("UPDATE charging_points SET status='failed' WHERE id=$1", [
      point,
    ]);
  }
  async recover(c: PoolClient, point: string) {
    await c.query(
      "UPDATE charging_points SET status='available' WHERE id=$1 AND status='failed'",
      [point],
    );
  }
  async interrupt(c: PoolClient, id: string, request: string, status: string) {
    await c.query(
      "UPDATE charging_sessions SET status='interrupted',ended_at=clock_timestamp() WHERE id=$1 AND status IN ('scheduled','charging')",
      [id],
    );
    await c.query(
      "UPDATE charging_requests SET status=$2 WHERE id=$1 AND status='allocated'",
      [request, status],
    );
  }
  async pin(c: PoolClient, id: string, battery: number) {
    await c.query(
      "UPDATE private_vehicles SET battery_percent=$2 WHERE id=$1",
      [id, battery],
    );
  }
  async overview(c: PoolClient): Promise<ChargingPointFailureView[]> {
    return (
      await c.query<ChargingPointFailureView>(`SELECT p.id,p.code,p.hub_id AS "hubId",h.name AS "hubName",p.status,
    s.id AS "sessionId",s.status AS "sessionStatus",COALESCE(v.code,f.code) AS "vehicleCode",
    CASE WHEN r.vehicle_id IS NOT NULL THEN 'rental' WHEN r.private_vehicle_id IS NOT NULL THEN 'private' ELSE NULL END AS "vehicleKind",
    COALESCE(v.battery_percent,f.battery_percent) AS "batteryPercent",r.target_battery_percent AS "targetBatteryPercent",
    (SELECT i.id FROM incidents i WHERE i.resource_type='charging_point' AND i.resource_id=p.id AND i.status='open' ORDER BY i.created_at,i.id LIMIT 1) AS "openIncidentId",
    (SELECT i.description FROM incidents i WHERE i.resource_type='charging_point' AND i.resource_id=p.id AND i.status='open' ORDER BY i.created_at,i.id LIMIT 1) AS "openIncidentDescription"
    FROM charging_points p JOIN hubs h ON h.id=p.hub_id LEFT JOIN charging_sessions s ON s.charging_point_id=p.id AND s.status IN ('scheduled','charging')
    LEFT JOIN charging_requests r ON r.id=s.request_id LEFT JOIN private_vehicles v ON v.id=r.private_vehicle_id LEFT JOIN vehicles f ON f.id=r.vehicle_id
    ORDER BY h.name,p.code,p.id`)
    ).rows;
  }
}
