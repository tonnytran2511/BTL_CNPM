import type { HubSummary } from "@emobility/contracts";
import type { useScenarios } from "../hooks/useScenarios";
import { scenarioLabels } from "../models/scenarios";
import { demandLabels } from "../models/scenarioPresentation";
import { formatDateTime, formatNumber } from "../utils/format";
import { ScenarioResults } from "./ScenarioResults";
import { ScrollableHistory } from "./ScrollableHistory";

export function ScenarioPanel({
  model: m,
  hubs,
}: {
  model: ReturnType<typeof useScenarios>;
  hubs: HubSummary[];
}) {
  return (
    <section className="simulation-panel" aria-labelledby="scenario-title">
      <p className="eyebrow">THỬ CÁC TÌNH HUỐNG</p>
      <h2 id="scenario-title">So sánh ba kịch bản</h2>
      <p className="simulation-intro">
        Chọn một thay đổi để xem Hub sẽ phục vụ ra sao so với ban đầu. Kết quả
        được lưu để xem lại và không ảnh hưởng hoạt động thực tế.
      </p>
      <details className="scenario-help">
        <summary>Cách nhập thông tin và đọc kết quả</summary>
        <ul>
          <li>
            Chọn thời gian muốn xem trước và khoảng cập nhật kết quả. Ví dụ: xem
            trong 60 phút, cập nhật mỗi 5 phút. Số khách là mức trung bình mỗi
            khoảng, có thể dao động khi chạy.
          </li>
          <li>
            Tăng nhu cầu: mỗi xe đủ pin, sẵn sàng chỉ rời Hub một lần; không mô
            phỏng trả xe.
          </li>
          <li>
            Chỗ đỗ: cùng nhu cầu xe đến ở hai nhánh; kịch bản chiếm thêm chỗ
            ngay đầu kỳ. Xe nhận vào giữ chỗ đến hết kỳ. Chỗ đã có lịch trong
            khoảng mô phỏng được loại để tránh hứa trùng.
          </li>
          <li>
            Cổng hỏng: cùng nhu cầu sạc ở hai nhánh. Thời gian phục vụ là giả
            định nhập vào, không suy từ công suất hoặc tăng pin thật. Phiên đầu
            kỳ giả định còn đủ một thời gian phục vụ; phiên bị hỏng quay lại
            hàng chờ.
          </li>
          <li>
            Các yêu cầu đang chờ được xét theo thứ tự ưu tiên của hệ thống;
            khách mới được xếp theo thứ tự đến. Thời gian chờ trung bình chỉ
            tính khách đã bắt đầu sạc. Hãy xem cả số khách còn chờ khi kết thúc.
          </li>
          <li>
            Mức sử dụng sạc được tính trên tổng số cổng, kể cả cổng hỏng. Các
            tình huống được tính riêng; gợi ý xử lý không tự thực hiện.
          </li>
        </ul>
      </details>
      {m.error && (
        <p className="notice error" role="alert">
          {m.error}
        </p>
      )}
      {!m.limits ? (
        <div>
          <p role="status">
            {m.error
              ? "Chưa tải được thiết lập mô phỏng."
              : "Đang tải thiết lập mô phỏng…"}
          </p>
          <button type="button" className="secondary" onClick={m.retryConfig}>
            Thử tải lại
          </button>
        </div>
      ) : (
        <>
          <p className="simulation-limits">
            Giới hạn: {formatNumber(m.limits.maximumSteps)} lần cập nhật ·{" "}
            {formatNumber(m.limits.maximumHorizonMinutes)} phút ·{" "}
            {formatNumber(m.limits.maximumGeneratedRequests)} yêu cầu · Pin thuê
            tối thiểu {m.limits.minimumBatteryPercent}%.
          </p>
          <form onSubmit={m.run}>
            <fieldset className="simulation-fields" disabled={m.busy}>
              <legend>Thiết lập kịch bản</legend>
              <div className="simulation-inputs">
                <label>
                  Kịch bản
                  <select
                    value={m.form.kind}
                    onChange={(e) =>
                      m.change("kind", e.target.value as typeof m.form.kind)
                    }
                  >
                    {Object.entries(scenarioLabels).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Hub muốn mô phỏng
                  <select
                    required
                    value={m.form.hubId}
                    onChange={(e) => m.change("hubId", e.target.value)}
                  >
                    <option value="">Chọn Hub</option>
                    {hubs
                      .filter((h) => h.status === "active")
                      .map((h) => (
                        <option key={h.id} value={h.id}>
                          {h.name}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  Mã ngẫu nhiên
                  <input
                    type="number"
                    required
                    min="0"
                    max="4294967295"
                    step="1"
                    value={m.form.seed}
                    onChange={(e) => m.change("seed", e.target.value)}
                  />
                  <small>
                    Có thể giữ 42. Giữ cùng mã và cùng dữ liệu ban đầu để so
                    sánh các lần chạy.
                  </small>
                </label>
                <label>
                  Thời gian muốn mô phỏng (phút)
                  <input
                    type="number"
                    required
                    min="1"
                    max={m.limits.maximumHorizonMinutes}
                    step="1"
                    value={m.form.horizonMinutes}
                    onChange={(e) => m.change("horizonMinutes", e.target.value)}
                  />
                </label>
                <label>
                  Cập nhật kết quả mỗi (phút)
                  <input
                    type="number"
                    required
                    min="1"
                    step="1"
                    value={m.form.stepMinutes}
                    onChange={(e) => m.change("stepMinutes", e.target.value)}
                  />
                </label>
                <label>
                  {demandLabels[m.form.kind]}
                  {m.form.kind === "demand_surge" ? " ban đầu" : ""} (mỗi khoảng
                  cập nhật)
                  <input
                    type="number"
                    required
                    min="0"
                    max={m.limits.maximumArrivalsPerStep}
                    step="any"
                    value={m.form.baselineArrivalsPerStep}
                    onChange={(e) =>
                      m.change("baselineArrivalsPerStep", e.target.value)
                    }
                  />
                </label>
                {m.form.kind === "demand_surge" && (
                  <label>
                    Số lượt thuê khi nhu cầu tăng (mỗi khoảng cập nhật)
                    <input
                      type="number"
                      required
                      min="0"
                      max={m.limits.maximumArrivalsPerStep}
                      step="any"
                      value={m.form.scenarioArrivalsPerStep}
                      onChange={(e) =>
                        m.change("scenarioArrivalsPerStep", e.target.value)
                      }
                    />
                  </label>
                )}
                {m.form.kind === "parking_full" && (
                  <label>
                    Số chỗ đỗ bị chiếm thêm
                    <input
                      type="number"
                      required
                      min="1"
                      step="1"
                      value={m.form.additionalOccupiedSpaces}
                      onChange={(e) =>
                        m.change("additionalOccupiedSpaces", e.target.value)
                      }
                    />
                    <small>
                      Số chỗ dự kiến không còn trống ngay từ lúc bắt đầu. Không
                      được vượt số chỗ có thể nhận xe.
                    </small>
                  </label>
                )}
                {m.form.kind === "charging_failure" && (
                  <label>
                    Thời gian sạc ước tính mỗi lượt (phút)
                    <input
                      type="number"
                      required
                      min="1"
                      step="1"
                      value={m.form.chargingServiceMinutes}
                      onChange={(e) =>
                        m.change("chargingServiceMinutes", e.target.value)
                      }
                    />
                    <small>
                      Là bội số của khoảng cập nhật, không dài hơn thời gian mô
                      phỏng. Đây là ước tính để so sánh, không thay đổi pin thực
                      tế.
                    </small>
                  </label>
                )}
              </div>
              {m.form.kind === "charging_failure" && (
                <fieldset className="scenario-points">
                  <legend>Chọn cổng sạc giả định bị hỏng</legend>
                  {m.pointError && <p role="alert">{m.pointError}</p>}
                  {!m.detail && !m.pointError && (
                    <p>
                      {m.form.hubId
                        ? "Đang tải cổng…"
                        : "Chọn Hub để xem cổng."}
                    </p>
                  )}
                  {m.detail?.chargingPoints.map((point) => (
                    <label key={point.id}>
                      <input
                        type="checkbox"
                        disabled={point.status === "failed"}
                        checked={m.form.failedChargingPointIds.includes(
                          point.id,
                        )}
                        onChange={() => m.togglePoint(point.id)}
                      />
                      {point.code} —{" "}
                      {point.status === "failed"
                        ? "Đã hỏng (không thể chọn)"
                        : point.status === "occupied"
                          ? "Đang sử dụng"
                          : "Sẵn sàng"}
                    </label>
                  ))}
                  {m.detail && !m.detail.chargingPoints.length && (
                    <p>Hub chưa có cổng sạc.</p>
                  )}
                  <small>
                    Tình trạng cổng sẽ được kiểm tra lại khi bạn chạy mô phỏng.
                  </small>
                </fieldset>
              )}
              <div className="simulation-form-actions">
                <button
                  type="button"
                  className="secondary"
                  disabled={!m.saved && !m.error}
                  onClick={m.clear}
                >
                  Xóa kết quả đang xem
                </button>
                <button type="submit" className="primary">
                  {m.busy ? "Đang xử lý…" : "Chạy và lưu mô phỏng"}
                </button>
              </div>
            </fieldset>
          </form>
        </>
      )}
      {m.busy && <p role="status">Đang tải hoặc tính kết quả…</p>}
      {m.saved && <ScenarioResults saved={m.saved} onDownload={m.download} />}
      <section
        className="simulation-results"
        aria-labelledby="scenario-history-title"
      >
        <div className="simulation-results-heading">
          <h3 id="scenario-history-title">Lịch sử mô phỏng đã lưu</h3>
          <button
            className="secondary"
            type="button"
            disabled={m.historyBusy}
            onClick={m.refreshHistory}
          >
            Tải lại lịch sử
          </button>
        </div>
        <p className="muted">
          Xóa kết quả đang xem không xóa lịch sử. Mở bản lưu để xem đúng dữ liệu
          và thiết lập lúc chạy, không chạy lại. Chỉ người vận hành được truy
          cập.
        </p>
        {m.historyError && (
          <p className="notice error" role="alert">
            {m.historyError}
          </p>
        )}
        {m.historyBusy && <p role="status">Đang tải lịch sử…</p>}
        {!m.history.items.length && !m.historyError && (
          <p>Chưa có lần mô phỏng được lưu.</p>
        )}
        <ScrollableHistory
          label="Lịch sử mô phỏng"
          count={m.history.items.length}
        >
          {m.history.items.map((item) => (
            <div key={item.id} className="scenario-history-item">
              <div>
                <strong>
                  {scenarioLabels[item.kind]} — {item.hubName}
                </strong>
                <p>{formatDateTime(item.createdAt)}</p>
              </div>
              <button
                className="secondary"
                type="button"
                disabled={m.busy}
                onClick={() => m.open(item.id)}
              >
                Xem bản lưu
              </button>
            </div>
          ))}
        </ScrollableHistory>
        {m.history.nextBefore && (
          <button
            className="secondary"
            type="button"
            disabled={m.historyBusy}
            onClick={m.moreHistory}
          >
            Tải thêm lịch sử
          </button>
        )}
      </section>
    </section>
  );
}
