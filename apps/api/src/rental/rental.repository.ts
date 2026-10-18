import {
  Inject,
  Injectable,
  InternalServerErrorException,
} from "@nestjs/common";
import type { RentableVehicle } from "@emobility/contracts";
import type { PoolClient } from "pg";
import { Database } from "../database/database.module";
import type { VehicleType } from "./rental.rules";

export interface VehicleFilter {
  hubId?: string;
  type?: VehicleType;
  minBatteryPercent: number;
}

@Injectable()
export class RentalRepository {
  constructor(@Inject(Database) private readonly db: Database) {}

  /** Settings are the only source of rental thresholds; there is no fallback number. */
  async minimumRentalBatteryPercent(): Promise<number> {
    const result = await this.db.query<{ value: unknown }>(
      "SELECT value FROM settings WHERE key=$1",
      ["minimumRentalBatteryPercent"],
    );
    const value = result.rows[0]?.value;
    if (
      typeof value !== "number" ||
      !Number.isInteger(value) ||
      value < 0 ||
      value > 100
    )
      throw new InternalServerErrorException(
        "Cấu hình pin tối thiểu để thuê xe chưa hợp lệ.",
      );
    return value;
  }

  async searchRentable(filter: VehicleFilter): Promise<RentableVehicle[]> {
    const result = await this.db.query<RentableVehicle>(
      `SELECT v.id, v.code, v.type, v.battery_percent AS "batteryPercent", v.status,
              h.id AS "hubId", h.name AS "hubName", h.location AS "hubLocation"
         FROM vehicles v
         JOIN hubs h ON h.id = v.hub_id
        WHERE h.status = 'active'
          AND v.status = 'available'
          AND v.battery_percent >= $1
          AND ($2::uuid IS NULL OR v.hub_id = $2::uuid)
          AND ($3::text IS NULL OR v.type = $3::text)
        ORDER BY v.battery_percent DESC, h.name, v.code`,
      [filter.minBatteryPercent, filter.hubId ?? null, filter.type ?? null],
    );
    return result.rows;
  }
  async lockRedistributionVehicles(
    client: PoolClient,
    ids: string[],
    hub: string,
  ) {
    return (
      await client.query(
        "SELECT id FROM vehicles WHERE id=ANY($1::uuid[]) AND hub_id=$2 AND status='available' ORDER BY id FOR UPDATE",
        [ids, hub],
      )
    ).rowCount;
  }
  async startRedistributionVehicles(
    client: PoolClient,
    ids: string[],
    hub: string,
  ) {
    return (
      await client.query(
        "UPDATE vehicles SET status='redistributing',updated_at=now() WHERE id=ANY($1::uuid[]) AND hub_id=$2 AND status='available'",
        [ids, hub],
      )
    ).rowCount;
  }
}
