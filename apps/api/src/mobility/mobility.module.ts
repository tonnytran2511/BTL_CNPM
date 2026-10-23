import { Module } from "@nestjs/common";
import { ALLOCATION_PORT } from "../integration/allocation.port";
import { MobilityController } from "./mobility.controller";
import { MobilityService } from "./mobility.service";
import { MobilityRepository } from "./mobility.repository";
import { ChargingAllocationRepository } from "./charging-allocation.repository";
import { ChargingAllocationService } from "./charging-allocation.service";
@Module({
  controllers: [MobilityController],
  providers: [
    MobilityRepository,
    MobilityService,
    ChargingAllocationRepository,
    ChargingAllocationService,
    { provide: ALLOCATION_PORT, useExisting: MobilityService },
  ],
  exports: [ALLOCATION_PORT, MobilityService, ChargingAllocationService],
})
export class MobilityModule {}
