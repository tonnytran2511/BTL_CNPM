import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { PoolClient } from "pg";
import type {
  ChargingFailureInput,
  ChargingFailureResult,
} from "@emobility/contracts";
import { ChargingIncidentService } from "../operations/charging-incident.service";
import { RentalChargingService } from "../rental/rental-charging.service";
import { MobilityRepository } from "./mobility.repository";
import { ChargingWorkflowRepository } from "./charging-workflow.repository";
import { ChargingFailureRepository } from "./charging-failure.repository";
@Injectable()
export class ChargingFailureService {
  constructor(
    @Inject(MobilityRepository) private readonly mobility: MobilityRepository,
    @Inject(ChargingWorkflowRepository)
    private readonly workflow: ChargingWorkflowRepository,
    @Inject(ChargingFailureRepository)
    private readonly repo: ChargingFailureRepository,
    @Inject(RentalChargingService)
    private readonly rental: RentalChargingService,
    @Inject(ChargingIncidentService)
    private readonly incidents: ChargingIncidentService,
  ) {}
  overview() {
    return this.mobility.transaction((c) => this.repo.overview(c));
  }
  private async mutate<T>(
    actor: string,
    operation: string,
    key: string | undefined,
    payload: unknown,
    work: (c: PoolClient) => Promise<T>,
  ) {
    if (key !== undefined && (!key.trim() || key.length > 128))
      throw new BadRequestException("Idempotency-Key cần từ 1 đến 128 ký tự.");
    try {
      return await this.mobility.transaction(async (c) => {
        // Legacy incident callers may omit a key. Hub/point serialization still prevents duplicate effects.
        if (key === undefined) return work(c);
        const result = await this.mobility.idempotent(
          c,
          actor,
          "charging-failure:" + operation,
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
          "Tài nguyên vừa thay đổi, thử lại cùng Idempotency-Key.",
        );
      throw e;
    }
  }
  private async hub(c: PoolClient, point: string) {
    const located = await this.repo.point(c, point);
    if (!located) throw new NotFoundException("Không tìm thấy cổng sạc.");
    if (!(await this.mobility.activeHub(c, located.hub_id)))
      throw new NotFoundException("Không tìm thấy Hub.");
    return located.hub_id;
  }
  report(
    actor: string,
    point: string,
    input: ChargingFailureInput,
    key?: string,
  ): Promise<ChargingFailureResult> {
    if (!input.description?.trim())
      throw new BadRequestException("Cần mô tả sự cố.");
    return this.mutate(
      actor,
      "report",
      key,
      [
        point,
        input.description.trim(),
        input.sessionId ?? null,
        input.achievedBatteryPercent ?? null,
      ],
      async (c) => {
        const hub = await this.hub(c, point);
        const located = await this.repo.active(c, point);
        if (input.sessionId && located?.id !== input.sessionId)
          throw new ConflictException(
            "Phiên sạc đã thay đổi. Làm mới cổng trước khi báo hỏng.",
          );
        const vehicle = located?.vehicle_id
          ? await this.rental.allocated(c, located.vehicle_id, hub)
          : located?.private_vehicle_id
            ? await this.mobility.privateVehicle(c, located.private_vehicle_id)
            : null;
        const request = located
          ? await this.workflow.lockRequest(c, located.request_id)
          : null;
        const resource = await this.workflow.lockPoint(c, point);
        if (!resource) throw new NotFoundException("Cổng sạc vừa bị xóa.");
        const session = located
          ? await this.workflow.lockSession(c, located.id)
          : null;
        let requestStatus: "queued" | "fulfilled" | null = null;
        if (located) {
          if (
            !vehicle ||
            !request ||
            !session ||
            request.hub_id !== hub ||
            request.status !== "allocated" ||
            !["scheduled", "charging"].includes(session.status)
          )
            throw new ConflictException(
              "Phiên hoặc tài nguyên không còn phù hợp.",
            );
          let pin = vehicle.battery_percent;
          if (session.status === "charging") {
            if (input.sessionId !== session.id)
              throw new ConflictException(
                "Cần xác nhận đúng phiên đang chạy trước khi ghi pin.",
              );
            const actual = input.achievedBatteryPercent;
            if (
              actual === undefined ||
              !Number.isInteger(actual) ||
              actual < (pin ?? 0) ||
              actual > 100
            )
              throw new BadRequestException(
                "Nhập pin thực tế từ pin hiện tại đến 100%.",
              );
            pin = actual;
          } else if (input.achievedBatteryPercent !== undefined)
            throw new BadRequestException(
              "Phiên chưa chạy không cập nhật pin.",
            );
          if (typeof pin !== "number")
            throw new ConflictException("Xe chưa có dữ liệu pin.");
          if (located.vehicle_id)
            await this.rental.release(
              c,
              located.vehicle_id,
              hub,
              session.status === "charging" ? pin : undefined,
            );
          else if (session.status === "charging")
            await this.repo.pin(c, located.private_vehicle_id!, pin);
          requestStatus =
            pin >= request.target_battery_percent ? "fulfilled" : "queued";
          await this.repo.interrupt(c, session.id, request.id, requestStatus);
        } else if (input.achievedBatteryPercent !== undefined)
          throw new BadRequestException(
            "Cổng không có phiên đang chạy để ghi pin.",
          );
        await this.repo.fail(c, point);
        const incident = await this.incidents.record(
          c,
          point,
          input.description.trim(),
          actor,
        );
        return {
          pointId: point,
          status: "failed",
          incident,
          interruptedSessionId: session?.id ?? null,
          requestStatus,
        };
      },
    );
  }
  recover(actor: string, point: string, key?: string) {
    return this.mutate(actor, "recover", key, [point], async (c) => {
      await this.hub(c, point);
      const resource = await this.workflow.lockPoint(c, point);
      if (!resource) throw new NotFoundException("Không tìm thấy cổng.");
      if (resource.status !== "failed" || (await this.repo.active(c, point)))
        throw new ConflictException(
          "Cổng chưa hỏng hoặc vẫn còn phiên hoạt động.",
        );
      const incidents = await this.incidents.list(c, point);
      for (const incident of incidents)
        if (incident.status === "open")
          await this.incidents.resolve(c, incident.id);
      await this.repo.recover(c, point);
      return { pointId: point, status: "available" as const };
    });
  }
  resolveIncident(actor: string, id: string, key?: string) {
    return this.mutate(actor, "resolve-incident", key, [id], async (c) => {
      const incident = await this.incidents.find(c, id);
      if (!incident || incident.resourceType !== "charging_point")
        throw new NotFoundException("Không tìm thấy sự cố cổng sạc.");
      await this.hub(c, incident.resourceId);
      await this.workflow.lockPoint(c, incident.resourceId);
      if (await this.repo.active(c, incident.resourceId))
        throw new ConflictException(
          "Cổng còn phiên hoạt động, cần xử lý gián đoạn trước.",
        );
      const current = (await this.incidents.list(c, incident.resourceId)).find(
        (i) => i.id === id,
      );
      if (current?.status !== "open")
        throw new ConflictException("Sự cố đã được xử lý.");
      const resolved = await this.incidents.resolve(c, id);
      if (
        !(await this.incidents.list(c, incident.resourceId)).some(
          (i) => i.status === "open",
        )
      )
        await this.repo.recover(c, incident.resourceId);
      return resolved!;
    });
  }
}
