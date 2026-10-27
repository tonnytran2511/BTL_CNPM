import {
  Inject,
  Injectable,
  InternalServerErrorException,
} from "@nestjs/common";
import type { SimulationLimits } from "@emobility/contracts";
import { Database } from "../database/database.module";
import type { PoolClient } from "pg";
import type { SimulationRow } from "./simulation.persistence";
import type {
  SavedSimulation,
  ScenarioLimits,
  ScenarioSimulationResult,
  ScenarioSnapshot,
  SimulationHistoryPage,
} from "@emobility/contracts";

@Injectable()
export class SimulationRepository {
  constructor(@Inject(Database) private readonly db: Database) {}
  async limits(): Promise<SimulationLimits> {
    const keys = [
      "simulationMaximumSteps",
      "simulationMaximumArrivalsPerStep",
      "minimumRentalBatteryPercent",
    ];
    const { rows } = await this.db.query<{ key: string; value: unknown }>(
      "SELECT key,value FROM settings WHERE key=ANY($1::text[])",
      [keys],
    );
    const values = new Map(rows.map((r) => [r.key, r.value]));
    const [maximumSteps, maximumArrivalsPerStep, minimumBatteryPercent] =
      keys.map((k) => values.get(k));
    if (
      typeof maximumSteps !== "number" ||
      !Number.isSafeInteger(maximumSteps) ||
      maximumSteps <= 0 ||
      typeof maximumArrivalsPerStep !== "number" ||
      !Number.isSafeInteger(maximumArrivalsPerStep) ||
      maximumArrivalsPerStep <= 0 ||
      typeof minimumBatteryPercent !== "number" ||
      !Number.isInteger(minimumBatteryPercent) ||
      minimumBatteryPercent < 0 ||
      minimumBatteryPercent > 100 ||
      !Number.isSafeInteger(2 * maximumSteps * maximumArrivalsPerStep)
    )
      throw new InternalServerErrorException(
        "Cấu hình simulation chưa hợp lệ. Chạy npm run db:seed và kiểm tra settings.",
      );
    return { maximumSteps, maximumArrivalsPerStep, minimumBatteryPercent };
  }
  readSnapshot<T>(work: (c: PoolClient) => Promise<T>) {
    return this.db.readSnapshot(work);
  }
  async scenarioLimits(): Promise<ScenarioLimits> {
    const limits = await this.limits();
    const keys = [
      "simulationMaximumGeneratedRequests",
      "simulationHistoryPageSize",
      "simulationMaximumHorizonMinutes",
    ];
    const { rows } = await this.db.query<{ key: string; value: unknown }>(
      "SELECT key,value FROM settings WHERE key=ANY($1::text[])",
      [keys],
    );
    const map = new Map(rows.map((row) => [row.key, row.value]));
    const [maximumGeneratedRequests, historyPageSize, maximumHorizonMinutes] =
      keys.map((key) => map.get(key));
    if (
      typeof maximumGeneratedRequests !== "number" ||
      !Number.isSafeInteger(maximumGeneratedRequests) ||
      maximumGeneratedRequests <= 0 ||
      typeof historyPageSize !== "number" ||
      !Number.isInteger(historyPageSize) ||
      historyPageSize < 1 ||
      historyPageSize > 100 ||
      typeof maximumHorizonMinutes !== "number" ||
      !Number.isSafeInteger(maximumHorizonMinutes) ||
      maximumHorizonMinutes <= 0
    )
      throw new InternalServerErrorException(
        "Chưa tải được thiết lập mô phỏng. Vui lòng liên hệ người quản trị.",
      );
    return {
      ...limits,
      maximumGeneratedRequests,
      historyPageSize,
      maximumHorizonMinutes,
    };
  }
  private view(row: SimulationRow): SavedSimulation {
    return {
      id: row.id,
      createdAt: row.created_at.toISOString(),
      createdBy: row.created_by,
      result: row.result,
    };
  }
  async replay(actor: string, key: string) {
    const row = (
      await this.db.query<SimulationRow>(
        "SELECT * FROM simulation_runs WHERE created_by=$1 AND idempotency_key=$2",
        [actor, key],
      )
    ).rows[0];
    return row
      ? { saved: this.view(row), payload: row.payload as string }
      : null;
  }
  async save(
    actor: string,
    key: string,
    payload: string,
    snapshot: ScenarioSnapshot,
    result: ScenarioSimulationResult,
  ) {
    return this.db.transaction(async (c) => {
      await c.query(
        `INSERT INTO simulation_runs(created_by,idempotency_key,payload,snapshot,result)
        VALUES($1,$2,$3,$4,$5) ON CONFLICT(created_by,idempotency_key) DO NOTHING`,
        [actor, key, payload, JSON.stringify(snapshot), JSON.stringify(result)],
      );
      const row = (
        await c.query<SimulationRow>(
          "SELECT * FROM simulation_runs WHERE created_by=$1 AND idempotency_key=$2",
          [actor, key],
        )
      ).rows[0];
      return { saved: this.view(row), payload: row.payload as string };
    });
  }
  async history(size: number, before?: string): Promise<SimulationHistoryPage> {
    const { rows } = await this.db.query(
      `SELECT id,created_at,result->'hub'->>'name' AS hub_name,
      result->'parameters'->>'kind' AS kind,result->>'modelVersion' AS model_version
      FROM simulation_runs WHERE ($1::uuid IS NULL OR (created_at,id) <
        (SELECT created_at,id FROM simulation_runs WHERE id=$1))
      ORDER BY created_at DESC,id DESC LIMIT $2`,
      [before ?? null, size + 1],
    );
    return {
      items: rows.slice(0, size).map((row) => ({
        id: row.id,
        createdAt: row.created_at.toISOString(),
        hubName: row.hub_name,
        kind: row.kind,
        modelVersion: row.model_version,
      })),
      nextBefore: rows.length > size ? rows[size - 1].id : null,
    };
  }
  async detail(id: string) {
    const row = (
      await this.db.query<SimulationRow>(
        "SELECT * FROM simulation_runs WHERE id=$1",
        [id],
      )
    ).rows[0];
    return row ? this.view(row) : null;
  }
}
