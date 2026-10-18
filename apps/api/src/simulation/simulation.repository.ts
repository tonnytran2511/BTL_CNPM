import {
  Inject,
  Injectable,
  InternalServerErrorException,
} from "@nestjs/common";
import type { SimulationLimits } from "@emobility/contracts";
import { Database } from "../database/database.module";

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
}
