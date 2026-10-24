import {
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
import { IsInt, IsOptional, IsUUID, Max, Min } from "class-validator";
import { AuthRequest, Roles } from "../auth/auth.guard";
import { ChargingWorkflowService } from "./charging-workflow.service";
class ScheduleDto {
  @IsUUID() hubId!: string;
}
class BatteryDto {
  @IsOptional() @IsInt() @Min(0) @Max(100) achievedBatteryPercent?: number;
}
@Roles("operator")
@Controller("mobility/charging")
export class ChargingWorkflowController {
  constructor(
    @Inject(ChargingWorkflowService)
    private readonly service: ChargingWorkflowService,
  ) {}
  @Get("overview") overview(@Req() r: AuthRequest) {
    return this.service.overview(r.user);
  }
  @Post("schedule") schedule(
    @Req() r: AuthRequest,
    @Body() b: ScheduleDto,
    @Headers("idempotency-key") key?: string,
  ) {
    return this.service.schedule(r.user, b.hubId, key);
  }
  @Post("sessions/:id/start") start(
    @Req() r: AuthRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() _b: BatteryDto,
    @Headers("idempotency-key") key?: string,
  ) {
    return this.service.transition(r.user, id, "start", undefined, key);
  }
  @Post("sessions/:id/complete") complete(
    @Req() r: AuthRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() b: BatteryDto,
    @Headers("idempotency-key") key?: string,
  ) {
    return this.service.transition(
      r.user,
      id,
      "complete",
      b.achievedBatteryPercent,
      key,
    );
  }
  @Post("sessions/:id/cancel") cancel(
    @Req() r: AuthRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() b: BatteryDto,
    @Headers("idempotency-key") key?: string,
  ) {
    return this.service.transition(
      r.user,
      id,
      "cancel",
      b.achievedBatteryPercent,
      key,
    );
  }
  @Post("requests/:id/cancel") cancelQueued(
    @Req() r: AuthRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Headers("idempotency-key") key?: string,
  ) {
    return this.service.cancelRentalQueued(r.user, id, key);
  }
}
