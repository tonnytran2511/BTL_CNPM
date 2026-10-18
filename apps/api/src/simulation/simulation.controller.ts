import { Body, Controller, Get, Inject, Post } from "@nestjs/common";
import { Roles } from "../auth/auth.guard";
import { DemandSimulationDto } from "./simulation.dto";
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
}
