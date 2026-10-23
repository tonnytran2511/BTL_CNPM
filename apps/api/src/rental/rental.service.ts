import { ConflictException, Inject, Injectable } from "@nestjs/common";
import type { PoolClient } from "pg";
import type { VehicleSearchResult } from "@emobility/contracts";
import { RentalRepository } from "./rental.repository";
import { ReservationService } from "./reservation.service";
import type { VehicleSearchDto } from "./rental.dto";
import { effectiveMinimumBattery } from "./rental.rules";

@Injectable()
export class RentalService {
  constructor(
    @Inject(RentalRepository) private readonly repository: RentalRepository,
    @Inject(ReservationService)
    private readonly reservations: ReservationService,
  ) {}

  /** Same result for students and operators: only rentable vehicles of active Hubs. */
  async search(query: VehicleSearchDto): Promise<VehicleSearchResult> {
    // Xe có reservation đã quá hạn phải xuất hiện lại ngay, không chờ chu kỳ scheduler.
    await this.reservations.expireDue();
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
  async validateRedistributionVehicles(
    client: PoolClient,
    ids: string[],
    sourceHubId: string,
  ) {
    if (
      !ids.length ||
      (await this.repository.lockRedistributionVehicles(
        client,
        ids,
        sourceHubId,
      )) !== ids.length
    )
      throw new ConflictException(
        "Xe trong lệnh không còn đủ điều kiện điều chuyển.",
      );
  }
  async startRedistributionVehicles(
    client: PoolClient,
    ids: string[],
    sourceHubId: string,
  ) {
    await this.validateRedistributionVehicles(client, ids, sourceHubId);
    if (
      (await this.repository.startRedistributionVehicles(
        client,
        ids,
        sourceHubId,
      )) !== ids.length
    )
      throw new ConflictException(
        "Xe trong lệnh không còn đủ điều kiện điều chuyển.",
      );
  }
}
