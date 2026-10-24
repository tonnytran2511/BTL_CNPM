import { Inject, Injectable } from "@nestjs/common";
import type { PoolClient } from "pg";
import { OperationsRepository } from "./operations.repository";
@Injectable()
export class ChargingIncidentService {
  constructor(
    @Inject(OperationsRepository) private readonly repo: OperationsRepository,
  ) {}
  find(c: PoolClient, id: string) {
    return this.repo.incident(c, id);
  }
  list(c: PoolClient, point: string) {
    return this.repo.chargingIncidents(c, point);
  }
  async record(
    c: PoolClient,
    point: string,
    description: string,
    actor: string,
  ) {
    const existing = (await this.list(c, point)).find(
      (i) => i.status === "open",
    );
    return (
      existing ??
      this.repo.createIncident(
        c,
        { resourceType: "charging_point", resourceId: point, description },
        actor,
      )
    );
  }
  resolve(c: PoolClient, id: string, actor: string) {
    return this.repo.resolveIncident(c, id, actor);
  }
}
