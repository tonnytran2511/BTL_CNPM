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
import { OperationsRepository } from "./operations.repository";

@Injectable()
export class OperationsService {
  constructor(
    @Inject(OperationsRepository) private readonly repo: OperationsRepository,
    @Inject(RentalService) private readonly rental: RentalService,
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
  async resolveIncident(id: string) {
    return this.repo.transaction(async (client) => {
      const incident = await this.repo.resolveIncident(client, id);
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
  async startRedistribution(id: string) {
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
      return this.repo.start(client, id);
    });
  }
  async cancelRedistribution(id: string) {
    return this.repo.transaction(async (client) => {
      const order = await this.repo.order(client, id);
      if (!order)
        throw new NotFoundException("Không tìm thấy lệnh điều chuyển.");
      if (order.status !== "pending")
        throw new ConflictException("Chỉ lệnh đang chờ mới được hủy.");
      return this.repo.cancel(client, id);
    });
  }
}
