import {
  Inject,
  Injectable,
  InternalServerErrorException,
} from "@nestjs/common";
import type { PoolClient } from "pg";
import type {
  RentableVehicle,
  RentalChargingCandidate,
  VehicleReservationView,
} from "@emobility/contracts";
import { Database } from "../database/database.module";
import {
  VEHICLE_STATUS_BY_EVENT,
  type RentalEvent,
  type ReservationStatus,
  type VehicleStatus,
  type VehicleType,
} from "./rental.rules";

export interface VehicleFilter {
  hubId?: string;
  type?: VehicleType;
  minBatteryPercent: number;
}

/** Xe đã khóa hàng (FOR UPDATE) trong transaction đang chạy. */
export interface LockedVehicle {
  id: string;
  hubId: string | null;
  hubStatus: "active" | "inactive" | null;
  status: VehicleStatus;
  batteryPercent: number;
}

export interface LockedReservation {
  id: string;
  userId: string;
  vehicleId: string;
  status: ReservationStatus;
}

interface ReservationRow {
  id: string;
  status: ReservationStatus;
  created_at: Date;
  expires_at: Date;
  closed_at: Date | null;
  vehicle_id: string;
  vehicle_code: string;
  vehicle_type: VehicleType;
  battery_percent: number;
  hub_id: string;
  hub_name: string;
  hub_location: string;
}

const RESERVATION_VIEW_SQL = `
  SELECT r.id, r.status, r.created_at, r.expires_at, r.closed_at,
         v.id AS vehicle_id, v.code AS vehicle_code, v.type AS vehicle_type, v.battery_percent,
         h.id AS hub_id, h.name AS hub_name, h.location AS hub_location
    FROM vehicle_reservations r
    JOIN vehicles v ON v.id = r.vehicle_id
    JOIN hubs h ON h.id = r.source_hub_id`;

function toView(row: ReservationRow): VehicleReservationView {
  return {
    id: row.id,
    status: row.status,
    createdAt: row.created_at.toISOString(),
    expiresAt: row.expires_at.toISOString(),
    closedAt: row.closed_at ? row.closed_at.toISOString() : null,
    vehicle: {
      id: row.vehicle_id,
      code: row.vehicle_code,
      type: row.vehicle_type,
      batteryPercent: row.battery_percent,
    },
    hub: { id: row.hub_id, name: row.hub_name, location: row.hub_location },
  };
}

/**
 * Các thao tác SQL chạy trong MỘT transaction (T07). Chỉ chứa truy cập dữ liệu;
 * quyết định nghiệp vụ (được đặt không, ai được hủy) nằm ở ReservationService.
 */
export class RentalTx {
  constructor(private readonly client: PoolClient) {}

  /** Khóa hàng xe để hai yêu cầu cùng xe được xử lý tuần tự. */
  async lockVehicle(id: string): Promise<LockedVehicle | null> {
    const result = await this.client.query<{
      id: string;
      hub_id: string | null;
      hub_status: "active" | "inactive" | null;
      status: VehicleStatus;
      battery_percent: number;
    }>(
      `SELECT v.id, v.hub_id, h.status AS hub_status, v.status, v.battery_percent
         FROM vehicles v LEFT JOIN hubs h ON h.id = v.hub_id
        WHERE v.id = $1
          FOR UPDATE OF v`,
      [id],
    );
    const row = result.rows[0];
    return row
      ? {
          id: row.id,
          hubId: row.hub_id,
          hubStatus: row.hub_status,
          status: row.status,
          batteryPercent: row.battery_percent,
        }
      : null;
  }

  /** Đổi trạng thái xe theo sự kiện bằng cập nhật có điều kiện (WHERE status = from). */
  async moveVehicle(id: string, event: RentalEvent): Promise<boolean> {
    const { from, to } = VEHICLE_STATUS_BY_EVENT[event];
    const result = await this.client.query(
      "UPDATE vehicles SET status=$2, updated_at=now() WHERE id=$1 AND status=$3",
      [id, to, from],
    );
    return result.rowCount === 1;
  }

  /** Hạn giữ tính bằng đồng hồ database, cùng nguồn thời gian với created_at. */
  async insertReservation(input: {
    userId: string;
    vehicleId: string;
    hubId: string;
    holdMinutes: number;
  }): Promise<string> {
    const result = await this.client.query<{ id: string }>(
      `INSERT INTO vehicle_reservations(user_id, vehicle_id, source_hub_id, expires_at)
       VALUES ($1, $2, $3, now() + $4::integer * interval '1 minute')
       RETURNING id`,
      [input.userId, input.vehicleId, input.hubId, input.holdMinutes],
    );
    return result.rows[0].id;
  }

  async lockReservation(id: string): Promise<LockedReservation | null> {
    const result = await this.client.query<{
      id: string;
      user_id: string;
      vehicle_id: string;
      status: ReservationStatus;
    }>(
      "SELECT id, user_id, vehicle_id, status FROM vehicle_reservations WHERE id=$1 FOR UPDATE",
      [id],
    );
    const row = result.rows[0];
    return row
      ? {
          id: row.id,
          userId: row.user_id,
          vehicleId: row.vehicle_id,
          status: row.status,
        }
      : null;
  }

  /** active -> trạng thái kết thúc. Trả false nếu reservation không còn active. */
  async closeReservation(
    id: string,
    to: Exclude<ReservationStatus, "active">,
  ): Promise<boolean> {
    const result = await this.client.query(
      "UPDATE vehicle_reservations SET status=$2, closed_at=now() WHERE id=$1 AND status='active'",
      [id, to],
    );
    return result.rowCount === 1;
  }

  async view(id: string): Promise<VehicleReservationView> {
    const result = await this.client.query<ReservationRow>(
      `${RESERVATION_VIEW_SQL} WHERE r.id = $1`,
      [id],
    );
    if (!result.rows[0])
      throw new InternalServerErrorException("Không đọc lại được lượt đặt xe.");
    return toView(result.rows[0]);
  }
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

  /** Thời hạn giữ xe (phút) lấy từ settings, không có số dự phòng (BR-01). */
  async reservationHoldMinutes(): Promise<number> {
    const result = await this.db.query<{ value: unknown }>(
      "SELECT value FROM settings WHERE key=$1",
      ["reservationHoldMinutes"],
    );
    const value = result.rows[0]?.value;
    if (typeof value !== "number" || !Number.isInteger(value) || value <= 0)
      throw new InternalServerErrorException(
        "Cấu hình thời gian giữ xe chưa hợp lệ.",
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

  /** Lượt đặt của chính người dùng, mới nhất trước. Chưa phân trang: giới hạn 100 dòng. */
  async listReservations(userId: string): Promise<VehicleReservationView[]> {
    const result = await this.db.query<ReservationRow>(
      `${RESERVATION_VIEW_SQL} WHERE r.user_id = $1 ORDER BY r.created_at DESC, r.id LIMIT 100`,
      [userId],
    );
    return result.rows.map(toView);
  }

  /** Transaction nằm ở lớp data access (AGENTS.md); service chỉ truyền logic vào. */
  inTransaction<T>(work: (tx: RentalTx) => Promise<T>): Promise<T> {
    return this.db.transaction((client) => work(new RentalTx(client)));
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
  async chargingCandidates(c: PoolClient): Promise<RentalChargingCandidate[]> {
    return (
      await c.query<RentalChargingCandidate>(`SELECT v.id,v.code,v.hub_id AS "hubId",h.name AS "hubName",v.battery_percent AS "batteryPercent"
      FROM vehicles v JOIN hubs h ON h.id=v.hub_id WHERE v.status='available' AND h.status='active' AND v.battery_percent<100
      AND EXISTS(SELECT 1 FROM parking_spaces p WHERE p.vehicle_id=v.id AND p.hub_id=v.hub_id AND p.status='occupied')
      AND NOT EXISTS(SELECT 1 FROM vehicle_reservations a WHERE a.vehicle_id=v.id AND a.status='active')
      AND NOT EXISTS(SELECT 1 FROM trips a WHERE a.vehicle_id=v.id AND a.status='active')
      AND NOT EXISTS(SELECT 1 FROM charging_requests a WHERE a.vehicle_id=v.id AND a.status IN ('queued','allocated'))
      ORDER BY h.name,v.code`)
    ).rows;
  }
  async lockChargingVehicle(c: PoolClient, id: string) {
    return (
      await c.query<{
        id: string;
        hub_id: string | null;
        status: VehicleStatus;
        battery_percent: number;
        hub_status: "active" | "inactive" | null;
        parked: boolean;
        busy: boolean;
      }>(
        `SELECT v.id,v.hub_id,v.status,v.battery_percent,h.status AS hub_status,
      EXISTS(SELECT 1 FROM parking_spaces p WHERE p.vehicle_id=v.id AND p.hub_id=v.hub_id AND p.status='occupied') AS parked,
      (EXISTS(SELECT 1 FROM vehicle_reservations a WHERE a.vehicle_id=v.id AND a.status='active') OR
       EXISTS(SELECT 1 FROM trips a WHERE a.vehicle_id=v.id AND a.status='active')) AS busy
      FROM vehicles v LEFT JOIN hubs h ON h.id=v.hub_id WHERE v.id=$1 FOR UPDATE OF v`,
        [id],
      )
    ).rows[0];
  }
  async claimChargingVehicle(c: PoolClient, id: string, hub: string) {
    return (
      (
        await c.query(
          "UPDATE vehicles SET status='charging',updated_at=now() WHERE id=$1 AND hub_id=$2 AND status='available'",
          [id, hub],
        )
      ).rowCount === 1
    );
  }
  async releaseChargingVehicle(
    c: PoolClient,
    id: string,
    hub: string,
    battery?: number,
  ) {
    return (
      (
        await c.query(
          "UPDATE vehicles SET status='available',battery_percent=COALESCE($3::integer,battery_percent),updated_at=now() WHERE id=$1 AND hub_id=$2 AND status='charging'",
          [id, hub, battery ?? null],
        )
      ).rowCount === 1
    );
  }
}
