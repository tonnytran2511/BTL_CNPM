import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { DemandSimulationRequest } from "@emobility/contracts";
import { HubsService } from "../hubs/hubs.service";
import { SimulationRepository } from "./simulation.repository";
import { simulateDemand, validateDemandParameters } from "./simulation.engine";
import type {
  ScenarioSimulationRequest,
  ScenarioSnapshot,
} from "@emobility/contracts";
import { MobilitySnapshotService } from "../mobility/mobility-snapshot.service";
import {
  simulateScenario,
  validateScenarioParameters,
} from "./scenario.engine";

@Injectable()
export class SimulationService {
  constructor(
    @Inject(MobilitySnapshotService)
    private readonly mobility: MobilitySnapshotService,
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
  scenarioLimits() {
    return this.repository.scenarioLimits();
  }
  async scenario(
    parameters: ScenarioSimulationRequest,
    actor: string,
    key?: string,
  ) {
    if (!key || key.length > 128 || !key.trim())
      throw new BadRequestException("Cần Idempotency-Key từ 1 đến 128 ký tự.");
    // Canonical property order avoids object-key order changing retry semantics.
    const payload = JSON.stringify([
      parameters.kind,
      parameters.hubId,
      parameters.horizonMinutes,
      parameters.stepMinutes,
      parameters.seed,
      parameters.baselineArrivalsPerStep,
      parameters.scenarioArrivalsPerStep,
      parameters.additionalOccupiedSpaces,
      [...parameters.failedChargingPointIds].sort(),
      parameters.chargingServiceMinutes,
    ]);
    const replay = await this.repository.replay(actor, key);
    if (replay) {
      if (replay.payload !== payload)
        throw new ConflictException(
          "Idempotency-Key đã dùng với tham số khác.",
        );
      return replay.saved;
    }
    const limits = await this.scenarioLimits();
    try {
      validateScenarioParameters(parameters, limits);
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
    const snapshot: ScenarioSnapshot = await this.repository.readSnapshot(
      async (client) => {
        const hubs = await this.hubs.snapshot(client);
        return {
          ...hubs,
          resources: await this.mobility.project(
            client,
            hubs.hubs.map((h) => h.id),
            parameters.horizonMinutes,
            hubs.capturedAt,
            limits.minimumBatteryPercent,
          ),
        };
      },
    );
    let result;
    try {
      result = simulateScenario(snapshot, parameters, limits);
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
    const saved = await this.repository.save(
      actor,
      key,
      payload,
      snapshot,
      result,
    );
    if (saved.payload !== payload)
      throw new ConflictException("Idempotency-Key đã dùng với tham số khác.");
    return saved.saved;
  }
  async history(before?: string) {
    return this.repository.history(
      (await this.scenarioLimits()).historyPageSize,
      before,
    );
  }
  async detail(id: string) {
    const saved = await this.repository.detail(id);
    if (!saved) throw new NotFoundException("Không tìm thấy lần mô phỏng.");
    return saved;
  }
}
