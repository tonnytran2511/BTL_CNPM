import { Module } from "@nestjs/common";
import { HubsController } from "./hubs.controller";
import { HubsRepository } from "./hubs.repository";
import { HubsService } from "./hubs.service";

@Module({
  controllers: [HubsController],
  providers: [HubsRepository, HubsService],
  exports: [HubsService],
})
export class HubsModule {}
