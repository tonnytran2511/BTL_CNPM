import { Module } from "@nestjs/common";
import { RentalRepository } from "./rental.repository";
import { RentalChargingService } from "./rental-charging.service";

/** Leaf module: shared fleet charging operations do not depend on parking/trip orchestration. */
@Module({
  providers: [RentalRepository, RentalChargingService],
  exports: [RentalChargingService],
})
export class RentalChargingModule {}
