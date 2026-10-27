import type { SavedSimulation } from "@emobility/contracts";
import { scenarioLabels } from "../models/scenarios";
import {
  availableResourceLabels,
  demandLabels,
  resourceLabels,
  scenarioMetrics,
} from "../models/scenarioPresentation";

const number = (value: number | null) =>
  value === null
    ? "Chưa có dữ liệu"
    : new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 }).format(
        value,
      );
const rate = (value: number) =>
  new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 20 }).format(value);
const change = (value: number | null) =>
  value === null
    ? "Chưa đủ dữ liệu để so sánh"
    : value === 0
      ? "Không thay đổi"
      : `${value > 0 ? "Tăng" : "Giảm"} ${number(Math.abs(value))}`;

/** Readable text report from the saved run, never from the current form. */
export function formatScenarioReport(saved: SavedSimulation) {
  const r = saved.result,
    p = r.parameters;
  const rows = [
    "BÁO CÁO MÔ PHỎNG",
    `Tình huống: ${scenarioLabels[p.kind]}`,
    `Hub: ${r.hub.name}`,
    `Lưu lúc (UTC): ${saved.createdAt}`,
    `Dữ liệu Hub được lấy lúc (UTC): ${r.snapshotCapturedAt}`,
    "",
    "THIẾT LẬP LẦN CHẠY",
    `Thời gian mô phỏng: ${p.horizonMinutes} phút`,
    `Khoảng cập nhật kết quả: ${p.stepMinutes} phút`,
    `Mã ngẫu nhiên: ${p.seed}`,
    `${demandLabels[p.kind]} ban đầu: ${rate(p.baselineArrivalsPerStep)} yêu cầu mỗi khoảng ${p.stepMinutes} phút`,
  ];
  if (p.kind === "demand_surge")
    rows.push(
      `${demandLabels[p.kind]} khi tăng nhu cầu: ${rate(p.scenarioArrivalsPerStep)} yêu cầu mỗi khoảng ${p.stepMinutes} phút`,
      `Pin tối thiểu để nhận thuê: ${r.limits.minimumBatteryPercent}%`,
    );
  if (p.kind === "parking_full")
    rows.push(`Số chỗ đỗ bị chiếm thêm: ${p.additionalOccupiedSpaces} chỗ`);
  if (p.kind === "charging_failure")
    rows.push(
      `Số cổng giả định bị hỏng: ${p.failedChargingPointIds.length} cổng`,
      `Thời gian sạc ước tính cho mỗi lượt: ${p.chargingServiceMinutes} phút`,
    );
  rows.push("", "SO SÁNH KẾT QUẢ (ban đầu | khi có thay đổi)");
  for (const metric of scenarioMetrics(p.kind))
    rows.push(
      `${metric.label}: ${number(r.baseline[metric.key])} | ${number(r.scenario[metric.key])}`,
    );
  rows.push(
    "",
    "MỨC THAY ĐỔI SO VỚI BAN ĐẦU",
    `Yêu cầu được phục vụ: ${change(r.impact.served)}`,
  );
  if (p.kind === "charging_failure")
    rows.push(
      `Yêu cầu còn chờ: ${change(r.impact.queued)}`,
      `Thời gian chờ trung bình (phút): ${change(r.impact.meanWaitMinutes)}`,
    );
  else rows.push(`Yêu cầu không được phục vụ: ${change(r.impact.unserved)}`);
  for (const [label, run] of [
    ["BAN ĐẦU", r.baseline],
    ["KHI CÓ THAY ĐỔI", r.scenario],
  ] as const) {
    rows.push("", `DIỄN BIẾN ${label}`);
    rows.push(
      p.kind === "charging_failure"
        ? `Phút\tYêu cầu mới\tBắt đầu sạc\tCòn chờ\tSạc xong\t${availableResourceLabels[p.kind]}\tCổng đang dùng`
        : `Phút\tYêu cầu mới\tĐược phục vụ\tKhông phục vụ\t${availableResourceLabels[p.kind]}${p.kind === "parking_full" ? "\tChỗ đang dùng/giữ" : ""}`,
    );
    for (const step of run.timeline)
      rows.push(
        (p.kind === "charging_failure"
          ? [
              step.elapsedMinutes,
              step.demand,
              step.served,
              step.queued,
              step.completed,
              step.availableResources,
              step.busyChargingPoints,
            ]
          : [
              step.elapsedMinutes,
              step.demand,
              step.served,
              step.unserved,
              step.availableResources,
              ...(p.kind === "parking_full" ? [step.occupiedParking] : []),
            ]
        )
          .map(number)
          .join("\t"),
      );
  }
  rows.push("", "GỢI Ý XỬ LÝ");
  if (!r.recommendations.length)
    rows.push("Chưa có thiếu hụt cần đề xuất xử lý trong lần mô phỏng này.");
  r.recommendations.forEach((item, index) => {
    rows.push(
      `${index + 1}. ${item.reason.replace(/snapshot/gi, "dữ liệu tại thời điểm mô phỏng")}`,
    );
    if (item.kind !== "review_capacity")
      rows.push(
        `   Có thể xem xét: ${item.quantity} ${resourceLabels[item.resource]}.`,
      );
    rows.push(
      "   Cần kiểm tra lại tình trạng Hub và tài nguyên trước khi thực hiện. Gợi ý chưa được áp dụng.",
    );
  });
  rows.push(
    "",
    "PHẠM VI VÀ LƯU Ý",
    "Hai trường hợp dùng cùng dữ liệu ban đầu và mã ngẫu nhiên. Số yêu cầu được tạo ngẫu nhiên quanh mức trung bình đã nhập, không phải số khách cố định. Mô phỏng không thay đổi hoạt động thực tế của Hub.",
  );
  if (p.kind === "demand_surge")
    rows.push(
      "Mỗi xe chỉ phục vụ một lượt rời Hub; chưa tính xe quay về hoặc được bổ sung trong thời gian mô phỏng.",
    );
  if (p.kind === "parking_full")
    rows.push(
      "Xe được nhận vào đỗ giữ chỗ đến hết thời gian mô phỏng. Chỗ đã có lịch hẹn trong khoảng này không được cấp thêm.",
    );
  if (p.kind === "charging_failure")
    rows.push(
      "Thời gian sạc là ước tính để so sánh, không phải tính toán công suất hay tăng pin thật. Lượt sạc đã có được giả định còn đủ thời gian sạc ước tính; nếu cổng hỏng, yêu cầu quay về hàng chờ.",
      "Chờ trung bình chỉ tính yêu cầu đã bắt đầu sạc, không gồm lượt sạc đã chạy từ trước. Thời gian đã chờ của các yêu cầu còn lại chưa phải thời gian đến lúc được phục vụ. Chưa có dữ liệu nghĩa là không có mẫu để tính.",
      "Mức sử dụng được tính trên tổng số cổng lắp đặt, kể cả cổng hỏng.",
    );
  rows.push(
    "Kết quả phụ thuộc dữ liệu và giả định tại thời điểm chạy; chưa phải dự báo nhu cầu thực tế.",
    "",
    "THÔNG TIN ĐỐI CHIẾU",
    `Mã báo cáo: ${saved.id}`,
    `Mã Hub: ${r.hub.id}`,
    `Phiên bản tính toán: ${r.modelVersion}`,
    `Số lần cập nhật tối đa: ${r.limits.maximumSteps}`,
    `Thời gian mô phỏng tối đa: ${r.limits.maximumHorizonMinutes} phút`,
    `Nhu cầu trung bình tối đa mỗi khoảng cập nhật: ${r.limits.maximumArrivalsPerStep} yêu cầu`,
    `Giới hạn tổng số yêu cầu: ${r.limits.maximumGeneratedRequests}`,
    "",
  );
  return rows.join("\n");
}
