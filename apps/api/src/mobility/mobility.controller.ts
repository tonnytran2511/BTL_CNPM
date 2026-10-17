import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import { AuthRequest } from "../auth/auth.guard";
import { MobilityService } from "./mobility.service";
import {
  CreateChargingDto,
  ParkingWindowDto,
  RegisterVehicleDto,
  ReserveParkingDto,
} from "./mobility.dto";
@Controller("mobility")
export class MobilityController {
  constructor(
    @Inject(MobilityService) private readonly service: MobilityService,
  ) {}
  @Get("private-vehicles") vehicles(@Req() r: AuthRequest) {
    return this.service.vehicles(r.user);
  }
  @Post("private-vehicles") register(
    @Req() r: AuthRequest,
    @Body() b: RegisterVehicleDto,
    @Headers("idempotency-key") key?: string,
  ) {
    return this.service.register(r.user, b, key);
  }
  @Get("parking/availability") availability(@Query() q: ParkingWindowDto) {
    return this.service.availability(q);
  }
  @Get("parking/bookings") bookings(@Req() r: AuthRequest) {
    return this.service.bookings(r.user);
  }
  @Post("parking/bookings") reserve(
    @Req() r: AuthRequest,
    @Body() b: ReserveParkingDto,
    @Headers("idempotency-key") key?: string,
  ) {
    return this.service.reserve(r.user, b, key);
  }
  @Post("parking/bookings/:id/cancel") cancel(
    @Req() r: AuthRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Headers("idempotency-key") key?: string,
  ) {
    return this.service.transition(r.user, id, "cancel", key);
  }
  @Post("parking/bookings/:id/check-in") checkIn(
    @Req() r: AuthRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Headers("idempotency-key") key?: string,
  ) {
    return this.service.transition(r.user, id, "check-in", key);
  }
  @Post("parking/bookings/:id/check-out") checkOut(
    @Req() r: AuthRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Headers("idempotency-key") key?: string,
  ) {
    return this.service.transition(r.user, id, "check-out", key);
  }
  @Get("charging/requests") queue(@Req() r: AuthRequest) {
    return this.service.queue(r.user);
  }
  @Post("charging/requests") charge(
    @Req() r: AuthRequest,
    @Body() b: CreateChargingDto,
    @Headers("idempotency-key") key?: string,
  ) {
    return this.service.charge(r.user, b, key);
  }
}
