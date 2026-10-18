import type {
  ElectricVehicleType,
  ParkingBooking,
  ChargingQueueEntry,
} from "@emobility/contracts";
export type MobilityStep =
  "vehicle" | "register" | "choose" | "parking" | "charging";
export const vehicleTypes: { value: ElectricVehicleType; label: string }[] = [
  { value: "electric_bicycle", label: "Xe đạp điện" },
  { value: "electric_motorcycle", label: "Xe máy điện" },
];
export const parkingLabels: Record<ParkingBooking["status"], string> = {
  reserved: "Đã đặt",
  checked_in: "Đang đỗ",
  completed: "Đã rời Hub",
  cancelled: "Đã hủy",
};
export const chargingLabels: Record<ChargingQueueEntry["status"], string> = {
  queued: "Đang chờ",
  allocated: "Đã phân bổ",
  fulfilled: "Đã hoàn tất",
  cancelled: "Đã hủy",
};
