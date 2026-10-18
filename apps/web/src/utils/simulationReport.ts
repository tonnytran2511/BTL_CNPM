import type { DemandSimulationResult } from "@emobility/contracts";

/** Format the completed run, independently of any subsequently edited form inputs. */
export function formatSimulationReport(result: DemandSimulationResult): string {
  const p = result.parameters;
  const rows = [
    "BÁO CÁO MÔ PHỎNG TĂNG NHU CẦU",
    `Mô hình: ${result.modelVersion}`,
    `Hub: ${result.hub.name}`,
    `Hub ID: ${result.hub.id}`,
    `Snapshot (UTC): ${result.snapshotCapturedAt}`,
    "",
    "THAM SỐ LẦN CHẠY",
    `Thời lượng: ${p.horizonMinutes} phút`,
    `Bước thời gian: ${p.stepMinutes} phút`,
    `Seed: ${p.seed}`,
    `Nhu cầu ban đầu: ${p.baselineArrivalsPerStep} yêu cầu/bước`,
    `Nhu cầu kịch bản: ${p.scenarioArrivalsPerStep} yêu cầu/bước`,
    `Pin tối thiểu: ${result.limits.minimumBatteryPercent}%`,
    `Giới hạn số bước: ${result.limits.maximumSteps}`,
    `Giới hạn nhu cầu: ${result.limits.maximumArrivalsPerStep} yêu cầu/bước`,
    `Xe đủ điều kiện đầu kỳ: ${result.initialEligibleVehicles}`,
    "",
    "SO SÁNH KẾT QUẢ (ban đầu | kịch bản)",
    `Tổng yêu cầu: ${result.baseline.demand} | ${result.scenario.demand}`,
    `Được phục vụ: ${result.baseline.served} | ${result.scenario.served}`,
    `Không được phục vụ: ${result.baseline.unserved} | ${result.scenario.unserved}`,
    `Xe còn lại: ${result.baseline.remainingVehicles} | ${result.scenario.remainingVehicles}`,
  ];
  for (const [label, run] of [
    ["BAN ĐẦU", result.baseline],
    ["KỊCH BẢN", result.scenario],
  ] as const) {
    rows.push(
      "",
      `DIỄN BIẾN ${label}`,
      "Phút\tNhu cầu\tPhục vụ\tKhông phục vụ\tXe còn lại",
    );
    for (const step of run.timeline)
      rows.push(
        [
          step.elapsedMinutes,
          step.demand,
          step.served,
          step.unserved,
          step.availableVehicles,
        ].join("\t"),
      );
  }
  rows.push(
    "",
    "PHẠM VI VÀ GIẢ ĐỊNH",
    "Mỗi xe đủ điều kiện phục vụ tối đa một yêu cầu rời Hub. Chưa mô phỏng trả xe, sạc, hàng chờ hoặc điều chuyển. Nhu cầu được sinh theo mô hình giả lập, chưa phải dự báo thực tế. Baseline và kịch bản dùng cùng snapshot và seed. Không thay đổi dữ liệu vận hành.",
    "",
  );
  return rows.join("\n");
}
