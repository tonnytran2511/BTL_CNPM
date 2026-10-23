import {
  Body,
  Controller,
  Delete,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
} from "@nestjs/common";
import { Roles } from "../auth/auth.guard";
import {
  CreateChargingPointDto,
  CreateHubDto,
  ParkingCapacityDto,
  UpdateHubDto,
} from "./hub-management.dto";
import { HubManagementService } from "./hub-management.service";
@Roles("operator")
@Controller("hubs")
export class HubManagementController {
  constructor(
    @Inject(HubManagementService)
    private readonly service: HubManagementService,
  ) {}
  @Post() create(@Body() body: CreateHubDto) {
    return this.service.create(body);
  }
  @Patch(":id") update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: UpdateHubDto,
  ) {
    return this.service.update(id, body);
  }
  @Delete(":id") delete(@Param("id", ParseUUIDPipe) id: string) {
    return this.service.delete(id);
  }
  @Put(":id/parking-capacity") capacity(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: ParkingCapacityDto,
  ) {
    return this.service.setCapacity(id, body.capacity);
  }
  @Post(":id/charging-points") addPoint(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: CreateChargingPointDto,
  ) {
    return this.service.addChargingPoint(id, body.code);
  }
  @Delete(":id/charging-points/:pointId") removePoint(
    @Param("id", ParseUUIDPipe) id: string,
    @Param("pointId", ParseUUIDPipe) pointId: string,
  ) {
    return this.service.removeChargingPoint(id, pointId);
  }
}
