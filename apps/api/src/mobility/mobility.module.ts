import { Module } from "@nestjs/common";
import { ALLOCATION_PORT } from "../integration/allocation.port";
import { MobilityController } from "./mobility.controller";
import { MobilityService } from "./mobility.service";
import { MobilityRepository } from "./mobility.repository";
import { ChargingAllocationRepository } from "./charging-allocation.repository";
import { ChargingAllocationService } from "./charging-allocation.service";
import { ChargingWorkflowRepository } from "./charging-workflow.repository";
import { ChargingWorkflowService } from "./charging-workflow.service";
import { ChargingWorkflowController } from "./charging-workflow.controller";
@Module({
  controllers: [MobilityController, ChargingWorkflowController],
  providers: [
    MobilityRepository,
    MobilityService,
    ChargingAllocationRepository,
    ChargingAllocationService,
    ChargingWorkflowRepository,
    ChargingWorkflowService,
    { provide: ALLOCATION_PORT, useExisting: MobilityService },
  ],
  exports: [ALLOCATION_PORT, MobilityService, ChargingAllocationService],
})
export class MobilityModule {}
