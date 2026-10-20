import { RentalChargingService } from "./rental-charging.service";
import { Module } from "@nestjs/common";
import { RentalController } from "./rental.controller";
import { RentalRepository } from "./rental.repository";
import { RentalService } from "./rental.service";
import { ReservationController } from "./reservation.controller";
import { ReservationService } from "./reservation.service";

@Module({
  controllers: [RentalController, ReservationController],
  providers: [
    RentalRepository,
    RentalService,
    ReservationService,
    RentalChargingService,
  ],
  exports: [RentalService, ReservationService, RentalChargingService],
})
export class RentalModule {}
