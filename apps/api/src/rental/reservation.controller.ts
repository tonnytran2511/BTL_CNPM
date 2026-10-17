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
import { CreateReservationDto } from "./reservation.dto";
import { ReservationService } from "./reservation.service";

const invalidId = new ParseUUIDPipe({
  exceptionFactory: () =>
    new BadRequestException("Mã lượt đặt xe không hợp lệ."),
});

// Mọi route cần đăng nhập (AuthGuard toàn cục); người dùng lấy từ session, không nhận từ body.
@Controller("vehicle-reservations")
export class ReservationController {
  constructor(
    @Inject(ReservationService) private readonly reservations: ReservationService,
  ) {}

  @Get() mine(@Req() req: AuthRequest) {
    return this.reservations.list(req.user.id);
  }

  @Post() reserve(@Req() req: AuthRequest, @Body() body: CreateReservationDto) {
    return this.reservations.reserve(req.user.id, body.vehicleId);
  }

  @Post(":id/cancel")
  @HttpCode(200)
  cancel(@Req() req: AuthRequest, @Param("id", invalidId) id: string) {
    return this.reservations.cancel(req.user.id, id);
  }
}
