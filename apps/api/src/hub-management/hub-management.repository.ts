import {
  Inject,
  Injectable,
  InternalServerErrorException,
} from "@nestjs/common";
import type { PoolClient } from "pg";
import { Database } from "../database/database.module";
@Injectable()
export class HubManagementRepository {
  constructor(@Inject(Database) private readonly db: Database) {}
  transaction<T>(work: (client: PoolClient) => Promise<T>) {
    return this.db.transaction(work);
  }
  async lockHub(client: PoolClient, id: string) {
    return (
      (
        await client.query(
          "SELECT id,status FROM hubs WHERE id=$1 FOR UPDATE",
          [id],
        )
      ).rows[0] ?? null
    );
  }
  async create(
    client: PoolClient,
    input: { code: string; name: string; location: string },
  ) {
    return (
      await client.query(
        "INSERT INTO hubs(code,name,location) VALUES($1,$2,$3) RETURNING id,code,name,location,status",
        [
          input.code.trim().toUpperCase(),
          input.name.trim(),
          input.location.trim(),
        ],
      )
    ).rows[0];
  }
  async update(
    client: PoolClient,
    id: string,
    input: { name?: string; location?: string; status?: "active" | "inactive" },
  ) {
    return (
      (
        await client.query(
          "UPDATE hubs SET name=COALESCE($2,name),location=COALESCE($3,location),status=COALESCE($4,status) WHERE id=$1 RETURNING id,code,name,location,status",
          [
            id,
            input.name?.trim() ?? null,
            input.location?.trim() ?? null,
            input.status ?? null,
          ],
        )
      ).rows[0] ?? null
    );
  }
  async delete(client: PoolClient, id: string) {
    return Boolean(
      (await client.query("DELETE FROM hubs WHERE id=$1 RETURNING id", [id]))
        .rowCount,
    );
  }
  async hasOpenIncident(client: PoolClient, id: string) {
    return Boolean(
      (
        await client.query(
          "SELECT 1 FROM incidents WHERE resource_type='hub' AND resource_id=$1 AND status='open' LIMIT 1",
          [id],
        )
      ).rowCount,
    );
  }
  async capacity(client: PoolClient, hubId: string) {
    return (
      await client.query(
        "SELECT count(*)::int AS total,count(*) FILTER(WHERE p.status='occupied' OR (p.status='held' AND p.hold_expires_at>now()))::int AS protected FROM parking_spaces p WHERE p.hub_id=$1",
        [hubId],
      )
    ).rows[0] as { total: number; protected: number };
  }
  async maximumCapacity(client: PoolClient) {
    const value: unknown = (
      await client.query("SELECT value FROM settings WHERE key=$1", [
        "maxParkingCapacityPerHub",
      ])
    ).rows[0]?.value;
    if (
      typeof value !== "number" ||
      !Number.isSafeInteger(value) ||
      value < 0 ||
      value > 2147483647
    )
      throw new InternalServerErrorException(
        "Cấu hình sức chứa Hub chưa hợp lệ.",
      );
    return value;
  }
  async removableSpaces(client: PoolClient, hubId: string, count: number) {
    return (
      await client.query(
        "SELECT p.id,p.code FROM parking_spaces p WHERE p.hub_id=$1 AND p.status='available' AND NOT EXISTS(SELECT 1 FROM parking_bookings b WHERE b.parking_space_id=p.id) ORDER BY p.code DESC LIMIT $2 FOR UPDATE OF p",
        [hubId, count],
      )
    ).rows as { id: string; code: string }[];
  }
  async deleteSpaces(client: PoolClient, ids: string[]) {
    if (ids.length)
      await client.query(
        "DELETE FROM parking_spaces WHERE id=ANY($1::uuid[])",
        [ids],
      );
  }
  async spaceCodes(client: PoolClient, hubId: string) {
    return (
      await client.query("SELECT code FROM parking_spaces WHERE hub_id=$1", [
        hubId,
      ])
    ).rows.map((r) => String(r.code));
  }
  async addSpace(client: PoolClient, hubId: string, code: string) {
    await client.query(
      "INSERT INTO parking_spaces(hub_id,code) VALUES($1,$2)",
      [hubId, code],
    );
  }
  async addChargingPoint(client: PoolClient, hubId: string, code: string) {
    return (
      await client.query(
        "INSERT INTO charging_points(hub_id,code) VALUES($1,$2) RETURNING id,code,status",
        [hubId, code.trim().toUpperCase()],
      )
    ).rows[0];
  }
  async deleteChargingPoint(
    client: PoolClient,
    hubId: string,
    pointId: string,
  ) {
    return Boolean(
      (
        await client.query(
          "DELETE FROM charging_points cp WHERE cp.id=$1 AND cp.hub_id=$2 AND cp.status<>'occupied' AND NOT EXISTS(SELECT 1 FROM charging_sessions s WHERE s.charging_point_id=cp.id) RETURNING cp.id",
          [pointId, hubId],
        )
      ).rowCount,
    );
  }
  async lockChargingPoint(client: PoolClient, hubId: string, pointId: string) {
    return Boolean(
      (
        await client.query(
          "SELECT id FROM charging_points WHERE id=$1 AND hub_id=$2 FOR UPDATE",
          [pointId, hubId],
        )
      ).rowCount,
    );
  }
  async hasOpenChargingIncident(client: PoolClient, pointId: string) {
    return Boolean(
      (
        await client.query(
          "SELECT 1 FROM incidents WHERE resource_type='charging_point' AND resource_id=$1 AND status='open' LIMIT 1",
          [pointId],
        )
      ).rowCount,
    );
  }
}
