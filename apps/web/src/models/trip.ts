import type { HubSuggestion, TripView } from "@emobility/contracts";

/** Tách chuyến đang chạy và lịch sử; API đã sắp mới nhất trước. */
export function splitTrips(items: TripView[]) {
  return {
    current: items.find((item) => item.status === "active") ?? null,
    history: items.filter((item) => item.status !== "active"),
  };
}

/** Lấy gợi ý Hub khác còn chỗ từ phần `details` của lỗi 409 khi trả xe (BR-03). */
export function suggestedHubsFrom(details: unknown): HubSuggestion[] {
  if (!details || typeof details !== "object" || !("suggestedHubs" in details))
    return [];
  const list = (details as { suggestedHubs: unknown }).suggestedHubs;
  return Array.isArray(list) ? (list as HubSuggestion[]) : [];
}
