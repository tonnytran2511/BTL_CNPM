import type { HubSummary } from "@emobility/contracts";
import type { useSimulation } from "../hooks/useSimulation";
import { formatNumber, formatTime } from "../utils/format";

interface Props {
  model: ReturnType<typeof useSimulation>;
  hubs: HubSummary[];
  onOpenGuide?: () => void;
}
export function SimulationPanel({ model: m, hubs, onOpenGuide }: Props) {
  return (
    <section className="simulation-panel" aria-labelledby="simulation-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">THAM SỐ VÀ KẾT QUẢ</p>
          <h2 id="simulation-title">Mô phỏng tăng nhu cầu</h2>
        </div>
        {onOpenGuide && (
          <button
            type="button"
            className="secondary"
            onClick={onOpenGuide}
            aria-haspopup="dialog"
          >
            Hướng dẫn sử dụng
          </button>
        )}
      </div>
      <p className="simulation-intro">
        Mô phỏng lượt rời Hub bằng xe có sẵn. Mỗi xe phục vụ tối đa một yêu cầu;
        chưa mô phỏng trả xe, sạc hoặc hàng chờ. Chạy trên snapshot riêng, không
        thay đổi vận hành.
      </p>
      {m.error && (
        <p className="notice error" role="alert">
          {m.error}
        </p>
      )}
      {!m.limits ? (
        <div>
          <p role="status">
            {m.error ? "Chưa tải được cấu hình." : "Đang tải cấu hình…"}
          </p>
          <button className="secondary" onClick={m.retry}>
            Tải lại cấu hình
          </button>
        </div>
      ) : (
        <>
          <p className="simulation-limits muted">
            Tối đa {formatNumber(m.limits.maximumSteps)} bước; nhu cầu trung
            bình tối đa {formatNumber(m.limits.maximumArrivalsPerStep)} yêu
            cầu/bước. Pin tối thiểu: {m.limits.minimumBatteryPercent}%.
          </p>
          <form onSubmit={m.run}>
            <fieldset className="simulation-fields" disabled={m.busy}>
              <legend>Thiết lập mô phỏng</legend>
              <div className="simulation-inputs">
                <label>
                  Hub nguồn
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
                  Thời lượng (phút)
                  <input
                    required
                    type="number"
                    min="1"
                    step="1"
                    value={m.form.horizonMinutes}
                    onChange={(e) => m.change("horizonMinutes", e.target.value)}
                  />
                </label>
                <label>
                  Bước thời gian (phút)
                  <input
                    required
                    type="number"
                    min="1"
                    step="1"
                    value={m.form.stepMinutes}
                    onChange={(e) => m.change("stepMinutes", e.target.value)}
                  />
                </label>
                <label>
                  Nhu cầu ban đầu (yêu cầu/bước)
                  <input
                    required
                    type="number"
                    min="0"
                    max={m.limits.maximumArrivalsPerStep}
                    step="any"
                    value={m.form.baselineArrivalsPerStep}
                    onChange={(e) =>
                      m.change("baselineArrivalsPerStep", e.target.value)
                    }
                  />
                </label>
                <label>
                  Nhu cầu kịch bản (yêu cầu/bước)
                  <input
                    required
                    type="number"
                    min="0"
                    max={m.limits.maximumArrivalsPerStep}
                    step="any"
                    value={m.form.scenarioArrivalsPerStep}
                    onChange={(e) =>
                      m.change("scenarioArrivalsPerStep", e.target.value)
                    }
                  />
                </label>
                <label>
                  Seed ngẫu nhiên
                  <input
                    required
                    type="number"
                    min="0"
                    max="4294967295"
                    step="1"
                    value={m.form.seed}
                    aria-describedby="seed-advanced-note"
                    onChange={(e) => m.change("seed", e.target.value)}
                  />
                  <small id="seed-advanced-note" className="muted">
                    Cài đặt nâng cao — có thể giữ giá trị mặc định 42.
                  </small>
                </label>
              </div>
              <div className="simulation-form-actions">
                <button
                  className="secondary"
                  type="button"
                  onClick={m.clearResults}
                  disabled={!m.result && !m.error}
                >
                  Xóa kết quả
                </button>
                <button
                  className="secondary"
                  type="button"
                  onClick={m.randomize}
                >
                  Ngẫu nhiên tham số ↻
                </button>
                <button className="primary" type="submit">
                  {m.busy ? "Đang mô phỏng…" : "Chạy mô phỏng"}
                </button>
              </div>
            </fieldset>
          </form>
        </>
      )}
      {m.busy && <p role="status">Đang lấy snapshot và tính kết quả…</p>}
      {m.result && (
        <div className="simulation-results" aria-live="polite">
          <div className="simulation-results-heading">
            <h3>Kết quả: {m.result.hub.name}</h3>
            <button type="button" className="secondary" onClick={m.saveReport}>
              Lưu báo cáo mô phỏng (.txt) ↓
            </button>
          </div>
          <p>
            Snapshot: {formatTime(m.result.snapshotCapturedAt)} · Xe đủ điều
            kiện: {formatNumber(m.result.initialEligibleVehicles)} · Seed:{" "}
            {m.result.parameters.seed}
          </p>
          <p className="muted">
            Kết quả của lần chạy gần nhất: {m.result.parameters.horizonMinutes}{" "}
            phút, bước {m.result.parameters.stepMinutes} phút; nhu cầu{" "}
            {m.result.parameters.baselineArrivalsPerStep} →{" "}
            {m.result.parameters.scenarioArrivalsPerStep} yêu cầu/bước.
          </p>
          <section aria-labelledby="simulated-hub-title">
            <h4 id="simulated-hub-title">Trạng thái Hub trong mô phỏng</h4>
            <p className="muted">
              Mô phỏng đã tính xong. Các trạng thái dưới đây thuộc lần chạy này,
              không phải trạng thái vận hành hiện tại của Hub. Xe thực tế không
              bị di chuyển hoặc đặt chỗ.
            </p>
            <div className="simulation-table">
              <table>
                <caption>
                  {m.result.hub.name} · Snapshot: {m.result.snapshotCapturedAt}
                  {" · "}
                  {m.result.modelVersion}
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Trạng thái</th>
                    <th scope="col">Xe đủ điều kiện còn lại</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <th scope="row">Snapshot trước mô phỏng</th>
                    <td>{formatNumber(m.result.initialEligibleVehicles)}</td>
                  </tr>
                  <tr>
                    <th scope="row">
                      Nhu cầu ban đầu — sau {m.result.parameters.horizonMinutes}{" "}
                      phút mô phỏng
                    </th>
                    <td>{formatNumber(m.result.baseline.remainingVehicles)}</td>
                  </tr>
                  <tr>
                    <th scope="row">
                      Nhu cầu tăng — sau {m.result.parameters.horizonMinutes}{" "}
                      phút mô phỏng
                    </th>
                    <td>{formatNumber(m.result.scenario.remainingVehicles)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="muted">
              Chỉ đếm xe sẵn sàng và đủ pin trong snapshot. Mô hình này chưa mô
              phỏng trả xe, chỗ đỗ hay cổng sạc. Xóa kết quả để ẩn lần chạy và
              giữ nguyên tham số; mô phỏng không chạy liên tục.
            </p>
          </section>
          <div className="simulation-table">
            <table>
              <caption>So sánh cùng snapshot và seed</caption>
              <thead>
                <tr>
                  <th scope="col">Chỉ số</th>
                  <th scope="col">Ban đầu</th>
                  <th scope="col">Kịch bản</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">Tổng yêu cầu</th>
                  <td>{formatNumber(m.result.baseline.demand)}</td>
                  <td>{formatNumber(m.result.scenario.demand)}</td>
                </tr>
                <tr>
                  <th scope="row">Được phục vụ</th>
                  <td>{formatNumber(m.result.baseline.served)}</td>
                  <td>{formatNumber(m.result.scenario.served)}</td>
                </tr>
                <tr>
                  <th scope="row">Không được phục vụ</th>
                  <td>{formatNumber(m.result.baseline.unserved)}</td>
                  <td>{formatNumber(m.result.scenario.unserved)}</td>
                </tr>
                <tr>
                  <th scope="row">Xe đủ điều kiện còn lại</th>
                  <td>{formatNumber(m.result.baseline.remainingVehicles)}</td>
                  <td>{formatNumber(m.result.scenario.remainingVehicles)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <details>
            <summary>Diễn biến từng bước</summary>
            <div className="simulation-table">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Phút</th>
                    <th scope="col">Nhu cầu ban đầu</th>
                    <th scope="col">Nhu cầu kịch bản</th>
                    <th scope="col">Phục vụ kịch bản</th>
                    <th scope="col">Từ chối kịch bản</th>
                    <th scope="col">Xe còn lại</th>
                  </tr>
                </thead>
                <tbody>
                  {m.result.scenario.timeline.map((step, i) => (
                    <tr key={step.elapsedMinutes}>
                      <th scope="row">{step.elapsedMinutes}</th>
                      <td>{m.result!.baseline.timeline[i].demand}</td>
                      <td>{step.demand}</td>
                      <td>{step.served}</td>
                      <td>{step.unserved}</td>
                      <td>{step.availableVehicles}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </div>
      )}
    </section>
  );
}
