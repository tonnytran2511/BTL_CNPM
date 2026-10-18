import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import type { PoolClient } from "pg";
import type {
  CreateIncidentRequest,
  Incident,
  Redistribution,
  RedistributionRequest,
} from "@emobility/contracts";
import { Database } from "../database/database.module";

@Injectable()
export class OperationsService {
  constructor(@Inject(Database) private readonly db: Database) {}

  async createIncident(
    input: CreateIncidentRequest,
    actorId: string,
  ): Promise<Incident> {
    return this.db.transaction(async (client) => {
      const exists = await this.resourceExists(
        client,
        input.resourceType,
        input.resourceId,
        true,
      );
      if (!exists) throw new NotFoundException("Không tìm thấy tài nguyên.");
      const result = await client.query(
        `INSERT INTO incidents(resource_type,resource_id,description,reported_by)
         VALUES($1,$2,$3,$4)
         RETURNING id,"resource_type" AS "resourceType","resource_id" AS "resourceId",
           description,status,reported_by AS "reportedBy",created_at AS "createdAt",resolved_at AS "resolvedAt"`,
        [
          input.resourceType,
          input.resourceId,
          input.description.trim(),
          actorId,
        ],
      );
      return result.rows[0] as Incident;
    });
  }

  async resolveIncident(id: string): Promise<Incident> {
    const result = await this.db.query(
      `UPDATE incidents SET status='resolved',resolved_at=now() WHERE id=$1 AND status='open'
       RETURNING id,resource_type AS "resourceType",resource_id AS "resourceId",description,status,
         reported_by AS "reportedBy",created_at AS "createdAt",resolved_at AS "resolvedAt"`,
      [id],
    );
    if (!result.rowCount) {
      const exists = await this.db.query(
        "SELECT 1 FROM incidents WHERE id=$1",
        [id],
      );
      if (!exists.rowCount)
        throw new NotFoundException("Không tìm thấy sự cố.");
      throw new ConflictException("Sự cố đã được xử lý.");
    }
    return result.rows[0] as Incident;
  }

  async createRedistribution(
    input: RedistributionRequest,
    actorId: string,
  ): Promise<Redistribution> {
    if (input.sourceHubId === input.targetHubId)
      throw new UnprocessableEntityException(
        "Hub nguồn và đích phải khác nhau.",
      );
    if (new Set(input.vehicleIds).size !== input.vehicleIds.length)
      throw new UnprocessableEntityException("Danh sách xe không được trùng.");
    return this.db.transaction(async (client) => {
      const hubs = await client.query(
        "SELECT id,status FROM hubs WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE",
        [[input.sourceHubId, input.targetHubId]],
      );
      if (hubs.rowCount !== 2)
        throw new NotFoundException("Không tìm thấy Hub nguồn hoặc đích.");
      if (hubs.rows.some((hub) => hub.status !== "active"))
        throw new ConflictException(
          "Chỉ điều chuyển giữa các Hub đang hoạt động.",
        );
      const vehicles = await client.query(
        `SELECT v.id FROM vehicles v WHERE v.id=ANY($1::uuid[]) AND v.hub_id=$2 AND v.status='available'
         ORDER BY v.id FOR UPDATE`,
        [input.vehicleIds, input.sourceHubId],
      );
      if (vehicles.rowCount !== input.vehicleIds.length)
        throw new ConflictException(
          "Mỗi xe phải đang khả dụng tại Hub nguồn và không có sự cố đang mở.",
        );
      const incident = await client.query(
        "SELECT 1 FROM incidents WHERE resource_type='vehicle' AND resource_id=ANY($1::uuid[]) AND status='open' LIMIT 1",
        [input.vehicleIds],
      );
      if (incident.rowCount)
        throw new ConflictException(
          "Mỗi xe phải đang khả dụng tại Hub nguồn và không có sự cố đang mở.",
        );
      const order = await client.query(
        `INSERT INTO redistributions(source_hub_id,target_hub_id,created_by)
         VALUES($1,$2,$3) RETURNING id,source_hub_id AS "sourceHubId",target_hub_id AS "targetHubId",
           status,created_by AS "createdBy",created_at AS "createdAt",started_at AS "startedAt",completed_at AS "completedAt"`,
        [input.sourceHubId, input.targetHubId, actorId],
      );
      const id = order.rows[0].id as string;
      await client.query(
        "INSERT INTO redistribution_vehicles(redistribution_id,vehicle_id) SELECT $1,unnest($2::uuid[])",
        [id, input.vehicleIds],
      );
      return {
        ...order.rows[0],
        vehicleIds: input.vehicleIds,
      } as Redistribution;
    });
  }

  async startRedistribution(id: string): Promise<Redistribution> {
    return this.db.transaction(async (client) => {
      const order = await this.loadOrder(client, id, true);
      if (!order)
        throw new NotFoundException("Không tìm thấy lệnh điều chuyển.");
      if (order.status !== "pending")
        throw new ConflictException("Chỉ lệnh đang chờ mới được bắt đầu.");
      const hubs = await client.query(
        "SELECT id,status FROM hubs WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE",
        [[order.sourceHubId, order.targetHubId]],
      );
      if (
        hubs.rowCount !== 2 ||
        hubs.rows.some((hub) => hub.status !== "active")
      )
        throw new ConflictException("Hub nguồn hoặc đích không còn hoạt động.");
      const vehicles = await client.query(
        `SELECT v.id FROM vehicles v JOIN redistribution_vehicles rv ON rv.vehicle_id=v.id
         WHERE rv.redistribution_id=$1 AND v.hub_id=$2 AND v.status='available'
         ORDER BY v.id FOR UPDATE OF v`,
        [id, order.sourceHubId],
      );
      if (vehicles.rowCount !== order.vehicleIds.length)
        throw new ConflictException(
          "Xe trong lệnh không còn đủ điều kiện điều chuyển.",
        );
      const incident = await client.query(
        "SELECT 1 FROM incidents WHERE resource_type='vehicle' AND resource_id=ANY($1::uuid[]) AND status='open' LIMIT 1",
        [order.vehicleIds],
      );
      if (incident.rowCount)
        throw new ConflictException(
          "Xe trong lệnh không còn đủ điều kiện điều chuyển.",
        );
      await client.query(
        "UPDATE vehicles SET status='redistributing',updated_at=now() WHERE id=ANY($1::uuid[])",
        [order.vehicleIds],
      );
      await client.query(
        "UPDATE redistributions SET status='in_progress',started_at=now() WHERE id=$1",
        [id],
      );
      return {
        ...order,
        status: "in_progress",
        startedAt: new Date().toISOString(),
      };
    });
  }

  async cancelRedistribution(id: string): Promise<Redistribution> {
    const result = await this.db.query(
      `UPDATE redistributions SET status='cancelled' WHERE id=$1 AND status='pending'
       RETURNING id,source_hub_id AS "sourceHubId",target_hub_id AS "targetHubId",status,
         created_by AS "createdBy",created_at AS "createdAt",started_at AS "startedAt",completed_at AS "completedAt"`,
      [id],
    );
    if (!result.rowCount) {
      const exists = await this.db.query(
        "SELECT status FROM redistributions WHERE id=$1",
        [id],
      );
      if (!exists.rowCount)
        throw new NotFoundException("Không tìm thấy lệnh điều chuyển.");
      throw new ConflictException("Chỉ lệnh đang chờ mới được hủy.");
    }
    const items = await this.db.query(
      "SELECT vehicle_id AS id FROM redistribution_vehicles WHERE redistribution_id=$1 ORDER BY vehicle_id",
      [id],
    );
    return {
      ...result.rows[0],
      vehicleIds: items.rows.map((row) => row.id),
    } as Redistribution;
  }

  private async loadOrder(client: PoolClient, id: string, lock: boolean) {
    const result = await client.query(
      `SELECT id,source_hub_id AS "sourceHubId",target_hub_id AS "targetHubId",status,
       created_by AS "createdBy",created_at AS "createdAt",started_at AS "startedAt",completed_at AS "completedAt"
       FROM redistributions WHERE id=$1 ${lock ? "FOR UPDATE" : ""}`,
      [id],
    );
    if (!result.rowCount) return undefined;
    const vehicles = await client.query(
      "SELECT vehicle_id AS id FROM redistribution_vehicles WHERE redistribution_id=$1 ORDER BY vehicle_id",
      [id],
    );
    return {
      ...result.rows[0],
      vehicleIds: vehicles.rows.map((row) => row.id),
    } as Redistribution;
  }

  private async resourceExists(
    client: PoolClient,
    type: CreateIncidentRequest["resourceType"],
    id: string,
    lock: boolean,
  ) {
    const tables = {
      vehicle: "vehicles",
      charging_point: "charging_points",
      hub: "hubs",
    } as const;
    const result = await client.query(
      `SELECT id FROM ${tables[type]} WHERE id=$1 ${lock ? "FOR UPDATE" : ""}`,
      [id],
    );
    return Boolean(result.rowCount);
  }
}
