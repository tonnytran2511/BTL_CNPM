import { Inject, Injectable } from "@nestjs/common";
import type { PoolClient } from "pg";
import type {
  User,
  PrivateVehicle,
  ParkingBooking,
  ChargingQueueEntry,
} from "@emobility/contracts";
import { Database } from "../database/database.module";
import type {
  RegisterVehicleDto,
  ReserveParkingDto,
  CreateChargingDto,
} from "./mobility.dto";
const bookingSelect = `SELECT b.id,b.private_vehicle_id AS "privateVehicleId", b.parking_space_id AS "parkingSpaceId",
  p.hub_id AS "hubId",h.name AS "hubName",v.code AS "vehicleCode",p.code AS "spaceCode",
  b.starts_at AS "startsAt",b.ends_at AS "endsAt",b.status
  FROM parking_bookings b JOIN parking_spaces p ON p.id=b.parking_space_id
  JOIN hubs h ON h.id=p.hub_id JOIN private_vehicles v ON v.id=b.private_vehicle_id`;
const availableSql = `SELECT p.id FROM parking_spaces p
  WHERE p.hub_id=$1 AND (p.status='available' OR (p.status='held' AND p.hold_expires_at<=now()))
  AND NOT EXISTS (SELECT 1 FROM parking_bookings b WHERE b.parking_space_id=p.id
    AND b.status IN ('reserved','checked_in') AND tstzrange(b.starts_at,b.ends_at,'[)') && tstzrange($2::timestamptz,$3::timestamptz,'[)'))
  ORDER BY p.code`;
@Injectable()
export class MobilityRepository {
  constructor(@Inject(Database) private readonly db: Database) {}
  transaction<T>(work: (c: PoolClient) => Promise<T>) {
    return this.db.transaction(work);
  }
  async activeHub(c: PoolClient, id: string) {
    return (
      await c.query("SELECT id,status FROM hubs WHERE id=$1 FOR UPDATE", [id])
    ).rows[0];
  }
  async setting(c: PoolClient, key: string) {
    return (await c.query("SELECT value FROM settings WHERE key=$1", [key]))
      .rows[0]?.value as unknown;
  }
  async vehicles(owner: string): Promise<PrivateVehicle[]> {
    return (
      await this.db.query<PrivateVehicle>(
        'SELECT id,code,type,battery_percent AS "batteryPercent" FROM private_vehicles WHERE owner_id=$1 ORDER BY code',
        [owner],
      )
    ).rows;
  }
  async register(c: PoolClient, owner: string, input: RegisterVehicleDto) {
    return (
      await c.query<PrivateVehicle>(
        'INSERT INTO private_vehicles(owner_id,code,type,battery_percent) VALUES($1,$2,$3,$4) RETURNING id,code,type,battery_percent AS "batteryPercent"',
        [owner, input.code.trim(), input.type, input.batteryPercent],
      )
    ).rows[0];
  }
  async privateVehicle(c: PoolClient, id: string) {
    return (
      await c.query("SELECT * FROM private_vehicles WHERE id=$1 FOR UPDATE", [
        id,
      ])
    ).rows[0];
  }
  async rentalVehicle(c: PoolClient, id: string) {
    return (
      await c.query("SELECT * FROM vehicles WHERE id=$1 FOR UPDATE", [id])
    ).rows[0];
  }
  async available(c: PoolClient, hub: string, start: string, end: string) {
    return (await c.query(availableSql, [hub, start, end])).rows as {
      id: string;
    }[];
  }
  async reserve(
    c: PoolClient,
    user: string,
    input: ReserveParkingDto,
    space: string,
  ) {
    const row = (
      await c.query(
        "INSERT INTO parking_bookings(user_id,private_vehicle_id,parking_space_id,starts_at,ends_at) VALUES($1,$2,$3,$4,$5) RETURNING id",
        [user, input.privateVehicleId, space, input.startsAt, input.endsAt],
      )
    ).rows[0];
    return (
      await c.query<ParkingBooking>(`${bookingSelect} WHERE b.id=$1`, [row.id])
    ).rows[0];
  }
  async bookings(user: string): Promise<ParkingBooking[]> {
    return (
      await this.db.query<ParkingBooking>(
        `${bookingSelect} WHERE b.user_id=$1 ORDER BY b.starts_at DESC`,
        [user],
      )
    ).rows;
  }
  async bookingHub(c: PoolClient, id: string) {
    return (
      await c.query(
        "SELECT p.hub_id FROM parking_bookings b JOIN parking_spaces p ON p.id=b.parking_space_id WHERE b.id=$1",
        [id],
      )
    ).rows[0]?.hub_id as string | undefined;
  }
  async booking(c: PoolClient, id: string) {
    return (
      await c.query("SELECT * FROM parking_bookings WHERE id=$1 FOR UPDATE", [
        id,
      ])
    ).rows[0];
  }
  async bookingStatus(c: PoolClient, id: string, status: string) {
    await c.query("UPDATE parking_bookings SET status=$2 WHERE id=$1", [
      id,
      status,
    ]);
    return (
      await c.query<ParkingBooking>(`${bookingSelect} WHERE b.id=$1`, [id])
    ).rows[0];
  }
  async occupyPrivate(c: PoolClient, space: string, vehicle: string) {
    return (
      await c.query(
        "UPDATE parking_spaces SET status='occupied',private_vehicle_id=$2,hold_expires_at=NULL WHERE id=$1 AND (status='available' OR (status='held' AND hold_expires_at<=now())) RETURNING id",
        [space, vehicle],
      )
    ).rowCount;
  }
  async releasePrivate(c: PoolClient, space: string, vehicle: string) {
    return (
      await c.query(
        "UPDATE parking_spaces SET status='available',private_vehicle_id=NULL WHERE id=$1 AND status='occupied' AND private_vehicle_id=$2 RETURNING id",
        [space, vehicle],
      )
    ).rowCount;
  }
  async departureRequests(c: PoolClient, vehicle: string) {
    const allocated = await c.query(
      "SELECT id FROM charging_requests WHERE private_vehicle_id=$1 AND status='allocated' FOR UPDATE",
      [vehicle],
    );
    if (allocated.rowCount) return false;
    await c.query(
      "UPDATE charging_requests SET status='cancelled' WHERE private_vehicle_id=$1 AND status='queued'",
      [vehicle],
    );
    return true;
  }
  async privateLocation(c: PoolClient, vehicle: string, hub: string) {
    return (
      await c.query(
        "SELECT id FROM parking_spaces WHERE private_vehicle_id=$1 AND hub_id=$2 AND status='occupied'",
        [vehicle, hub],
      )
    ).rowCount;
  }
  async queue(user: User): Promise<ChargingQueueEntry[]> {
    return (
      await this.db.query<ChargingQueueEntry>(
        `SELECT r.id,r.hub_id AS "hubId",h.name AS "hubName",coalesce(v.code,p.code) AS "vehicleCode",
      r.target_battery_percent AS "targetBatteryPercent",r.required_by AS "requiredBy",r.created_at AS "createdAt",r.status
      FROM charging_requests r JOIN hubs h ON h.id=r.hub_id LEFT JOIN vehicles v ON v.id=r.vehicle_id
      LEFT JOIN private_vehicles p ON p.id=r.private_vehicle_id WHERE ($2::boolean OR r.user_id=$1) ORDER BY r.created_at,r.id`,
        [user.id, user.role === "operator"],
      )
    ).rows;
  }
  async charge(c: PoolClient, user: string, input: CreateChargingDto) {
    const r = (
      await c.query(
        "INSERT INTO charging_requests(user_id,hub_id,vehicle_id,private_vehicle_id,target_battery_percent,required_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,status",
        [
          user,
          input.hubId,
          input.vehicle.kind === "rental" ? input.vehicle.id : null,
          input.vehicle.kind === "private" ? input.vehicle.id : null,
          input.targetBatteryPercent,
          input.requiredBy ?? null,
        ],
      )
    ).rows[0];
    return r as { id: string; status: "queued" };
  }
  async releaseRental(c: PoolClient, vehicle: string, hub: string) {
    return (
      await c.query(
        "UPDATE parking_spaces SET status='available',vehicle_id=NULL WHERE hub_id=$1 AND vehicle_id=$2 AND status='occupied' RETURNING id",
        [hub, vehicle],
      )
    ).rowCount;
  }
  async claimRental(c: PoolClient, vehicle: string, hub: string) {
    // Rental returns have no departure time. Do not consume a future promised space.
    const p = (
      await c.query(
        `SELECT p.id FROM parking_spaces p WHERE hub_id=$1
      AND (status='available' OR (status='held' AND hold_expires_at<=now()))
      AND NOT EXISTS(SELECT 1 FROM parking_bookings b WHERE b.parking_space_id=p.id
        AND b.status IN ('reserved','checked_in') AND b.ends_at>now())
      ORDER BY code LIMIT 1 FOR UPDATE OF p`,
        [hub],
      )
    ).rows[0];
    if (!p) return null;
    await c.query(
      "UPDATE parking_spaces SET status='occupied',vehicle_id=$2,hold_expires_at=NULL WHERE id=$1",
      [p.id, vehicle],
    );
    return p.id as string;
  }
  async idempotent<T>(
    c: PoolClient,
    actor: string,
    operation: string,
    key: string,
    payload: string,
    work: () => Promise<T>,
  ): Promise<{ conflict: boolean; result?: T }> {
    await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
      JSON.stringify([actor, operation, key]),
    ]);
    const old = (
      await c.query(
        "SELECT payload,response FROM mobility_idempotency WHERE actor_id=$1 AND operation=$2 AND key=$3",
        [actor, operation, key],
      )
    ).rows[0];
    if (old)
      return old.payload === payload
        ? { conflict: false, result: old.response as T }
        : { conflict: true };
    const result = await work();
    await c.query(
      "INSERT INTO mobility_idempotency(actor_id,operation,key,payload,response) VALUES($1,$2,$3,$4,$5)",
      [actor, operation, key, payload, JSON.stringify(result)],
    );
    return { conflict: false, result };
  }
}
