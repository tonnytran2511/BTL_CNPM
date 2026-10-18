import { Module } from "@nestjs/common";
import { HubsModule } from "../hubs/hubs.module";
import { SimulationController } from "./simulation.controller";
import { SimulationService } from "./simulation.service";
import { SimulationRepository } from "./simulation.repository";

@Module({
  imports: [HubsModule],
  controllers: [SimulationController],
  providers: [SimulationService, SimulationRepository],
})
export class SimulationModule {}
