import type { Role } from "@emobility/contracts";
export const formatNumber = (value: number) =>
  new Intl.NumberFormat("vi-VN").format(value);
export const formatTime = (value: string) =>
  new Intl.DateTimeFormat("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
export const roleLabel = (role: Role) =>
  role === "operator" ? "Người vận hành" : "Sinh viên";
export function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    active: "Đang hoạt động",
    inactive: "Tạm ngừng",
    available: "Sẵn sàng",
    reserved: "Đã giữ chỗ",
    in_use: "Đang sử dụng",
    charging: "Đang sạc",
    maintenance: "Bảo trì",
    redistributing: "Đang điều chuyển",
    occupied: "Đang sử dụng",
    failed: "Có sự cố",
    electric_bicycle: "Xe đạp điện",
    electric_motorcycle: "Xe máy điện",
  };
  return labels[status] ?? status;
}
export const formatDateTime = (value: string) =>
  new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
