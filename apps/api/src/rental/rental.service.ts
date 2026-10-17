import { Inject, Injectable } from "@nestjs/common";
import type { VehicleSearchResult } from "@emobility/contracts";
import { RentalRepository } from "./rental.repository";
import type { VehicleSearchDto } from "./rental.dto";
import { effectiveMinimumBattery } from "./rental.rules";

@Injectable()
export class RentalService {
  constructor(
    @Inject(RentalRepository) private readonly repository: RentalRepository,
  ) {}

  /** Same result for students and operators: only rentable vehicles of active Hubs. */
  async search(query: VehicleSearchDto): Promise<VehicleSearchResult> {
    const minimumBatteryPercent =
      await this.repository.minimumRentalBatteryPercent();
    const vehicles = await this.repository.searchRentable({
      hubId: query.hubId,
      type: query.type,
      minBatteryPercent: effectiveMinimumBattery(
        minimumBatteryPercent,
        query.minBatteryPercent,
      ),
    });
    return { minimumBatteryPercent, vehicles };
  }
}
