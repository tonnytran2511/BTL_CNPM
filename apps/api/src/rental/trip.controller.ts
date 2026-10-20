import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from "@nestjs/common";
import type { AuthRequest } from "../auth/auth.guard";
import { ReturnTripDto } from "./trip.dto";
import { TripService } from "./trip.service";

const invalidId = new ParseUUIDPipe({
  exceptionFactory: () =>
    new BadRequestException("Mã chuyến thuê không hợp lệ."),
});

// Mọi route cần đăng nhập (AuthGuard toàn cục); chỉ chủ chuyến được trả xe.
@Controller("trips")
export class TripController {
  constructor(@Inject(TripService) private readonly trips: TripService) {}

  @Get() mine(@Req() req: AuthRequest) {
    return this.trips.list(req.user.id);
  }

  @Post(":id/return")
  @HttpCode(200)
  returnVehicle(
    @Req() req: AuthRequest,
    @Param("id", invalidId) id: string,
    @Body() body: ReturnTripDto,
  ) {
    return this.trips.returnVehicle(req.user.id, id, body.targetHubId);
  }
}
