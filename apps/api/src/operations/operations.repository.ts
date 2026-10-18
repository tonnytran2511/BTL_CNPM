import { Inject, Injectable } from "@nestjs/common";
import type { PoolClient } from "pg";
import type {
  CreateIncidentRequest,
  Incident,
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
    return (
      await client.query(
        `INSERT INTO incidents(resource_type,resource_id,description,reported_by)
      VALUES($1,$2,$3,$4) RETURNING id,resource_type AS "resourceType",resource_id AS "resourceId",
      description,status,reported_by AS "reportedBy",created_at AS "createdAt",resolved_at AS "resolvedAt"`,
        [input.resourceType, input.resourceId, input.description.trim(), actor],
      )
    ).rows[0];
  }
  async resolveIncident(
    client: PoolClient,
    id: string,
  ): Promise<Incident | undefined> {
    return (
      await client.query(
        `UPDATE incidents SET status='resolved',resolved_at=now() WHERE id=$1 AND status='open'
      RETURNING id,resource_type AS "resourceType",resource_id AS "resourceId",description,status,
      reported_by AS "reportedBy",created_at AS "createdAt",resolved_at AS "resolvedAt"`,
        [id],
      )
    ).rows[0];
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
        "SELECT id,status FROM hubs WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE",
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
  async start(client: PoolClient, id: string) {
    await client.query(
      "UPDATE redistributions SET status='in_progress',started_at=now() WHERE id=$1",
      [id],
    );
    return (await this.order(client, id))!;
  }
  async cancel(client: PoolClient, id: string) {
    await client.query(
      "UPDATE redistributions SET status='cancelled' WHERE id=$1",
      [id],
    );
    return (await this.order(client, id))!;
  }
}
