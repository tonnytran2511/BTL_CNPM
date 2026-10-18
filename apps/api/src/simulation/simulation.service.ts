import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import type { DemandSimulationRequest } from "@emobility/contracts";
import { HubsService } from "../hubs/hubs.service";
import { SimulationRepository } from "./simulation.repository";
import { simulateDemand, validateDemandParameters } from "./simulation.engine";

@Injectable()
export class SimulationService {
  constructor(
    @Inject(HubsService) private readonly hubs: HubsService,
    @Inject(SimulationRepository)
    private readonly repository: SimulationRepository,
  ) {}
  limits() {
    return this.repository.limits();
  }
  async run(parameters: DemandSimulationRequest) {
    const limits = await this.limits();
    try {
      validateDemandParameters(parameters, limits);
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
    const snapshot = await this.hubs.snapshot();
    try {
      return simulateDemand(snapshot, parameters, limits);
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
  }
}
