import type { SavedSimulation } from "@emobility/contracts";
import { scenarioLabels } from "../models/scenarios";
import {
  availableResourceLabels,
  resourceLabels,
  scenarioMetrics,
} from "../models/scenarioPresentation";
import { formatDateTime, formatNumber } from "../utils/format";

const number = (value: number | null) =>
  value === null
    ? "Chưa có dữ liệu"
    : formatNumber(Math.round(value * 100) / 100);
export function ScenarioResults({
  saved,
  onDownload,
}: {
  saved: SavedSimulation;
  onDownload: () => void;
}) {
  const r = saved.result;
  return (
    <section
      className="simulation-results"
      aria-labelledby="scenario-result-title"
      aria-live="polite"
    >
      <div className="simulation-results-heading">
        <h3 id="scenario-result-title">
          {scenarioLabels[r.parameters.kind]} — {r.hub.name}
        </h3>
        <button type="button" className="secondary" onClick={onDownload}>
          Tải báo cáo (.txt)
        </button>
      </div>
      <p>Đã lưu: {formatDateTime(saved.createdAt)}</p>
      <p>
        Dữ liệu ban đầu lúc (UTC): {r.snapshotCapturedAt} · Mã ngẫu nhiên:{" "}
        {r.parameters.seed}
      </p>
      <p>
        Thời gian mô phỏng {r.parameters.horizonMinutes} phút · Cập nhật mỗi{" "}
        {r.parameters.stepMinutes} phút · Nhu cầu mỗi khoảng cập nhật{" "}
        {r.parameters.baselineArrivalsPerStep} →{" "}
        {r.parameters.scenarioArrivalsPerStep} yêu cầu.
      </p>
      {r.parameters.kind === "parking_full" && (
        <p>
          Kịch bản chiếm thêm {r.parameters.additionalOccupiedSpaces} chỗ trong
          toàn thời lượng.
        </p>
      )}
      {r.parameters.kind === "charging_failure" && (
        <p>
          Giả định hỏng {r.parameters.failedChargingPointIds.length} cổng · Thời
          gian sạc ước tính {r.parameters.chargingServiceMinutes} phút/yêu cầu.
        </p>
      )}
      <p className="notice">
        Mô phỏng đã kết thúc. Kết quả được tính từ dữ liệu lúc bắt đầu, không
        phải trạng thái Hub trực tiếp. Chạy mô phỏng không thay đổi xe, chỗ đỗ
        hoặc phiên sạc thật.
      </p>
      <div
        className="simulation-table"
        tabIndex={0}
        role="region"
        aria-label="So sánh chỉ số"
      >
        <table>
          <caption>
            So sánh ban đầu và khi có thay đổi, từ cùng dữ liệu và mã ngẫu nhiên
          </caption>
          <thead>
            <tr>
              <th scope="col">Chỉ số</th>
              <th scope="col">Ban đầu</th>
              <th scope="col">Khi có thay đổi</th>
            </tr>
          </thead>
          <tbody>
            {scenarioMetrics(r.parameters.kind).map((metric) => (
              <tr key={metric.key}>
                <th scope="row">{metric.label}</th>
                <td>{number(r.baseline[metric.key])}</td>
                <td>{number(r.scenario[metric.key])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>
        Chênh lệch so với ban đầu (số dương là tăng, số âm là giảm): phục vụ{" "}
        {number(r.impact.served)}, từ chối {number(r.impact.unserved)}, hàng chờ{" "}
        {number(r.impact.queued)}, chờ trung bình{" "}
        {number(r.impact.meanWaitMinutes)}.
      </p>
      <details>
        <summary>Diễn biến từng bước</summary>
        {(["baseline", "scenario"] as const).map((key) => (
          <div
            key={key}
            className="simulation-table"
            tabIndex={0}
            role="region"
            aria-label={
              key === "baseline"
                ? "Diễn biến ban đầu"
                : "Diễn biến khi có thay đổi"
            }
          >
            <table>
              <caption>
                {key === "baseline" ? "Ban đầu" : "Khi có thay đổi"} — khách đến
                đầu khoảng cập nhật, kết quả ghi cuối khoảng
              </caption>
              <thead>
                <tr>
                  <th scope="col">Phút</th>
                  <th scope="col">Đến mới</th>
                  <th scope="col">Bắt đầu phục vụ</th>
                  <th scope="col">Từ chối</th>
                  <th scope="col">Hàng chờ</th>
                  <th scope="col">Sạc xong</th>
                  <th scope="col">
                    {availableResourceLabels[r.parameters.kind]}
                  </th>
                  <th scope="col">Chỗ đang chiếm/giữ</th>
                  <th scope="col">Cổng bận trong bước</th>
                </tr>
              </thead>
              <tbody>
                {r[key].timeline.map((step) => (
                  <tr key={step.elapsedMinutes}>
                    <th scope="row">{step.elapsedMinutes}</th>
                    <td>{step.demand}</td>
                    <td>{step.served}</td>
                    <td>{step.unserved}</td>
                    <td>{step.queued}</td>
                    <td>{step.completed}</td>
                    <td>{step.availableResources}</td>
                    <td>{step.occupiedParking}</td>
                    <td>{step.busyChargingPoints}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </details>
      <h4>Đề xuất tham khảo</h4>
      <p className="muted">
        Không tự áp dụng. Khi thực thi qua chức năng vận hành, phải kiểm tra lại
        quyền, trạng thái xe/chỗ/cổng và sức chứa hiện tại. Chưa tính hành trình
        hoặc giữ tài nguyên tại Hub khác.
      </p>
      {!r.recommendations.length && (
        <p>Không có thiếu hụt cuối kỳ để đề xuất trong mô hình này.</p>
      )}
      {r.recommendations.map((item, i) => (
        <div key={i} className="notice">
          <p>
            {item.reason.replace(
              /snapshot/gi,
              "dữ liệu tại thời điểm mô phỏng",
            )}
          </p>
          {item.kind !== "review_capacity" && (
            <p>
              Có thể xem xét: {item.quantity} {resourceLabels[item.resource]}.
            </p>
          )}
          <small>
            Dữ liệu lúc (UTC): {item.snapshotCapturedAt}. Cần kiểm tra lại trước
            thực thi.
          </small>
        </div>
      ))}
    </section>
  );
}
