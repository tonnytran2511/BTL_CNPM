import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { PoolClient } from "pg";
import type { User } from "@emobility/contracts";
import type { ChargingAllocation } from "./charging-allocation.model";
import { ChargingAllocationRepository } from "./charging-allocation.repository";

@Injectable()
export class ChargingAllocationService {
  constructor(
    @Inject(ChargingAllocationRepository)
    private readonly repo: ChargingAllocationRepository,
  ) {}

  /** Internal T18 primitive. The caller supplies a transaction and must rollback on any failure. */
  async allocatePrivateRequest(
    actor: User,
    requestId: string,
    pointId: string,
    client: PoolClient,
  ): Promise<ChargingAllocation> {
    if (actor.role !== "operator")
      throw new ForbiddenException("Chỉ người vận hành được phân bổ cổng sạc.");
    const located = await this.repo.locateRequest(client, requestId);
    if (!located) throw new NotFoundException("Không tìm thấy yêu cầu sạc.");
    if (!located.private_vehicle_id)
      throw new ConflictException(
        "Phân bổ xe thuê cần tích hợp service xe của module rental.",
      );

    // Same order as parking mutations: Hub -> private vehicle -> request -> point.
    const hub = await this.repo.lockHub(client, located.hub_id);
    if (!hub || hub.status !== "active")
      throw new ConflictException("Hub đang ngừng hoạt động.");
    const vehicle = await this.repo.lockPrivateVehicle(
      client,
      located.private_vehicle_id,
    );
    const request = await this.repo.lockRequest(client, requestId);
    if (!request) throw new NotFoundException("Không tìm thấy yêu cầu sạc.");
    if (
      request.hub_id !== located.hub_id ||
      request.private_vehicle_id !== located.private_vehicle_id
    )
      throw new ConflictException(
        "Thông tin yêu cầu đã thay đổi; hãy thử lại.",
      );
    const point = await this.repo.lockPoint(client, pointId);
    if (!point) throw new NotFoundException("Không tìm thấy cổng sạc.");
    if (point.hub_id !== request.hub_id)
      throw new ConflictException("Cổng và yêu cầu phải thuộc cùng Hub.");
    if (point.status === "failed")
      throw new ConflictException("Cổng sạc đang hỏng.");
    if (!vehicle || vehicle.owner_id !== request.user_id)
      throw new ConflictException("Xe không còn thuộc người gửi yêu cầu.");
    if (
      !(await this.repo.parkedAt(
        client,
        located.private_vehicle_id,
        request.hub_id,
      ))
    )
      throw new ConflictException("Xe không còn đỗ tại Hub yêu cầu.");

    const existing = await this.repo.activeSession(client, requestId);
    if (
      request.status === "allocated" &&
      existing?.chargingPointId === pointId &&
      point.status === "occupied"
    )
      return existing;
    if (request.status !== "queued" || existing)
      throw new ConflictException("Yêu cầu đã được phân bổ hoặc đã kết thúc.");
    if (
      vehicle.battery_percent === null ||
      request.target_battery_percent <= vehicle.battery_percent
    )
      throw new ConflictException(
        "Pin hiện tại không còn phù hợp với yêu cầu sạc.",
      );
    if (!(await this.repo.claimPoint(client, pointId)))
      throw new ConflictException("Cổng sạc đã được giữ cho yêu cầu khác.");
    if (!(await this.repo.allocateRequest(client, requestId)))
      throw new ConflictException("Yêu cầu không còn trong hàng chờ.");
    return this.repo.createSession(client, requestId, pointId);
  }
}
