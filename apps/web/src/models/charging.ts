import type { ChargingSessionView } from "@emobility/contracts";
export const chargingSessionLabels: Record<
  ChargingSessionView["status"],
  string
> = {
  scheduled: "Đã giữ cổng",
  charging: "Đang sạc",
  completed: "Hoàn tất",
  cancelled: "Đã hủy",
  interrupted: "Gián đoạn",
};
