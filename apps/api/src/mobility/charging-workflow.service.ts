import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";
import type { PoolClient } from "pg";
import type { User } from "@emobility/contracts";
import { MobilityRepository } from "./mobility.repository";
import { ChargingAllocationService } from "./charging-allocation.service";
import { ChargingWorkflowRepository } from "./charging-workflow.repository";
import { prioritizeCharging, type PriorityPolicy } from "./charging-priority";
@Injectable()
export class ChargingWorkflowService {
  constructor(
    @Inject(MobilityRepository) private readonly mobility: MobilityRepository,
    @Inject(ChargingWorkflowRepository)
    private readonly repo: ChargingWorkflowRepository,
    @Inject(ChargingAllocationService)
    private readonly allocation: ChargingAllocationService,
  ) {}
  private operator(user: User) {
    if (user.role !== "operator")
      throw new ForbiddenException(
        "Chỉ người vận hành được quản lý phiên sạc.",
      );
  }
  private async policy(c: PoolClient): Promise<PriorityPolicy> {
    const rows = await this.repo.policy(c);
    const values = new Map(rows.map((r) => [r.key, r.value as unknown]));
    const max = values.get("chargingMaximumWaitMinutes"),
      urgent = values.get("chargingUrgencyWindowMinutes"),
      low = values.get("lowBatteryThreshold");
    if (
      typeof max !== "number" ||
      !Number.isSafeInteger(max) ||
      max <= 0 ||
      typeof urgent !== "number" ||
      !Number.isSafeInteger(urgent) ||
      urgent < 0 ||
      typeof low !== "number" ||
      !Number.isInteger(low) ||
      low < 0 ||
      low > 100
    )
      throw new InternalServerErrorException(
        "Cấu hình ưu tiên sạc chưa hợp lệ.",
      );
    return {
      maximumWaitMinutes: max,
      urgencyWindowMinutes: urgent,
      lowBatteryPercent: low,
    };
  }
  async overview(user: User) {
    this.operator(user);
    return this.mobility.transaction(async (c) => ({
      queue: prioritizeCharging(
        await this.repo.queue(c),
        await this.policy(c),
        await this.repo.clock(c),
      ),
      sessions: await this.repo.sessions(c),
    }));
  }
  private async mutate<T>(
    user: User,
    operation: string,
    key: string | undefined,
    payload: unknown,
    work: (c: PoolClient) => Promise<T>,
  ): Promise<T> {
    this.operator(user);
    if (!key || key.length > 128 || !key.trim())
      throw new BadRequestException("Cần Idempotency-Key từ 1 đến 128 ký tự.");
    try {
      return await this.mobility.transaction(async (c) => {
        const result = await this.mobility.idempotent(
          c,
          user.id,
          "charging:" + operation,
          key,
          JSON.stringify(payload),
          () => work(c),
        );
        if (result.conflict)
          throw new ConflictException(
            "Idempotency-Key đã dùng với nội dung khác.",
          );
        return result.result as T;
      });
    } catch (e) {
      if (
        ["23505", "23P01", "40001", "40P01"].includes(
          (e as { code?: string }).code ?? "",
        )
      )
        throw new ConflictException(
          "Tài nguyên vừa thay đổi. Thử lại với cùng Idempotency-Key.",
        );
      throw e;
    }
  }
  schedule(user: User, hubId: string, key?: string) {
    return this.mutate(user, "schedule", key, [hubId], async (c) => {
      const hub = await this.mobility.activeHub(c, hubId);
      if (!hub) throw new NotFoundException("Không tìm thấy Hub.");
      if (hub.status !== "active")
        throw new ConflictException("Hub ngừng hoạt động.");
      const queue = prioritizeCharging(
        await this.repo.queue(c, hubId),
        await this.policy(c),
        await this.repo.clock(c),
      );
      const points = await this.repo.points(c, hubId);
      const sessions = [];
      for (let i = 0; i < Math.min(queue.length, points.length); i++)
        sessions.push(
          await this.allocation.allocatePrivateRequest(
            user,
            queue[i].id,
            points[i].id,
            c,
          ),
        );
      return { sessions };
    });
  }
  transition(
    user: User,
    id: string,
    action: "start" | "complete" | "cancel",
    battery: number | undefined,
    key?: string,
  ) {
    return this.mutate(user, action, key, [id, battery ?? null], async (c) => {
      const located = await this.repo.locate(c, id);
      if (!located) throw new NotFoundException("Không tìm thấy phiên sạc.");
      await this.mobility.activeHub(c, located.hub_id);
      const vehicle = await this.mobility.privateVehicle(
        c,
        located.private_vehicle_id,
      );
      const request = await this.repo.lockRequest(c, located.request_id);
      const point = await this.repo.lockPoint(c, located.charging_point_id);
      const session = await this.repo.lockSession(c, id);
      if (!session || !vehicle || !request || !point)
        throw new ConflictException("Tài nguyên đã thay đổi.");
      if (
        request.status !== "allocated" ||
        !["scheduled", "charging"].includes(session.status) ||
        point.status !== "occupied" ||
        point.hub_id !== request.hub_id
      )
        throw new ConflictException("Phiên sạc không ở trạng thái phù hợp.");
      if (action === "start") {
        const hub = await this.mobility.activeHub(c, located.hub_id);
        if (
          hub.status !== "active" ||
          session.status !== "scheduled" ||
          !(await this.mobility.privateLocation(
            c,
            located.private_vehicle_id,
            located.hub_id,
          ))
        )
          throw new ConflictException("Không thể bắt đầu phiên sạc.");
        await this.repo.change(c, id, "charging");
      } else {
        if (action === "complete" && session.status !== "charging")
          throw new ConflictException("Phiên chưa bắt đầu sạc.");
        if (session.status === "charging" || action === "complete") {
          if (
            battery === undefined ||
            !Number.isInteger(battery) ||
            battery > 100 ||
            battery < (vehicle.battery_percent ?? 0)
          )
            throw new BadRequestException(
              "Cần nhập pin thực tế từ pin hiện tại đến 100%.",
            );
          if (action === "complete" && battery < request.target_battery_percent)
            throw new BadRequestException("Pin thực tế chưa đạt mục tiêu.");
        } else if (battery !== undefined)
          throw new BadRequestException("Phiên chưa chạy không cập nhật pin.");
        await this.repo.change(
          c,
          id,
          action === "complete" ? "completed" : "cancelled",
        );
        await this.repo.finish(
          c,
          request.id,
          point.id,
          located.private_vehicle_id,
          action === "complete" ? "fulfilled" : "cancelled",
          battery,
        );
      }
      return this.repo.view(c, id);
    });
  }
}
