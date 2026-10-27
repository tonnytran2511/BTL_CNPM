import { Injectable } from "@nestjs/common";
import type { PoolClient } from "pg";

/** Read-only projection owned by mobility, shared with the simulation module. */
@Injectable()
export class MobilitySnapshotRepository {
  async parking(c: PoolClient, hubId: string, horizonMinutes: number) {
    return (
      await c.query<{ id: string }>(
        `
      SELECT p.id FROM parking_spaces p
      WHERE p.hub_id=$1 AND (p.status='available' OR
        (p.status='held' AND p.hold_expires_at<=transaction_timestamp()))
      AND NOT EXISTS (SELECT 1 FROM parking_bookings b WHERE b.parking_space_id=p.id
        AND b.status IN ('reserved','checked_in')
        AND b.starts_at < transaction_timestamp()+$2*interval '1 minute'
        AND b.ends_at > transaction_timestamp())
      ORDER BY p.id`,
        [hubId, horizonMinutes],
      )
    ).rows.map((p) => p.id);
  }
  async points(c: PoolClient, hubId: string) {
    return (
      await c.query<{
        id: string;
        status: "available" | "occupied" | "failed";
        activeSession: boolean;
      }>(
        `
      SELECT p.id, CASE WHEN EXISTS (SELECT 1 FROM incidents i
        WHERE i.resource_type='charging_point' AND i.resource_id=p.id AND i.status='open')
        THEN 'failed' ELSE p.status END AS status,
        EXISTS (SELECT 1 FROM charging_sessions s WHERE s.charging_point_id=p.id
          AND s.status IN ('scheduled','charging')) AS "activeSession"
      FROM charging_points p WHERE p.hub_id=$1 ORDER BY p.id`,
        [hubId],
      )
    ).rows;
  }
}
