import type { HubSummary } from "@emobility/contracts";
import type { useChargingManager } from "../hooks/useChargingManager";
import { chargingSessionLabels } from "../models/charging";
import { formatDateTime } from "../utils/format";
type Props = {
  model: ReturnType<typeof useChargingManager>;
  hubs: HubSummary[];
};
export function ChargingManager({ model: m, hubs }: Props) {
  return (
    <section
      className="mobility-section mobility-region mobility-history"
      aria-label="Điều phối sạc xe cá nhân"
    >
      <div className="section-heading">
        <div>
          <p className="eyebrow">NGƯỜI VẬN HÀNH</p>
          <h2>Điều phối sạc xe cá nhân</h2>
        </div>
        <button
          className="secondary"
          disabled={m.busy || m.loading}
          onClick={m.refresh}
        >
          Làm mới
        </button>
      </div>
      <p>
        Ưu tiên theo cấu hình hệ thống. Xe cần đang đỗ tại Hub để được phân bổ.
      </p>
      {m.loading && <p role="status">Đang tải dữ liệu sạc…</p>}
      {m.error && (
        <p className="notice error" role="alert">
          {m.error}
        </p>
      )}
      {m.message && (
        <p className="notice" role="status">
          {m.message}
        </p>
      )}
      <form onSubmit={m.schedule}>
        <fieldset disabled={m.busy || m.loading}>
          <label>
            Hub cần phân bổ
            <select name="hub" required>
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
          <button className="primary">Phân bổ cổng theo ưu tiên</button>
        </fieldset>
      </form>
      <h3>Hàng chờ đủ điều kiện</h3>
      {!m.data.queue.length && (
        <p className="empty">Chưa có xe cá nhân đủ điều kiện đang chờ.</p>
      )}
      <ol>
        {m.data.queue.map((q) => (
          <li key={q.id}>
            <strong>{q.vehicleCode}</strong> · {q.hubName} · pin{" "}
            {q.batteryPercent}% → {q.targetBatteryPercent}%
            {q.requiredBy ? ` · Cần xe ${formatDateTime(q.requiredBy)}` : ""}
          </li>
        ))}
      </ol>
      <h3>Phiên sạc</h3>
      <p className="muted">
        Pin thực tế do người vận hành nhập từ dữ liệu mô phỏng/quan sát; hệ
        thống chưa tự giả lập quá trình tăng pin. Phiên đang hoạt động hiển thị
        trước.
      </p>
      {!m.data.sessions.length && <p className="empty">Chưa có phiên sạc.</p>}
      <div className="mobility-list">
        {m.data.sessions.map((s) => (
          <article key={s.id}>
            <strong>
              {s.vehicleCode} · {s.hubName} · {s.pointCode}
            </strong>
            <p>
              {chargingSessionLabels[s.status]} · Pin hiện tại{" "}
              {s.batteryPercent ?? "chưa rõ"}% · Mục tiêu{" "}
              {s.targetBatteryPercent}%
            </p>
            {s.startedAt && <p>Bắt đầu {formatDateTime(s.startedAt)}</p>}
            {s.status === "scheduled" && (
              <div className="mobility-actions">
                <button
                  className="primary"
                  disabled={m.busy}
                  onClick={() => m.action(s.id, "start")}
                >
                  Bắt đầu sạc
                </button>
                <button
                  className="secondary"
                  disabled={m.busy}
                  onClick={() => m.action(s.id, "cancel")}
                >
                  Hủy phiên
                </button>
              </div>
            )}
            {s.status === "charging" && (
              <form onSubmit={(e) => m.submitSession(e, s.id)}>
                <fieldset disabled={m.busy}>
                  <label>
                    Pin thực tế (%)
                    <input
                      name="battery"
                      type="number"
                      required
                      min={s.batteryPercent ?? 0}
                      max="100"
                    />
                  </label>
                  <div className="mobility-actions">
                    <button className="primary" name="action" value="complete">
                      Hoàn tất sạc
                    </button>
                    <button className="secondary" name="action" value="cancel">
                      Hủy phiên
                    </button>
                  </div>
                </fieldset>
              </form>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
