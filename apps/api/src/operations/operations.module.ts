import { Module } from "@nestjs/common";
import { RentalModule } from "../rental/rental.module";
import { MobilityModule } from "../mobility/mobility.module";
import { OperationsController } from "./operations.controller";
import { OperationsService } from "./operations.service";
import { OperationsRepository } from "./operations.repository";
@Module({
  imports: [RentalModule, MobilityModule],
  controllers: [OperationsController],
  providers: [OperationsRepository, OperationsService],
})
export class OperationsModule {}
