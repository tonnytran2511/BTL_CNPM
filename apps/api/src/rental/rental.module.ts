import { Module } from "@nestjs/common";
import { RentalController } from "./rental.controller";
import { RentalRepository } from "./rental.repository";
import { RentalService } from "./rental.service";
import { ReservationController } from "./reservation.controller";
import { ReservationService } from "./reservation.service";

@Module({
  controllers: [RentalController, ReservationController],
  providers: [RentalRepository, RentalService, ReservationService],
  exports: [RentalService, ReservationService],
})
export class RentalModule {}
