import {
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Req,
} from "@nestjs/common";
import { HubsService } from "./hubs.service";
import { AuthRequest, Roles } from "../auth/auth.guard";
@Controller()
export class HubsController {
  constructor(@Inject(HubsService) private readonly hubs: HubsService) {}
  @Get("hubs") list(@Req() req: AuthRequest) {
    return this.hubs.list(req.user.role);
  }
  @Get("hubs/:id") detail(
    @Param("id", ParseUUIDPipe) id: string,
    @Req() req: AuthRequest,
  ) {
    return this.hubs.detail(id, req.user.role);
  }
  @Roles("operator") @Get("network/overview") overview() {
    return this.hubs.overview();
  }
  @Roles("operator") @Get("simulation/snapshot") snapshot() {
    return this.hubs.snapshot();
  }
}
