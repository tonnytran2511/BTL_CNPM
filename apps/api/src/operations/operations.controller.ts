import {
  Body,
  Controller,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from "@nestjs/common";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from "class-validator";
import type {
  CreateIncidentRequest,
  IncidentResourceType,
  RedistributionRequest,
} from "@emobility/contracts";
import { Roles, type AuthRequest } from "../auth/auth.guard";
import { OperationsService } from "./operations.service";

class IncidentDto implements CreateIncidentRequest {
  @IsIn(["vehicle", "charging_point", "hub"])
  resourceType!: IncidentResourceType;
  @IsUUID() resourceId!: string;
  @IsString() @MinLength(1) @MaxLength(2000) description!: string;
}
class RedistributionDto implements RedistributionRequest {
  @IsUUID() sourceHubId!: string;
  @IsUUID() targetHubId!: string;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @IsUUID("all", { each: true })
  vehicleIds!: string[];
}

@Roles("operator")
@Controller()
export class OperationsController {
  constructor(
    @Inject(OperationsService) private readonly operations: OperationsService,
  ) {}

  @Post("incidents")
  createIncident(@Body() body: IncidentDto, @Req() req: AuthRequest) {
    return this.operations.createIncident(body, req.user.id);
  }

  @Post("incidents/:id/resolve")
  resolveIncident(@Param("id", ParseUUIDPipe) id: string) {
    return this.operations.resolveIncident(id);
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
