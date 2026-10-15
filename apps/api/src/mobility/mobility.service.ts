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
import type { AllocationPort } from "../integration/allocation.port";
import { MobilityRepository } from "./mobility.repository";
import type {
  CreateChargingDto,
  ParkingWindowDto,
  RegisterVehicleDto,
  ReserveParkingDto,
} from "./mobility.dto";
@Injectable()
export class MobilityService implements AllocationPort {
  constructor(
    @Inject(MobilityRepository) private readonly repo: MobilityRepository,
  ) {}
  private async hub(c: PoolClient, id: string, requireActive = true) {
    const hub = await this.repo.activeHub(c, id);
    if (!hub) throw new NotFoundException("Không tìm thấy Hub.");
    if (requireActive && hub.status !== "active")
      throw new ConflictException("Hub đang ngừng hoạt động.");
  }
  private async window(c: PoolClient, input: ParkingWindowDto) {
    const start = Date.parse(input.startsAt),
      end = Date.parse(input.endsAt);
    const max = await this.repo.setting(c, "maximumParkingDurationMinutes");
    if (typeof max !== "number" || !Number.isInteger(max) || max <= 0)
      throw new InternalServerErrorException(
        "Chưa cấu hình thời lượng đỗ tối đa hợp lệ.",
      );
    if (
      !Number.isFinite(start) ||
      !Number.isFinite(end) ||
      start >= end ||
      start < Date.now() ||
      end - start > max * 60000
    )
      throw new BadRequestException(
        "Lịch phải ở tương lai, bắt đầu trước kết thúc và nằm trong thời lượng đỗ tối đa.",
      );
  }
  private async mutation<T>(
    user: User,
    operation: string,
    key: string | undefined,
    payload: unknown,
    work: (c: PoolClient) => Promise<T>,
  ): Promise<T> {
    if (!key || key.length > 128 || !key.trim())
      throw new BadRequestException("Cần Idempotency-Key từ 1 đến 128 ký tự.");
    try {
      return await this.repo.transaction(async (c) => {
        const response = await this.repo.idempotent(
          c,
          user.id,
          operation,
          key,
          JSON.stringify(payload),
          () => work(c),
        );
        if (response.conflict)
          throw new ConflictException(
            "Idempotency-Key đã được dùng với nội dung khác.",
          );
        return response.result as T;
      });
    } catch (error) {
      const code = (error as { code?: string })?.code;
      if (code === "23505" || code === "23P01")
        throw new ConflictException(
          "Xe, lịch hoặc yêu cầu đang bị trùng. Hãy làm mới dữ liệu.",
        );
      if (code === "40001" || code === "40P01")
        throw new ConflictException(
          "Tài nguyên vừa thay đổi. Vui lòng thử lại với cùng Idempotency-Key.",
        );
      throw error;
    }
  }
  vehicles(user: User) {
    return this.repo.vehicles(user.id);
  }
  register(user: User, body: RegisterVehicleDto, key?: string) {
    return this.mutation(
      user,
      "register",
      key,
      [body.code.trim(), body.type, body.batteryPercent],
      (c) => this.repo.register(c, user.id, body),
    );
  }
  bookings(user: User) {
    return this.repo.bookings(user.id);
  }
  availability(input: ParkingWindowDto) {
    return this.repo.transaction(async (c) => {
      await this.window(c, input);
      await this.hub(c, input.hubId);
      const spaces = await this.repo.available(
        c,
        input.hubId,
        input.startsAt,
        input.endsAt,
      );
      return { ...input, available: spaces.length };
    });
  }
  reserve(user: User, input: ReserveParkingDto, key?: string) {
    return this.mutation(
      user,
      "reserve",
      key,
      [input.hubId, input.privateVehicleId, input.startsAt, input.endsAt],
      async (c) => {
        await this.window(c, input);
        await this.hub(c, input.hubId);
        const vehicle = await this.repo.privateVehicle(
          c,
          input.privateVehicleId,
        );
        if (!vehicle) throw new NotFoundException("Không tìm thấy xe cá nhân.");
        if (vehicle.owner_id !== user.id)
          throw new ForbiddenException("Bạn không sở hữu xe này.");
        const spaces = await this.repo.available(
          c,
          input.hubId,
          input.startsAt,
          input.endsAt,
        );
        if (!spaces.length)
          throw new ConflictException(
            "Hub không còn chỗ phù hợp trong thời gian này.",
          );
        return this.repo.reserve(c, user.id, input, spaces[0].id);
      },
    );
  }
  transition(
    user: User,
    id: string,
    action: "cancel" | "check-in" | "check-out",
    key?: string,
  ) {
    return this.mutation(user, action, key, [id], async (c) => {
      const hub = await this.repo.bookingHub(c, id);
      if (!hub) throw new NotFoundException("Không tìm thấy lịch đỗ.");
      await this.hub(c, hub, action === "check-in");
      const b = await this.repo.booking(c, id);
      if (b.user_id !== user.id)
        throw new ForbiddenException("Bạn không sở hữu lịch đỗ này.");
      if (action === "cancel") {
        if (b.status === "cancelled")
          return this.repo.bookingStatus(c, id, "cancelled");
        if (b.status !== "reserved")
          throw new ConflictException("Chỉ hủy được lịch chưa check-in.");
        return this.repo.bookingStatus(c, id, "cancelled");
      }
      if (action === "check-in") {
        if (
          b.status !== "reserved" ||
          Date.now() < new Date(b.starts_at).getTime() ||
          Date.now() >= new Date(b.ends_at).getTime()
        )
          throw new ConflictException(
            "Lịch chưa đến giờ, đã hết hạn hoặc không thể check-in.",
          );
        await this.repo.privateVehicle(c, b.private_vehicle_id);
        if (
          !(await this.repo.occupyPrivate(
            c,
            b.parking_space_id,
            b.private_vehicle_id,
          ))
        )
          throw new ConflictException("Chỗ đỗ hiện chưa được giải phóng.");
        return this.repo.bookingStatus(c, id, "checked_in");
      }
      if (b.status !== "checked_in")
        throw new ConflictException("Xe chưa check-in.");
      await this.repo.privateVehicle(c, b.private_vehicle_id);
      if (!(await this.repo.departureRequests(c, b.private_vehicle_id)))
        throw new ConflictException(
          "Xe đang được phân bổ sạc; cần kết thúc phiên trước khi rời Hub.",
        );
      if (
        !(await this.repo.releasePrivate(
          c,
          b.parking_space_id,
          b.private_vehicle_id,
        ))
      )
        throw new ConflictException("Trạng thái chỗ đỗ không khớp.");
      return this.repo.bookingStatus(c, id, "completed");
    });
  }
  queue(user: User) {
    return this.repo.queue(user);
  }
  charge(user: User, input: CreateChargingDto, key?: string) {
    return this.mutation(
      user,
      "charge",
      key,
      [
        input.hubId,
        input.vehicle.kind,
        input.vehicle.id,
        input.targetBatteryPercent,
        input.requiredBy ?? null,
      ],
      async (c) => {
        await this.hub(c, input.hubId);
        let battery: unknown;
        if (input.vehicle.kind === "private") {
          const v = await this.repo.privateVehicle(c, input.vehicle.id);
          if (!v) throw new NotFoundException("Không tìm thấy xe.");
          if (v.owner_id !== user.id)
            throw new ForbiddenException("Bạn không sở hữu xe này.");
          if (!(await this.repo.privateLocation(c, v.id, input.hubId)))
            throw new ConflictException(
              "Xe cần check-in tại Hub trước khi yêu cầu sạc.",
            );
          battery = v.battery_percent;
        } else {
          if (user.role !== "operator")
            throw new ForbiddenException(
              "Chỉ người vận hành yêu cầu sạc xe thuê.",
            );
          const v = await this.repo.rentalVehicle(c, input.vehicle.id);
          if (!v) throw new NotFoundException("Không tìm thấy xe.");
          if (v.hub_id !== input.hubId || v.status !== "available")
            throw new ConflictException("Xe thuê không sẵn sàng tại Hub này.");
          battery = v.battery_percent;
        }
        if (typeof battery !== "number")
          throw new ConflictException("Xe chưa có dữ liệu pin hiện tại.");
        if (input.targetBatteryPercent <= battery)
          throw new BadRequestException(
            "Pin mục tiêu phải lớn hơn pin hiện tại.",
          );
        if (input.requiredBy && Date.parse(input.requiredBy) <= Date.now())
          throw new BadRequestException("Thời điểm cần xe phải ở tương lai.");
        return this.repo.charge(c, user.id, input);
      },
    );
  }
  async releaseRentalVehicleSpace(
    vehicleId: string,
    sourceHubId: string,
    client: PoolClient,
  ) {
    await this.hub(client, sourceHubId);
    if (!(await this.repo.releaseRental(client, vehicleId, sourceHubId)))
      throw new ConflictException("Xe không chiếm chỗ tại Hub nguồn.");
  }
  async claimRentalVehicleSpace(
    vehicleId: string,
    targetHubId: string,
    client: PoolClient,
  ) {
    await this.hub(client, targetHubId);
    const parkingSpaceId = await this.repo.claimRental(
      client,
      vehicleId,
      targetHubId,
    );
    if (!parkingSpaceId)
      throw new ConflictException(
        "Hub đích không còn chỗ chưa được cam kết. Hãy chọn Hub khác.",
      );
    return { parkingSpaceId };
  }
}
