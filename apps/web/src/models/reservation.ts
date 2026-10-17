import type {
  VehicleReservationState,
  VehicleReservationView,
} from "@emobility/contracts";

export const reservationStatusLabel: Record<VehicleReservationState, string> = {
  active: "Đang giữ xe",
  cancelled: "Đã hủy",
  expired: "Hết hạn",
  fulfilled: "Đã nhận xe",
};

/** Tách lượt đang giữ và lịch sử; giữ thứ tự mới nhất trước mà API đã sắp. */
export function splitReservations(items: VehicleReservationView[]) {
  return {
    active: items.filter((item) => item.status === "active"),
    history: items.filter((item) => item.status !== "active"),
  };
}

/** Số phút còn lại làm tròn lên; <= 0 nghĩa là đã quá hạn giữ. */
export function minutesLeft(expiresAt: string, now: number): number {
  return Math.ceil((Date.parse(expiresAt) - now) / 60_000);
}
