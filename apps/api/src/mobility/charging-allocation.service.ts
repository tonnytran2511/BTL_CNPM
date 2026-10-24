import { RentalChargingService } from "../rental/rental-charging.service";
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
    @Inject(RentalChargingService)
    private readonly rental: RentalChargingService,
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
    if (
      point.status === "failed" ||
      (await this.repo.pointHasOpenIncident(client, pointId))
    )
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
  /** Hub -> fleet vehicle -> request -> point; fleet writes go through its owning service. */
  async allocateRentalRequest(
    actor: User,
    requestId: string,
    pointId: string,
    c: PoolClient,
  ): Promise<ChargingAllocation> {
    if (actor.role !== "operator")
      throw new ForbiddenException("Chỉ người vận hành được phân bổ cổng sạc.");
    const located = await this.repo.locateRequest(c, requestId);
    if (!located?.vehicle_id)
      throw new NotFoundException("Không tìm thấy yêu cầu xe thuê.");
    const hub = await this.repo.lockHub(c, located.hub_id);
    if (!hub || hub.status !== "active")
      throw new ConflictException("Hub ngừng hoạt động.");
    const vehicle = await this.rental.lock(c, located.vehicle_id);
    const request = await this.repo.lockRequest(c, requestId);
    const point = await this.repo.lockPoint(c, pointId);
    if (
      !request ||
      request.vehicle_id !== located.vehicle_id ||
      request.hub_id !== located.hub_id
    )
      throw new ConflictException("Yêu cầu đã thay đổi.");
    if (
      !point ||
      point.hub_id !== request.hub_id ||
      point.status === "failed" ||
      (await this.repo.pointHasOpenIncident(c, pointId))
    )
      throw new ConflictException("Cổng không phù hợp.");
    const existing = await this.repo.activeSession(c, requestId);
    if (
      request.status === "allocated" &&
      existing?.chargingPointId === pointId &&
      point.status === "occupied"
    ) {
      await this.rental.allocated(c, located.vehicle_id, located.hub_id);
      return existing;
    }
    if (
      request.status !== "queued" ||
      existing ||
      vehicle.battery_percent >= request.target_battery_percent
    )
      throw new ConflictException("Yêu cầu không còn đủ điều kiện.");
    await this.rental.claim(c, located.vehicle_id, located.hub_id);
    if (
      !(await this.repo.claimPoint(c, pointId)) ||
      !(await this.repo.allocateRequest(c, requestId))
    )
      throw new ConflictException("Tài nguyên vừa thay đổi.");
    return this.repo.createSession(c, requestId, pointId);
  }
}
