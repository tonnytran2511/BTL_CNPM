import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from "@nestjs/common";
import type { AuthRequest } from "../auth/auth.guard";
import { IDEMPOTENCY_HEADER, parseIdempotencyKey } from "./idempotency";
import { CreateReservationDto } from "./reservation.dto";
import { ReservationService } from "./reservation.service";
import { TripService } from "./trip.service";

const invalidId = new ParseUUIDPipe({
  exceptionFactory: () =>
    new BadRequestException("Mã lượt đặt xe không hợp lệ."),
});

// Mọi route cần đăng nhập (AuthGuard toàn cục); người dùng lấy từ session, không nhận từ body.
@Controller("vehicle-reservations")
export class ReservationController {
  constructor(
    @Inject(ReservationService)
    private readonly reservations: ReservationService,
    @Inject(TripService) private readonly trips: TripService,
  ) {}

  @Get() mine(@Req() req: AuthRequest) {
    return this.reservations.list(req.user.id);
  }

  @Post() reserve(
    @Req() req: AuthRequest,
    @Body() body: CreateReservationDto,
    @Headers(IDEMPOTENCY_HEADER) key?: string,
  ) {
    return this.reservations.reserve(
      req.user.id,
      body.vehicleId,
      parseIdempotencyKey(key),
    );
  }

  @Post(":id/cancel")
  @HttpCode(200)
  cancel(
    @Req() req: AuthRequest,
    @Param("id", invalidId) id: string,
    @Headers(IDEMPOTENCY_HEADER) key?: string,
  ) {
    return this.reservations.cancel(req.user.id, id, parseIdempotencyKey(key));
  }

  // Nhận xe (BR-02): tạo chuyến thuê; gửi lặp trả lại đúng chuyến cũ.
  @Post(":id/pickup")
  @HttpCode(200)
  pickup(
    @Req() req: AuthRequest,
    @Param("id", invalidId) id: string,
    @Headers(IDEMPOTENCY_HEADER) key?: string,
  ) {
    return this.trips.pickup(req.user.id, id, parseIdempotencyKey(key));
  }
}
