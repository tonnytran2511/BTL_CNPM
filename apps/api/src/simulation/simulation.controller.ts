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
  Query,
  Req,
} from "@nestjs/common";
import { isUUID } from "class-validator";
import { Roles, type AuthRequest } from "../auth/auth.guard";
import { DemandSimulationDto, ScenarioSimulationDto } from "./simulation.dto";
import { SimulationService } from "./simulation.service";

@Roles("operator")
@Controller("simulations")
export class SimulationController {
  constructor(
    @Inject(SimulationService) private readonly simulation: SimulationService,
  ) {}
  @Get("config") config() {
    return this.simulation.limits();
  }
  @Post("demand-surge") run(@Body() body: DemandSimulationDto) {
    return this.simulation.run(body);
  }
  @Get("scenario-config") scenarioConfig() {
    return this.simulation.scenarioLimits();
  }
  @Post("runs") scenario(
    @Body() body: ScenarioSimulationDto,
    @Req() req: AuthRequest,
    @Headers("idempotency-key") key?: string,
  ) {
    return this.simulation.scenario(body, req.user.id, key);
  }
  @Get("runs") history(@Query("before") before?: string) {
    if (before !== undefined && !isUUID(before))
      throw new BadRequestException("Cursor lịch sử không hợp lệ.");
    return this.simulation.history(before);
  }
  @Get("runs/:id") detail(@Param("id", ParseUUIDPipe) id: string) {
    return this.simulation.detail(id);
  }
}
