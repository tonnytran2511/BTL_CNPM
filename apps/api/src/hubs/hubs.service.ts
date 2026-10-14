import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type {
  NetworkOverview,
  Role,
  SimulationSnapshot,
} from "@emobility/contracts";
import { HubsRepository } from "./hubs.repository";
@Injectable()
export class HubsService {
  constructor(
    @Inject(HubsRepository) private readonly repository: HubsRepository,
  ) {}
  async list(role: Role) {
    return (await this.repository.summaries()).filter(
      (h) => role === "operator" || h.status === "active",
    );
  }
  detail(id: string, role: Role) {
    return this.repository.snapshot(async (client) => {
      const hub = await this.repository.detail(id, client);
      if (!hub || (role === "student" && hub.status !== "active"))
        throw new NotFoundException("Không tìm thấy Hub.");
      return hub;
    });
  }
  async overview(): Promise<NetworkOverview> {
    const hubs = await this.repository.summaries();
    const totals = hubs.reduce(
      (total, hub) => ({
        hubs: total.hubs + 1,
        vehicles: total.vehicles + hub.vehicles.total,
        availableVehicles: total.availableVehicles + hub.vehicles.available,
        availableParking: total.availableParking + hub.parking.available,
        availableCharging: total.availableCharging + hub.charging.available,
        failedCharging: total.failedCharging + hub.charging.failed,
      }),
      {
        hubs: 0,
        vehicles: 0,
        availableVehicles: 0,
        availableParking: 0,
        availableCharging: 0,
        failedCharging: 0,
      },
    );
    return { hubs, totals, updatedAt: new Date().toISOString() };
  }
  snapshot(): Promise<SimulationSnapshot> {
    return this.repository.snapshot(async (client) => {
      const summaries = await this.repository.summaries(client);
      const hubs = [];
      for (const hub of summaries) {
        const detail = await this.repository.detail(hub.id, client);
        if (detail) hubs.push(detail);
      }
      return { capturedAt: new Date().toISOString(), hubs };
    });
  }
}
