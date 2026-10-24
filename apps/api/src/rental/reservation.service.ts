import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import type { VehicleReservationView } from "@emobility/contracts";
import {
  RentalRepository,
  type LockedReservation,
  type RentalTx,
} from "./rental.repository";
import { withIdempotency } from "./idempotency";
import { canTransitionReservation, isRentable } from "./rental.rules";

const NOT_AVAILABLE =
  "Xe này không còn sẵn sàng để đặt (đã được giữ, đang sử dụng hoặc không đủ pin).";

/** Số reservation hết hạn xử lý tối đa trong một lần quét (kích thước lô, không phải ngưỡng nghiệp vụ). */
const EXPIRY_BATCH_SIZE = 100;

const EXPIRED_MESSAGE =
  "Lượt đặt xe này đã hết hạn giữ xe nên không thể hủy. Xe đã được nhả; hãy đặt lại nếu vẫn cần.";

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

  private readonly logger = new Logger(ReservationService.name);

  async list(userId: string): Promise<VehicleReservationView[]> {
    await this.expireDue();
    return this.repository.listReservations(userId);
  }

  /**
   * Hết hạn giữ xe (BR-01): active -> expired và xe reserved -> available trong MỘT transaction.
   * Khóa theo thứ tự reservation -> xe, cùng thứ tự với hủy và nhận xe để không deadlock.
   * Xe đã bị đổi trạng thái bởi luồng khác (sự cố, điều chuyển) thì không bị ghi đè (BR-10).
   * Trả true nếu reservation vừa được chuyển sang expired.
   */
  private async expireLocked(
    tx: RentalTx,
    reservation: LockedReservation,
  ): Promise<boolean> {
    if (
      reservation.status !== "active" ||
      !reservation.expired ||
      !canTransitionReservation(reservation.status, "expired")
    )
      return false;
    await tx.lockVehicle(reservation.vehicleId);
    if (!(await tx.closeReservation(reservation.id, "expired"))) return false;
    await tx.moveVehicle(reservation.vehicleId, "expire");
    return true;
  }

  expireOne(reservationId: string): Promise<boolean> {
    return this.repository.inTransaction(async (tx) => {
      const reservation = await tx.lockReservation(reservationId);
      return reservation ? this.expireLocked(tx, reservation) : false;
    });
  }

  /**
   * Quét các reservation đã quá hạn. Mỗi reservation một transaction riêng: một cái lỗi
   * không làm hỏng cả lô, và chạy lặp hay chạy song song với scheduler đều an toàn
   * (cái đã được xử lý sẽ bị bỏ qua sau khi khóa lại và kiểm tra trạng thái).
   * Trả về số reservation đã được chuyển sang expired.
   */
  async expireDue(): Promise<number> {
    let expired = 0;
    try {
      for (const id of await this.repository.dueReservationIds(
        EXPIRY_BATCH_SIZE,
      )) {
        try {
          if (await this.expireOne(id)) expired += 1;
        } catch (error) {
          this.logger.error(
            `Không xử lý được hết hạn cho lượt đặt ${id}: ${error instanceof Error ? error.message : "lỗi không rõ"}`,
          );
        }
      }
    } catch (error) {
      // Quét hỏng không được làm hỏng request của người dùng; scheduler sẽ thử lại ở chu kỳ sau.
      this.logger.error(
        `Quét đặt xe hết hạn thất bại: ${error instanceof Error ? error.message : "lỗi không rõ"}`,
      );
    }
    return expired;
  }

  /**
   * BR-01: giữ xe ở Hub nguồn, hạn giữ lấy từ settings. Khóa hàng xe + cập nhật có điều kiện
   * + unique index một-reservation-active-mỗi-xe nên hai người đặt cùng xe chỉ một người thành công.
   */
  async reserve(
    userId: string,
    vehicleId: string,
    key?: string,
  ): Promise<VehicleReservationView> {
    // Nhả trước các xe đã quá hạn giữ để người đặt sau không bị 409 vì một reservation đã chết.
    await this.expireDue();
    const minimumBatteryPercent =
      await this.repository.minimumRentalBatteryPercent();
    const holdMinutes = await this.repository.reservationHoldMinutes();
    return this.repository.inTransaction((tx) =>
      withIdempotency(tx, userId, "reserve", key, { vehicleId }, async () => {
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
          if (isUniqueViolation(error))
            throw new ConflictException(NOT_AVAILABLE);
          throw error;
        }
        return tx.view(id);
      }),
    );
  }

  /**
   * Chỉ chủ lượt đặt được hủy, và chỉ khi còn active và chưa quá hạn; hủy xong xe được giải phóng.
   * Hủy một lượt đã quá hạn: transaction vẫn commit việc nhả xe (hết hạn), rồi mới trả 409.
   */
  async cancel(
    userId: string,
    reservationId: string,
    key?: string,
  ): Promise<VehicleReservationView> {
    const outcome = await this.repository.inTransaction((tx) =>
      withIdempotency<VehicleReservationView | "expired">(
        tx,
        userId,
        "cancel",
        key,
        { reservationId },
        async () => {
          const reservation = await tx.lockReservation(reservationId);
          if (!reservation)
            throw new NotFoundException("Không tìm thấy lượt đặt xe.");
          if (reservation.userId !== userId)
            throw new ForbiddenException(
              "Bạn không có quyền hủy lượt đặt xe này.",
            );
          if (await this.expireLocked(tx, reservation)) return "expired";
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
        },
        // Nhánh hết hạn đã commit việc nhả xe rồi trả 409: không lưu thành "kết quả" của key.
        (result) => result === "expired",
      ),
    );
    if (outcome === "expired") throw new ConflictException(EXPIRED_MESSAGE);
    return outcome;
  }
}
