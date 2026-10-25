import type {
  ScenarioKind,
  ScenarioRun,
  SimulationRecommendation,
} from "@emobility/contracts";
export interface ScenarioMetricLabel {
  key: keyof Omit<ScenarioRun, "timeline">;
  label: string;
}
export const resourceLabels: Record<
  SimulationRecommendation["resource"],
  string
> = { vehicle: "xe", parking_space: "chỗ đỗ", charging_point: "cổng sạc" };
export const demandLabels: Record<ScenarioKind, string> = {
  demand_surge: "Số lượt thuê trung bình",
  parking_full: "Số xe đến đỗ trung bình",
  charging_failure: "Số yêu cầu sạc trung bình",
};
export const availableResourceLabels: Record<ScenarioKind, string> = {
  demand_surge: "Xe sẵn sàng",
  parking_full: "Chỗ đỗ còn có thể nhận xe",
  charging_failure: "Cổng sạc còn trống",
};
export function scenarioMetrics(kind: ScenarioKind): ScenarioMetricLabel[] {
  const shared: ScenarioMetricLabel[] = [
    {
      key: "demand",
      label:
        kind === "charging_failure"
          ? "Tổng yêu cầu sạc (gồm yêu cầu đã có)"
          : kind === "parking_full"
            ? "Tổng số xe đến đỗ"
            : "Tổng lượt yêu cầu thuê xe",
    },
    {
      key: "served",
      label:
        kind === "charging_failure"
          ? "Yêu cầu đã bắt đầu sạc"
          : kind === "parking_full"
            ? "Xe được nhận vào đỗ"
            : "Lượt thuê được phục vụ",
    },
    {
      key: "initialResources",
      label: `${availableResourceLabels[kind]} lúc bắt đầu`,
    },
    {
      key: "remainingResources",
      label: `${availableResourceLabels[kind]} khi kết thúc`,
    },
  ];
  if (kind === "charging_failure")
    return [
      ...shared,
      { key: "queued", label: "Yêu cầu còn chờ khi kết thúc" },
      { key: "completed", label: "Lượt sạc đã hoàn thành" },
      { key: "chargingUtilizationPercent", label: "Mức sử dụng cổng sạc (%)" },
      {
        key: "meanWaitMinutes",
        label: "Chờ trung bình trước khi bắt đầu sạc (phút)",
      },
      {
        key: "waitingAtEndMinutes",
        label: "Thời gian đã chờ của các yêu cầu còn lại (phút)",
      },
    ];
  return [
    ...shared,
    {
      key: "unserved",
      label:
        kind === "parking_full"
          ? "Xe không tìm được chỗ đỗ"
          : "Lượt thuê không có xe phục vụ",
    },
    ...(kind === "parking_full"
      ? [
          {
            key: "peakParking" as const,
            label: "Số chỗ đỗ được sử dụng nhiều nhất",
          },
        ]
      : []),
  ];
}
