import { Inject, Injectable } from "@nestjs/common";
import type { PoolClient } from "pg";
import type {
  CreateIncidentRequest,
  Incident,
  OperationLogEntry,
  Redistribution,
  RedistributionRequest,
} from "@emobility/contracts";
import { Database } from "../database/database.module";

@Injectable()
export class OperationsRepository {
  constructor(@Inject(Database) private readonly db: Database) {}
  transaction<T>(work: (client: PoolClient) => Promise<T>) {
    return this.db.transaction(work);
  }
  async recordLog(
    client: PoolClient,
    entry: Omit<OperationLogEntry, "id" | "actorName" | "occurredAt">,
  ) {
    await client.query(
      `INSERT INTO operation_logs(command_type,command_id,action,actor_id,from_status,to_status)
       VALUES($1,$2,$3,$4,$5,$6)`,
      [
        entry.commandType,
        entry.commandId,
        entry.action,
        entry.actorId,
        entry.fromStatus,
        entry.toStatus,
      ],
    );
  }
  async listIncidents(): Promise<Incident[]> {
    return (
      await this.db.query<Incident>(
        `SELECT id,resource_type AS "resourceType",resource_id AS "resourceId",description,status,
                reported_by AS "reportedBy",created_at AS "createdAt",resolved_at AS "resolvedAt"
           FROM incidents ORDER BY created_at DESC,id DESC LIMIT 200`,
      )
    ).rows;
  }
  async listRedistributions(): Promise<Redistribution[]> {
    const rows = (
      await this.db.query<Redistribution>(
        `SELECT r.id,r.source_hub_id AS "sourceHubId",r.target_hub_id AS "targetHubId",r.status,
                r.created_by AS "createdBy",r.created_at AS "createdAt",r.started_at AS "startedAt",
                r.completed_at AS "completedAt",
                coalesce(array_agg(rv.vehicle_id ORDER BY rv.vehicle_id) FILTER (WHERE rv.vehicle_id IS NOT NULL),'{}') AS "vehicleIds"
           FROM redistributions r LEFT JOIN redistribution_vehicles rv ON rv.redistribution_id=r.id
          GROUP BY r.id ORDER BY r.created_at DESC,r.id DESC LIMIT 200`,
      )
    ).rows;
    return rows;
  }
  async listLogs(): Promise<OperationLogEntry[]> {
    return (
      await this.db.query<
        Omit<OperationLogEntry, "occurredAt"> & { occurredAt: Date }
      >(
        `SELECT l.id,l.command_type AS "commandType",l.command_id AS "commandId",l.action,
                l.actor_id AS "actorId",u.name AS "actorName",l.from_status AS "fromStatus",
                l.to_status AS "toStatus",l.occurred_at AS "occurredAt"
           FROM operation_logs l JOIN users u ON u.id=l.actor_id
          ORDER BY l.occurred_at DESC,l.id DESC LIMIT 500`,
      )
    ).rows.map((row) => ({
      ...row,
      occurredAt: row.occurredAt.toISOString(),
    }));
  }
  async resourceExists(
    client: PoolClient,
    type: CreateIncidentRequest["resourceType"],
    id: string,
  ) {
    const tables = {
      vehicle: "vehicles",
      charging_point: "charging_points",
      hub: "hubs",
    } as const;
    return Boolean(
      (
        await client.query(
          `SELECT id FROM ${tables[type]} WHERE id=$1 FOR UPDATE`,
          [id],
        )
      ).rowCount,
    );
  }
  async createIncident(
    client: PoolClient,
    input: CreateIncidentRequest,
    actor: string,
  ): Promise<Incident> {
    const incident = (
      await client.query(
        `INSERT INTO incidents(resource_type,resource_id,description,reported_by)
      VALUES($1,$2,$3,$4) RETURNING id,resource_type AS "resourceType",resource_id AS "resourceId",
      description,status,reported_by AS "reportedBy",created_at AS "createdAt",resolved_at AS "resolvedAt"`,
        [input.resourceType, input.resourceId, input.description.trim(), actor],
      )
    ).rows[0];
    await this.recordLog(client, {
      commandType: "incident",
      commandId: incident.id,
      action: "created",
      actorId: actor,
      fromStatus: null,
      toStatus: "open",
    });
    return incident;
  }
  async resolveIncident(
    client: PoolClient,
    id: string,
    actor: string,
  ): Promise<Incident | undefined> {
    const incident = (
      await client.query(
        `UPDATE incidents SET status='resolved',resolved_at=now() WHERE id=$1 AND status='open'
      RETURNING id,resource_type AS "resourceType",resource_id AS "resourceId",description,status,
      reported_by AS "reportedBy",created_at AS "createdAt",resolved_at AS "resolvedAt"`,
        [id],
      )
    ).rows[0];
    if (incident)
      await this.recordLog(client, {
        commandType: "incident",
        commandId: incident.id,
        action: "resolved",
        actorId: actor,
        fromStatus: "open",
        toStatus: "resolved",
      });
    return incident;
  }
  async incidentExists(client: PoolClient, id: string) {
    return Boolean(
      (await client.query("SELECT id FROM incidents WHERE id=$1", [id]))
        .rowCount,
    );
  }
  async lockHubs(client: PoolClient, ids: string[]) {
    return (
      await client.query<{ id: string; status: string }>(
        "SELECT id,status FROM hubs WHERE id=ANY($1::uuid[]) ORDER BY id FOR NO KEY UPDATE",
        [ids],
      )
    ).rows;
  }
  async openVehicleIncident(client: PoolClient, ids: string[]) {
    return Boolean(
      (
        await client.query(
          "SELECT 1 FROM incidents WHERE resource_type='vehicle' AND resource_id=ANY($1::uuid[]) AND status='open' LIMIT 1",
          [ids],
        )
      ).rowCount,
    );
  }
  async createOrder(
    client: PoolClient,
    input: RedistributionRequest,
    actor: string,
  ): Promise<Redistribution> {
    const row = (
      await client.query(
        `INSERT INTO redistributions(source_hub_id,target_hub_id,created_by) VALUES($1,$2,$3)
      RETURNING id,source_hub_id AS "sourceHubId",target_hub_id AS "targetHubId",status,created_by AS "createdBy",
      created_at AS "createdAt",started_at AS "startedAt",completed_at AS "completedAt"`,
        [input.sourceHubId, input.targetHubId, actor],
      )
    ).rows[0];
    await client.query(
      "INSERT INTO redistribution_vehicles(redistribution_id,vehicle_id) SELECT $1,unnest($2::uuid[])",
      [row.id, input.vehicleIds],
    );
    await this.recordLog(client, {
      commandType: "redistribution",
      commandId: row.id,
      action: "created",
      actorId: actor,
      fromStatus: null,
      toStatus: "pending",
    });
    return { ...row, vehicleIds: input.vehicleIds };
  }
  async order(
    client: PoolClient,
    id: string,
  ): Promise<Redistribution | undefined> {
    const row = (
      await client.query(
        `SELECT id,source_hub_id AS "sourceHubId",target_hub_id AS "targetHubId",status,
      created_by AS "createdBy",created_at AS "createdAt",started_at AS "startedAt",completed_at AS "completedAt"
      FROM redistributions WHERE id=$1 FOR UPDATE`,
        [id],
      )
    ).rows[0];
    if (!row) return undefined;
    const items = (
      await client.query(
        "SELECT vehicle_id AS id FROM redistribution_vehicles WHERE redistribution_id=$1 ORDER BY vehicle_id",
        [id],
      )
    ).rows;
    return { ...row, vehicleIds: items.map((r) => r.id) };
  }
  async start(client: PoolClient, id: string, actor: string) {
    await client.query(
      "UPDATE redistributions SET status='in_progress',started_at=now() WHERE id=$1",
      [id],
    );
    await this.recordLog(client, {
      commandType: "redistribution",
      commandId: id,
      action: "started",
      actorId: actor,
      fromStatus: "pending",
      toStatus: "in_progress",
    });
    return (await this.order(client, id))!;
  }
  async cancel(client: PoolClient, id: string, actor: string) {
    await client.query(
      "UPDATE redistributions SET status='cancelled' WHERE id=$1",
      [id],
    );
    await this.recordLog(client, {
      commandType: "redistribution",
      commandId: id,
      action: "cancelled",
      actorId: actor,
      fromStatus: "pending",
      toStatus: "cancelled",
    });
    return (await this.order(client, id))!;
  }

  async complete(client: PoolClient, id: string, actor: string) {
    await client.query(
      "UPDATE redistributions SET status='completed',completed_at=now() WHERE id=$1 AND status='in_progress'",
      [id],
    );
    await this.recordLog(client, {
      commandType: "redistribution",
      commandId: id,
      action: "completed",
      actorId: actor,
      fromStatus: "in_progress",
      toStatus: "completed",
    });
    return (await this.order(client, id))!;
  }
  async incident(
    client: PoolClient,
    id: string,
  ): Promise<Incident | undefined> {
    return (
      await client.query<Incident>(
        `SELECT id,resource_type AS "resourceType",resource_id AS "resourceId",description,status,reported_by AS "reportedBy",created_at AS "createdAt",resolved_at AS "resolvedAt" FROM incidents WHERE id=$1`,
        [id],
      )
    ).rows[0];
  }
  async chargingIncidents(
    client: PoolClient,
    point: string,
  ): Promise<Incident[]> {
    return (
      await client.query<Incident>(
        `SELECT id,resource_type AS "resourceType",resource_id AS "resourceId",description,status,reported_by AS "reportedBy",created_at AS "createdAt",resolved_at AS "resolvedAt" FROM incidents WHERE resource_type='charging_point' AND resource_id=$1 ORDER BY created_at,id FOR UPDATE`,
        [point],
      )
    ).rows;
  }
}
