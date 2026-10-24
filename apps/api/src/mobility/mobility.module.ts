import { ChargingIncidentModule } from "../operations/charging-incident.module";
import { ChargingFailureController } from "./charging-failure.controller";
import { ChargingFailureRepository } from "./charging-failure.repository";
import { ChargingFailureService } from "./charging-failure.service";
import { RentalChargingModule } from "../rental/rental-charging.module";
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
  imports: [RentalChargingModule, ChargingIncidentModule],
  controllers: [
    MobilityController,
    ChargingWorkflowController,
    ChargingFailureController,
  ],
  providers: [
    ChargingFailureRepository,
    ChargingFailureService,
    MobilityRepository,
    MobilityService,
    ChargingAllocationRepository,
    ChargingAllocationService,
    ChargingWorkflowRepository,
    ChargingWorkflowService,
    { provide: ALLOCATION_PORT, useExisting: MobilityService },
  ],
  exports: [
    ALLOCATION_PORT,
    MobilityService,
    ChargingAllocationService,
    ChargingFailureService,
  ],
})
export class MobilityModule {}
