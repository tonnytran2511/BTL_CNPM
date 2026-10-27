import {
  Inject,
  Injectable,
  InternalServerErrorException,
} from "@nestjs/common";
import type { PoolClient } from "pg";
import type {
  HubDetail,
  HubSummary,
  VehicleSummary,
  ChargingPointSummary,
} from "@emobility/contracts";
import { Database } from "../database/database.module";
@Injectable()
export class HubsRepository {
  constructor(@Inject(Database) private readonly db: Database) {}
  async snapshotCapturedAt(client: PoolClient): Promise<string> {
    const clock = await client.query<{ captured: Date }>(
      "SELECT transaction_timestamp() AS captured",
    );
    return clock.rows[0].captured.toISOString();
  }
  private async threshold(client?: PoolClient): Promise<number> {
    const result = client
      ? await client.query("SELECT value FROM settings WHERE key=$1", [
          "lowBatteryThreshold",
        ])
      : await this.db.query("SELECT value FROM settings WHERE key=$1", [
          "lowBatteryThreshold",
        ]);
    const value: unknown = result.rows[0]?.value;
    if (
      typeof value !== "number" ||
      !Number.isInteger(value) ||
      value < 0 ||
      value > 100
    )
      throw new InternalServerErrorException(
        "Cấu hình ngưỡng pin chưa hợp lệ.",
      );
    return value;
  }
  async summaries(client?: PoolClient): Promise<HubSummary[]> {
    const threshold = await this.threshold(client);
    const query = (sql: string, values: unknown[]) =>
      client ? client.query(sql, values) : this.db.query(sql, values);
    const result = await query(
      `
      SELECT h.id,h.name,h.location,h.status,
        json_build_object('capacity',p.capacity,'occupied',p.occupied,'held',p.held,
          'available',CASE WHEN h.status='active' THEN p.capacity-p.occupied-p.held ELSE 0 END) AS parking,
        json_build_object('total',v.total,'available',CASE WHEN h.status='active' THEN v.available ELSE 0 END,'lowBattery',v.low_battery) AS vehicles,
        json_build_object('total',c.total,'available',CASE WHEN h.status='active' THEN c.available ELSE 0 END,'occupied',c.occupied,'failed',c.failed) AS charging,
        CASE WHEN p.capacity=0 THEN 0 ELSE round(100.0*(p.occupied+p.held)/p.capacity)::float END AS "utilizationPercent"
      FROM hubs h
      CROSS JOIN LATERAL (SELECT count(*)::int AS capacity,
        count(*) FILTER(WHERE status='occupied')::int AS occupied,
        count(*) FILTER(WHERE status='held' AND hold_expires_at>now())::int AS held
        FROM parking_spaces WHERE hub_id=h.id) p
      CROSS JOIN LATERAL (SELECT count(*)::int AS total,
        count(*) FILTER(WHERE status='available')::int AS available,
        count(*) FILTER(WHERE battery_percent<$1)::int AS low_battery FROM vehicles WHERE hub_id=h.id) v
      CROSS JOIN LATERAL (SELECT count(*)::int AS total,
        count(*) FILTER(WHERE status='available')::int AS available,
        count(*) FILTER(WHERE status='occupied')::int AS occupied,
        count(*) FILTER(WHERE status='failed')::int AS failed FROM charging_points WHERE hub_id=h.id) c
      ORDER BY h.name`,
      [threshold],
    );
    return result.rows as HubSummary[];
  }
  async detail(id: string, client: PoolClient): Promise<HubDetail | null> {
    const hub = (await this.summaries(client)).find((h) => h.id === id);
    if (!hub) return null;
    const vehicles = await client.query<VehicleSummary>(
      'SELECT id,code,type,battery_percent AS "batteryPercent",status FROM vehicles WHERE hub_id=$1 ORDER BY code',
      [id],
    );
    const points = await client.query<ChargingPointSummary>(
      "SELECT id,code,status FROM charging_points WHERE hub_id=$1 ORDER BY code",
      [id],
    );
    return { ...hub, vehicleList: vehicles.rows, chargingPoints: points.rows };
  }
  snapshot<T>(work: (client: PoolClient) => Promise<T>) {
    return this.db.readSnapshot(work);
  }
}
