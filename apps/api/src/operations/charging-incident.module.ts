import { Module } from "@nestjs/common";
import { OperationsRepository } from "./operations.repository";
import { ChargingIncidentService } from "./charging-incident.service";
@Module({
  providers: [OperationsRepository, ChargingIncidentService],
  exports: [ChargingIncidentService],
})
export class ChargingIncidentModule {}
