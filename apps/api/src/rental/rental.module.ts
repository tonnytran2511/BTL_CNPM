import { Module } from "@nestjs/common";
import { MobilityModule } from "../mobility/mobility.module";
import { RentalController } from "./rental.controller";
import { RentalRepository } from "./rental.repository";
import { RentalService } from "./rental.service";
import { ReservationController } from "./reservation.controller";
import { ReservationService } from "./reservation.service";
import { TripController } from "./trip.controller";
import { TripService } from "./trip.service";

// MobilityModule cung cấp ALLOCATION_PORT (T11): giải phóng/chiếm chỗ đỗ cho xe thuê.
@Module({
  imports: [MobilityModule],
  controllers: [RentalController, ReservationController, TripController],
  providers: [RentalRepository, RentalService, ReservationService, TripService],
  exports: [RentalService, ReservationService, TripService],
})
export class RentalModule {}
