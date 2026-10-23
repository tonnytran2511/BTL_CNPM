import { Module } from "@nestjs/common";
import { HubManagementController } from "./hub-management.controller";
import { HubManagementRepository } from "./hub-management.repository";
import { HubManagementService } from "./hub-management.service";
@Module({
  controllers: [HubManagementController],
  providers: [HubManagementRepository, HubManagementService],
})
export class HubManagementModule {}
