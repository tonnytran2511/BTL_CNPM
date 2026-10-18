import { Module } from "@nestjs/common";
import { ALLOCATION_PORT } from "../integration/allocation.port";
import { MobilityController } from "./mobility.controller";
import { MobilityService } from "./mobility.service";
import { MobilityRepository } from "./mobility.repository";
@Module({
  controllers: [MobilityController],
  providers: [
    MobilityRepository,
    MobilityService,
    { provide: ALLOCATION_PORT, useExisting: MobilityService },
  ],
  exports: [ALLOCATION_PORT, MobilityService],
})
export class MobilityModule {}
