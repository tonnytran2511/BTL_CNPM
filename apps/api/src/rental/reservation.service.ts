import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { VehicleReservationView } from "@emobility/contracts";
import { RentalRepository } from "./rental.repository";
import { canTransitionReservation, isRentable } from "./rental.rules";

const NOT_AVAILABLE =
  "Xe này không còn sẵn sàng để đặt (đã được giữ, đang sử dụng hoặc không đủ pin).";

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: string }).code === "23505"
  );
}

@Injectable()
export class ReservationService {
  constructor(
    @Inject(RentalRepository) private readonly repository: RentalRepository,
  ) {}

  list(userId: string): Promise<VehicleReservationView[]> {
    return this.repository.listReservations(userId);
  }

  /**
   * BR-01: giữ xe ở Hub nguồn, hạn giữ lấy từ settings. Khóa hàng xe + cập nhật có điều kiện
   * + unique index một-reservation-active-mỗi-xe nên hai người đặt cùng xe chỉ một người thành công.
   */
  async reserve(
    userId: string,
    vehicleId: string,
  ): Promise<VehicleReservationView> {
    const minimumBatteryPercent =
      await this.repository.minimumRentalBatteryPercent();
    const holdMinutes = await this.repository.reservationHoldMinutes();
    return this.repository.inTransaction(async (tx) => {
      const vehicle = await tx.lockVehicle(vehicleId);
      if (!vehicle) throw new NotFoundException("Không tìm thấy xe.");
      if (
        !vehicle.hubId ||
        !vehicle.hubStatus ||
        !isRentable(vehicle, vehicle.hubStatus, minimumBatteryPercent)
      )
        throw new ConflictException(NOT_AVAILABLE);
      if (!(await tx.moveVehicle(vehicle.id, "reserve")))
        throw new ConflictException(NOT_AVAILABLE);
      let id: string;
      try {
        id = await tx.insertReservation({
          userId,
          vehicleId: vehicle.id,
          hubId: vehicle.hubId,
          holdMinutes,
        });
      } catch (error) {
        if (isUniqueViolation(error)) throw new ConflictException(NOT_AVAILABLE);
        throw error;
      }
      return tx.view(id);
    });
  }

  /** Chỉ chủ lượt đặt được hủy, và chỉ khi còn active; hủy xong xe được giải phóng. */
  async cancel(
    userId: string,
    reservationId: string,
  ): Promise<VehicleReservationView> {
    return this.repository.inTransaction(async (tx) => {
      const reservation = await tx.lockReservation(reservationId);
      if (!reservation)
        throw new NotFoundException("Không tìm thấy lượt đặt xe.");
      if (reservation.userId !== userId)
        throw new ForbiddenException("Bạn không có quyền hủy lượt đặt xe này.");
      if (
        !canTransitionReservation(reservation.status, "cancelled") ||
        !(await tx.closeReservation(reservation.id, "cancelled"))
      )
        throw new ConflictException(
          "Lượt đặt xe này không còn ở trạng thái có thể hủy.",
        );
      // Cập nhật có điều kiện: nếu xe đã bị đổi trạng thái (ví dụ sự cố, BR-10) thì không ghi đè.
      await tx.moveVehicle(reservation.vehicleId, "cancel");
      return tx.view(reservation.id);
    });
  }
}
