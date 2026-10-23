import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import type { PoolClient } from "pg";
import type {
  CreateIncidentRequest,
  RedistributionRequest,
} from "@emobility/contracts";
import { RentalService } from "../rental/rental.service";
import {
  ALLOCATION_PORT,
  type AllocationPort,
} from "../integration/allocation.port";
import { OperationsRepository } from "./operations.repository";

@Injectable()
export class OperationsService {
  constructor(
    @Inject(OperationsRepository) private readonly repo: OperationsRepository,
    @Inject(RentalService) private readonly rental: RentalService,
    @Inject(ALLOCATION_PORT) private readonly allocation: AllocationPort,
  ) {}
  async createIncident(input: CreateIncidentRequest, actorId: string) {
    if (!input.description.trim())
      throw new BadRequestException("Mô tả sự cố không được để trống.");
    return this.repo.transaction(async (client) => {
      if (
        !(await this.repo.resourceExists(
          client,
          input.resourceType,
          input.resourceId,
        ))
      )
        throw new NotFoundException("Không tìm thấy tài nguyên.");
      return this.repo.createIncident(client, input, actorId);
    });
  }
  async resolveIncident(id: string, actorId: string) {
    return this.repo.transaction(async (client) => {
      const incident = await this.repo.resolveIncident(client, id, actorId);
      if (incident) return incident;
      if (!(await this.repo.incidentExists(client, id)))
        throw new NotFoundException("Không tìm thấy sự cố.");
      throw new ConflictException("Sự cố đã được xử lý.");
    });
  }
  private async hubs(client: PoolClient, source: string, target: string) {
    const hubs = await this.repo.lockHubs(client, [source, target]);
    if (hubs.length !== 2)
      throw new NotFoundException("Không tìm thấy Hub nguồn hoặc đích.");
    if (hubs.some((h) => h.status !== "active"))
      throw new ConflictException(
        "Chỉ điều chuyển giữa các Hub đang hoạt động.",
      );
  }
  private async eligible(client: PoolClient, ids: string[], source: string) {
    await this.rental.validateRedistributionVehicles(client, ids, source);
    if (await this.repo.openVehicleIncident(client, ids))
      throw new ConflictException("Xe trong lệnh có sự cố chưa được xử lý.");
  }
  async createRedistribution(input: RedistributionRequest, actorId: string) {
    if (input.sourceHubId === input.targetHubId)
      throw new UnprocessableEntityException(
        "Hub nguồn và đích phải khác nhau.",
      );
    if (
      !input.vehicleIds.length ||
      new Set(input.vehicleIds).size !== input.vehicleIds.length
    )
      throw new UnprocessableEntityException(
        "Danh sách xe không được trống hoặc trùng.",
      );
    return this.repo.transaction(async (client) => {
      await this.hubs(client, input.sourceHubId, input.targetHubId);
      await this.eligible(client, input.vehicleIds, input.sourceHubId);
      return this.repo.createOrder(client, input, actorId);
    });
  }
  async startRedistribution(id: string, actorId: string) {
    return this.repo.transaction(async (client) => {
      const order = await this.repo.order(client, id);
      if (!order)
        throw new NotFoundException("Không tìm thấy lệnh điều chuyển.");
      if (order.status !== "pending")
        throw new ConflictException("Chỉ lệnh đang chờ mới được bắt đầu.");
      await this.hubs(client, order.sourceHubId, order.targetHubId);
      await this.eligible(client, order.vehicleIds, order.sourceHubId);
      await this.rental.startRedistributionVehicles(
        client,
        order.vehicleIds,
        order.sourceHubId,
      );
      return this.repo.start(client, id, actorId);
    });
  }
  async cancelRedistribution(id: string, actorId: string) {
    return this.repo.transaction(async (client) => {
      const order = await this.repo.order(client, id);
      if (!order)
        throw new NotFoundException("Không tìm thấy lệnh điều chuyển.");
      if (order.status !== "pending")
        throw new ConflictException("Chỉ lệnh đang chờ mới được hủy.");
      return this.repo.cancel(client, id, actorId);
    });
  }

  async completeRedistribution(id: string, actorId: string) {
    return this.repo.transaction(async (client) => {
      const order = await this.repo.order(client, id);
      if (!order)
        throw new NotFoundException("Không tìm thấy lệnh điều chuyển.");
      if (order.status !== "in_progress")
        throw new ConflictException(
          "Chỉ lệnh đang điều chuyển mới hoàn tất được.",
        );
      await this.hubs(client, order.sourceHubId, order.targetHubId);
      await this.rental.validateRedistributingVehicles(
        client,
        order.vehicleIds,
        order.sourceHubId,
      );
      if (await this.repo.openVehicleIncident(client, order.vehicleIds))
        throw new ConflictException("Xe trong lệnh có sự cố chưa được xử lý.");
      for (const vehicleId of order.vehicleIds) {
        await this.allocation.releaseRentalVehicleSpace(
          vehicleId,
          order.sourceHubId,
          client,
        );
        await this.allocation.claimRentalVehicleSpace(
          vehicleId,
          order.targetHubId,
          client,
        );
      }
      await this.rental.completeRedistributionVehicles(
        client,
        order.vehicleIds,
        order.sourceHubId,
        order.targetHubId,
      );
      return this.repo.complete(client, id, actorId);
    });
  }
  incidents() {
    return this.repo.listIncidents();
  }
  redistributions() {
    return this.repo.listRedistributions();
  }
  operationLog() {
    return this.repo.listLogs();
  }
}
