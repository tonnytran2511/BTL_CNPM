import type { HubSummary, NetworkOverview } from "@emobility/contracts";
export interface Stat {
  label: string;
  value: number;
  hint: string;
}
export function dashboardStats(
  hubs: HubSummary[],
  overview: NetworkOverview | null,
): Stat[] {
  if (overview)
    return [
      {
        label: "Xe sẵn sàng",
        value: overview.totals.availableVehicles,
        hint: "Trong các Hub đang hoạt động",
      },
      {
        label: "Chỗ đỗ còn trống",
        value: overview.totals.availableParking,
        hint: "Đã tính chỗ đang giữ",
      },
      {
        label: "Cổng sạc khả dụng",
        value: overview.totals.availableCharging,
        hint: "Sẵn sàng phục vụ",
      },
      {
        label: "Cổng sạc cần xử lý",
        value: overview.totals.failedCharging,
        hint: "Đang ghi nhận sự cố",
      },
    ];
  return [
    {
      label: "Hub đang hoạt động",
      value: hubs.length,
      hint: "Các điểm phục vụ hiện tại",
    },
    {
      label: "Xe sẵn sàng",
      value: hubs.reduce((s, h) => s + h.vehicles.available, 0),
      hint: "Xem mức pin tại từng Hub",
    },
    {
      label: "Chỗ đỗ còn trống",
      value: hubs.reduce((s, h) => s + h.parking.available, 0),
      hint: "Tình trạng hiện tại",
    },
    {
      label: "Cổng sạc khả dụng",
      value: hubs.reduce((s, h) => s + h.charging.available, 0),
      hint: "Các cổng đang sẵn sàng",
    },
  ];
}
