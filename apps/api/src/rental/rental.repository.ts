import {
  Inject,
  Injectable,
  InternalServerErrorException,
} from "@nestjs/common";
import type { PoolClient } from "pg";
import type {
  HubSuggestion,
  RentableVehicle,
  TripView,
  VehicleReservationView,
} from "@emobility/contracts";
import { Database } from "../database/database.module";
import {
  VEHICLE_STATUS_BY_EVENT,
  type RentalEvent,
  type ReservationStatus,
  type TripStatus,
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
  sourceHubId: string;
  status: ReservationStatus;
  /** Quá hạn giữ xe, tính theo đồng hồ database (cùng nguồn với expires_at). */
  expired: boolean;
}

export interface LockedTrip {
  id: string;
  userId: string;
  vehicleId: string;
  status: TripStatus;
  targetHubId: string | null;
}

interface TripRow {
  id: string;
  status: TripStatus;
  reservation_id: string;
  started_at: Date;
  ended_at: Date | null;
  start_battery_percent: number;
  end_battery_percent: number | null;
  vehicle_id: string;
  vehicle_code: string;
  vehicle_type: VehicleType;
  source_hub_id: string;
  source_hub_name: string;
  target_hub_id: string | null;
  target_hub_name: string | null;
}

const TRIP_VIEW_SQL = `
  SELECT t.id, t.status, t.reservation_id, t.started_at, t.ended_at,
         t.start_battery_percent, t.end_battery_percent,
         v.id AS vehicle_id, v.code AS vehicle_code, v.type AS vehicle_type,
         sh.id AS source_hub_id, sh.name AS source_hub_name,
         th.id AS target_hub_id, th.name AS target_hub_name
    FROM trips t
    JOIN vehicles v ON v.id = t.vehicle_id
    JOIN hubs sh ON sh.id = t.source_hub_id
    LEFT JOIN hubs th ON th.id = t.target_hub_id`;

function toTripView(row: TripRow): TripView {
  return {
    id: row.id,
    status: row.status,
    reservationId: row.reservation_id,
    startedAt: row.started_at.toISOString(),
    endedAt: row.ended_at ? row.ended_at.toISOString() : null,
    startBatteryPercent: row.start_battery_percent,
    endBatteryPercent: row.end_battery_percent,
    vehicle: {
      id: row.vehicle_id,
      code: row.vehicle_code,
      type: row.vehicle_type,
    },
    sourceHub: { id: row.source_hub_id, name: row.source_hub_name },
    targetHub:
      row.target_hub_id && row.target_hub_name
        ? { id: row.target_hub_id, name: row.target_hub_name }
        : null,
  };
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
  /** Client của transaction hiện tại; truyền cho AllocationPort để cùng một transaction (BR-02/BR-03). */
  constructor(readonly client: PoolClient) {}

  async lockHub(id: string) {
    await this.client.query("SELECT id FROM hubs WHERE id=$1 FOR UPDATE", [id]);
  }

  async reservationExpired(id: string): Promise<boolean> {
    const result = await this.client.query<{ expired: boolean }>(
      "SELECT expires_at <= clock_timestamp() AS expired FROM vehicle_reservations WHERE id=$1",
      [id],
    );
    return result.rows[0].expired;
  }

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
      source_hub_id: string;
      status: ReservationStatus;
      expired: boolean;
    }>(
      `SELECT id, user_id, vehicle_id, source_hub_id, status, (expires_at <= now()) AS expired
         FROM vehicle_reservations WHERE id=$1 FOR UPDATE`,
      [id],
    );
    const row = result.rows[0];
    return row
      ? {
          id: row.id,
          userId: row.user_id,
          vehicleId: row.vehicle_id,
          sourceHubId: row.source_hub_id,
          status: row.status,
          expired: row.expired,
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

  /** Nhận xe: reserved -> in_use và rời Hub (hub_id = NULL) để không còn tính vào tài nguyên Hub. */
  async departVehicle(id: string): Promise<boolean> {
    const { from, to } = VEHICLE_STATUS_BY_EVENT.pickup;
    const result = await this.client.query(
      "UPDATE vehicles SET status=$2, hub_id=NULL, updated_at=now() WHERE id=$1 AND status=$3",
      [id, to, from],
    );
    return result.rowCount === 1;
  }

  /** Trả xe: in_use -> available và xe thuộc Hub đích. */
  async arriveVehicle(id: string, hubId: string): Promise<boolean> {
    const { from, to } = VEHICLE_STATUS_BY_EVENT.return;
    const result = await this.client.query(
      "UPDATE vehicles SET status=$2, hub_id=$3, updated_at=now() WHERE id=$1 AND status=$4",
      [id, to, hubId, from],
    );
    return result.rowCount === 1;
  }

  async insertTrip(input: {
    reservationId: string;
    userId: string;
    vehicleId: string;
    sourceHubId: string;
    startBatteryPercent: number;
  }): Promise<string> {
    const result = await this.client.query<{ id: string }>(
      `INSERT INTO trips(reservation_id, user_id, vehicle_id, source_hub_id, start_battery_percent)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [
        input.reservationId,
        input.userId,
        input.vehicleId,
        input.sourceHubId,
        input.startBatteryPercent,
      ],
    );
    return result.rows[0].id;
  }

  async tripIdByReservation(reservationId: string): Promise<string | null> {
    const result = await this.client.query<{ id: string }>(
      "SELECT id FROM trips WHERE reservation_id=$1",
      [reservationId],
    );
    return result.rows[0]?.id ?? null;
  }

  async lockTrip(id: string): Promise<LockedTrip | null> {
    const result = await this.client.query<{
      id: string;
      user_id: string;
      vehicle_id: string;
      status: TripStatus;
      target_hub_id: string | null;
    }>(
      "SELECT id, user_id, vehicle_id, status, target_hub_id FROM trips WHERE id=$1 FOR UPDATE",
      [id],
    );
    const row = result.rows[0];
    return row
      ? {
          id: row.id,
          userId: row.user_id,
          vehicleId: row.vehicle_id,
          status: row.status,
          targetHubId: row.target_hub_id,
        }
      : null;
  }

  /** active -> completed. Trả false nếu chuyến không còn active. */
  async completeTrip(
    id: string,
    targetHubId: string,
    endBatteryPercent: number,
  ): Promise<boolean> {
    const result = await this.client.query(
      `UPDATE trips SET status='completed', target_hub_id=$2, ended_at=now(), end_battery_percent=$3
        WHERE id=$1 AND status='active'`,
      [id, targetHubId, endBatteryPercent],
    );
    return result.rowCount === 1;
  }

  async tripView(id: string): Promise<TripView> {
    const result = await this.client.query<TripRow>(
      `${TRIP_VIEW_SQL} WHERE t.id = $1`,
      [id],
    );
    if (!result.rows[0])
      throw new InternalServerErrorException("Không đọc lại được chuyến thuê.");
    return toTripView(result.rows[0]);
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

  /** Mọi chuyến đang chạy và tối đa 100 chuyến hoàn tất, chỉ của người gọi. */
  async listTrips(userId: string): Promise<TripView[]> {
    const result = await this.db.query<TripRow>(
      `${TRIP_VIEW_SQL} WHERE t.user_id = $1 AND (t.status='active' OR t.id IN (
        SELECT id FROM trips WHERE user_id=$1 AND status='completed' ORDER BY started_at DESC,id LIMIT 100
      )) ORDER BY t.started_at DESC, t.id`,
      [userId],
    );
    return result.rows.map(toTripView);
  }

  /**
   * Hub active khác Hub đã chọn còn chỗ trả xe (BR-03). Điều kiện "chỗ còn trống" phải giống
   * MobilityRepository.claimRental: chỗ trống hoặc held đã hết hạn, và không vướng lịch đặt đỗ chưa kết thúc.
   */
  async suggestHubs(excludeHubId: string): Promise<HubSuggestion[]> {
    const config = await this.db.query<{ value: unknown }>(
      "SELECT value FROM settings WHERE key=$1",
      ["returnHubSuggestionLimit"],
    );
    const limit = config.rows[0]?.value;
    if (
      typeof limit !== "number" ||
      !Number.isInteger(limit) ||
      limit <= 0 ||
      limit > 2_147_483_647
    )
      throw new InternalServerErrorException(
        "Cấu hình số Hub gợi ý chưa hợp lệ.",
      );
    const result = await this.db.query<HubSuggestion>(
      `SELECT h.id, h.name, h.location, count(*)::int AS "freeSpaces"
         FROM hubs h
         JOIN parking_spaces p ON p.hub_id = h.id
        WHERE h.status = 'active' AND h.id <> $1
          AND (p.status = 'available' OR (p.status = 'held' AND p.hold_expires_at <= now()))
          AND NOT EXISTS (
            SELECT 1 FROM parking_bookings b
             WHERE b.parking_space_id = p.id
               AND b.status IN ('reserved','checked_in') AND b.ends_at > now())
        GROUP BY h.id, h.name, h.location
        ORDER BY count(*) DESC, h.name
        LIMIT $2`,
      [excludeHubId, limit],
    );
    return result.rows;
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
}
