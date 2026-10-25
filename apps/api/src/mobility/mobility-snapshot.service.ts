import { Inject, Injectable } from "@nestjs/common";
import type { PoolClient } from "pg";
import type { SimulationResourceProjection } from "@emobility/contracts";
import { ChargingWorkflowService } from "./charging-workflow.service";
import { MobilitySnapshotRepository } from "./mobility-snapshot.repository";
import { RentalChargingService } from "../rental/rental-charging.service";

@Injectable()
export class MobilitySnapshotService {
  constructor(
    @Inject(RentalChargingService)
    private readonly rental: RentalChargingService,
    @Inject(MobilitySnapshotRepository)
    private readonly repo: MobilitySnapshotRepository,
    @Inject(ChargingWorkflowService)
    private readonly charging: ChargingWorkflowService,
  ) {}
  async project(
    c: PoolClient,
    hubIds: string[],
    horizonMinutes: number,
    capturedAt: string,
    minimumBatteryPercent: number,
  ): Promise<SimulationResourceProjection[]> {
    const projections = [];
    const fleet = await this.rental.simulationVehicles(
      c,
      minimumBatteryPercent,
    );
    for (const hubId of hubIds) {
      const queue = await this.charging.simulationQueue(
        c,
        hubId,
        Date.parse(capturedAt),
      );
      projections.push({
        hubId,
        eligibleVehicleIds: fleet
          .filter((vehicle) => vehicle.hubId === hubId)
          .map((vehicle) => vehicle.id),
        parkingSpaceIds: await this.repo.parking(c, hubId, horizonMinutes),
        chargingPoints: await this.repo.points(c, hubId),
        chargingQueueWaitMinutes: queue.map((q) =>
          Math.max(
            0,
            (Date.parse(capturedAt) - Date.parse(String(q.createdAt))) / 60000,
          ),
        ),
      });
    }
    return projections;
  }
}
