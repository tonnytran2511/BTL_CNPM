import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { TripView } from "@emobility/contracts";
import {
  ALLOCATION_PORT,
  type AllocationPort,
} from "../integration/allocation.port";
import { RentalRepository } from "./rental.repository";
import { canTransitionReservation, canTransitionTrip } from "./rental.rules";

/** Trả xe bị chặn ở bước chiếm chỗ: transaction đã rollback, cần kèm gợi ý Hub khác (BR-03). */
class ReturnBlocked extends Error {}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: string }).code === "23505"
  );
}

@Injectable()
export class TripService {
  constructor(
    @Inject(RentalRepository) private readonly repository: RentalRepository,
    @Inject(ALLOCATION_PORT) private readonly allocation: AllocationPort,
  ) {}

  list(userId: string): Promise<TripView[]> {
    return this.repository.listTrips(userId);
  }

  /**
   * BR-02: reservation -> fulfilled, tạo trip, xe -> in_use và giải phóng chỗ nguồn trong MỘT transaction.
   * Gửi lặp trên reservation đã fulfilled trả lại đúng chuyến cũ, không tạo chuyến thứ hai.
   */
  async pickup(userId: string, reservationId: string): Promise<TripView> {
    return this.repository.inTransaction(async (tx) => {
      const reservation = await tx.lockReservation(reservationId);
      if (!reservation)
        throw new NotFoundException("Không tìm thấy lượt đặt xe.");
      if (reservation.userId !== userId)
        throw new ForbiddenException("Bạn không có quyền nhận xe này.");
      if (reservation.status === "fulfilled") {
        const tripId = await tx.tripIdByReservation(reservation.id);
        if (tripId) return tx.tripView(tripId);
        throw new ConflictException("Lượt đặt xe này đã được xử lý.");
      }
      if (
        reservation.status !== "active" ||
        !canTransitionReservation(reservation.status, "fulfilled")
      )
        throw new ConflictException(
          "Lượt đặt xe đã bị hủy hoặc hết hạn, không thể nhận xe.",
        );
      // Quá hạn giữ xe thì không nhận được (BR-01); việc chuyển sang expired và nhả xe là của T16.
      if (reservation.expired)
        throw new ConflictException(
          "Đã quá thời hạn giữ xe, không thể nhận xe. Hãy đặt lại.",
        );
      await tx.lockHub(reservation.sourceHubId);
      const vehicle = await tx.lockVehicle(reservation.vehicleId);
      // now() is fixed at BEGIN. A lock wait may have crossed expires_at.
      if (await tx.reservationExpired(reservation.id))
        throw new ConflictException(
          "Đã quá thời hạn giữ xe, không thể nhận xe. Hãy đặt lại.",
        );
      if (
        !vehicle ||
        vehicle.status !== "reserved" ||
        vehicle.hubId !== reservation.sourceHubId
      )
        throw new ConflictException(
          "Xe không còn ở trạng thái đã giữ (có thể đang có sự cố). Không thể nhận xe.",
        );
      await this.allocation.releaseRentalVehicleSpace(
        vehicle.id,
        reservation.sourceHubId,
        tx.client,
      );
      if (!(await tx.departVehicle(vehicle.id)))
        throw new ConflictException("Xe không còn ở trạng thái đã giữ.");
      if (!(await tx.closeReservation(reservation.id, "fulfilled")))
        throw new ConflictException("Lượt đặt xe không còn hiệu lực.");
      let tripId: string;
      try {
        tripId = await tx.insertTrip({
          reservationId: reservation.id,
          userId,
          vehicleId: vehicle.id,
          sourceHubId: reservation.sourceHubId,
          startBatteryPercent: vehicle.batteryPercent,
        });
      } catch (error) {
        if (isUniqueViolation(error))
          throw new ConflictException("Lượt đặt xe này đã có chuyến thuê.");
        throw error;
      }
      return tx.tripView(tripId);
    });
  }

  /**
   * BR-03: kiểm tra và chiếm chỗ ở Hub đích active trong cùng transaction với kết thúc trip.
   * Đích đầy: trip giữ nguyên active, trả 409 kèm gợi ý Hub khác còn chỗ.
   * Gửi lặp cùng Hub đích trên chuyến đã kết thúc trả lại kết quả cũ.
   */
  async returnVehicle(
    userId: string,
    tripId: string,
    targetHubId: string,
  ): Promise<TripView> {
    try {
      return await this.repository.inTransaction(async (tx) => {
        const trip = await tx.lockTrip(tripId);
        if (!trip) throw new NotFoundException("Không tìm thấy chuyến thuê.");
        if (trip.userId !== userId)
          throw new ForbiddenException("Bạn không có quyền trả xe này.");
        if (trip.status === "completed") {
          if (trip.targetHubId === targetHubId) return tx.tripView(trip.id);
          throw new ConflictException(
            "Chuyến thuê này đã kết thúc ở một Hub khác.",
          );
        }
        if (!canTransitionTrip(trip.status, "completed"))
          throw new ConflictException("Chuyến thuê không thể kết thúc.");
        await tx.lockHub(targetHubId);
        const vehicle = await tx.lockVehicle(trip.vehicleId);
        if (!vehicle || vehicle.status !== "in_use")
          throw new ConflictException(
            "Xe không ở trạng thái đang thuê (có thể đang có sự cố). Không thể trả xe.",
          );
        try {
          await this.allocation.claimRentalVehicleSpace(
            vehicle.id,
            targetHubId,
            tx.client,
          );
        } catch (error) {
          if (error instanceof ConflictException)
            throw new ReturnBlocked(error.message);
          throw error;
        }
        if (!(await tx.arriveVehicle(vehicle.id, targetHubId)))
          throw new ConflictException("Xe không còn ở trạng thái đang thuê.");
        if (
          !(await tx.completeTrip(trip.id, targetHubId, vehicle.batteryPercent))
        )
          throw new ConflictException("Chuyến thuê không còn đang chạy.");
        return tx.tripView(trip.id);
      });
    } catch (error) {
      if (!(error instanceof ReturnBlocked)) throw error;
      const suggestedHubs = await this.repository.suggestHubs(targetHubId);
      throw new ConflictException({
        statusCode: 409,
        message: error.message,
        details: { suggestedHubs },
      });
    }
  }
}
