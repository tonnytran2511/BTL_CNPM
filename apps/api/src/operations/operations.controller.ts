import {
  Body,
  Headers,
  Controller,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from "@nestjs/common";
import { Roles, type AuthRequest } from "../auth/auth.guard";
import { OperationsService } from "./operations.service";
import { IncidentDto, RedistributionDto } from "./operations.dto";

@Roles("operator")
@Controller()
export class OperationsController {
  constructor(
    @Inject(OperationsService) private readonly operations: OperationsService,
  ) {}

  @Post("incidents")
  createIncident(
    @Body() body: IncidentDto,
    @Req() req: AuthRequest,
    @Headers("idempotency-key") key?: string,
  ) {
    return this.operations.createIncident(body, req.user.id, key);
  }

  @Post("incidents/:id/resolve")
  resolveIncident(
    @Param("id", ParseUUIDPipe) id: string,
    @Req() req: AuthRequest,
    @Headers("idempotency-key") key?: string,
  ) {
    return this.operations.resolveIncident(id, req.user.id, key);
  }

  @Post("redistributions")
  createRedistribution(
    @Body() body: RedistributionDto,
    @Req() req: AuthRequest,
  ) {
    return this.operations.createRedistribution(body, req.user.id);
  }

  @Post("redistributions/:id/start")
  startRedistribution(@Param("id", ParseUUIDPipe) id: string) {
    return this.operations.startRedistribution(id);
  }

  @Post("redistributions/:id/cancel")
  cancelRedistribution(@Param("id", ParseUUIDPipe) id: string) {
    return this.operations.cancelRedistribution(id);
  }
}
