import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from "@nestjs/common";
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";
import { Roles, type AuthRequest } from "../auth/auth.guard";
import { ChargingFailureService } from "./charging-failure.service";
class FailureDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  @Matches(/\S/)
  description!: string;
  @IsOptional() @IsUUID() sessionId?: string;
  @IsOptional() @IsInt() @Min(0) @Max(100) achievedBatteryPercent?: number;
}
@Roles("operator")
@Controller("mobility/charging/points")
export class ChargingFailureController {
  constructor(
    @Inject(ChargingFailureService)
    private readonly service: ChargingFailureService,
  ) {}
  private key(key: string | undefined) {
    if (!key?.trim() || key.length > 128)
      throw new BadRequestException("Cần Idempotency-Key từ 1 đến 128 ký tự.");
    return key;
  }
  @Get() overview() {
    return this.service.overview();
  }
  @Post(":id/fail") fail(
    @Req() req: AuthRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() input: FailureDto,
    @Headers("idempotency-key") key?: string,
  ) {
    return this.service.report(req.user.id, id, input, this.key(key));
  }
  @Post(":id/recover") recover(
    @Req() req: AuthRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Headers("idempotency-key") key?: string,
  ) {
    return this.service.recover(req.user.id, id, this.key(key));
  }
}
