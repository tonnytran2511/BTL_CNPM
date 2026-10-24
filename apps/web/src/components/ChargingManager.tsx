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
      aria-label="Điều phối sạc"
    >
      <div className="section-heading">
        <div>
          <p className="eyebrow">NGƯỜI VẬN HÀNH</p>
          <h2>Điều phối sạc</h2>
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
      <h3>Yêu cầu sạc xe thuê</h3>
      <p className="muted">
        Yêu cầu đang chờ chưa giữ xe. Khi được phân bổ cổng, xe tạm ngừng nhận
        đặt thuê và điều chuyển.
      </p>
      <form onSubmit={m.createRental}>
        <fieldset
          disabled={m.busy || m.loading || !m.data.rentalCandidates.length}
        >
          <label>
            Xe thuê cần sạc
            <select name="vehicle" required>
              <option value="">Chọn xe thuê</option>
              {m.data.rentalCandidates.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.code} · {v.hubName} · pin {v.batteryPercent}%
                </option>
              ))}
            </select>
          </label>
          <label>
            Pin mục tiêu (%)
            <input name="target" type="number" min="1" max="100" required />
          </label>
          <label>
            Cần xe lúc (tùy chọn)
            <input name="deadline" type="datetime-local" />
          </label>
          <button className="primary">Gửi yêu cầu sạc xe thuê</button>
        </fieldset>
      </form>
      {!m.data.rentalCandidates.length && (
        <p className="empty">Chưa có xe thuê đủ điều kiện gửi yêu cầu mới.</p>
      )}
      {!!m.data.rentalPending.length && (
        <div>
          <h4>Yêu cầu xe thuê còn chờ</h4>
          <ul>
            {m.data.rentalPending.map((q) => (
              <li key={q.id}>
                {q.vehicleCode} · {q.hubName}{" "}
                <button
                  className="secondary"
                  disabled={m.busy}
                  onClick={() => m.cancelQueued(q.id)}
                >
                  Hủy yêu cầu
                </button>
              </li>
            ))}
          </ul>
        </div>
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
        <p className="empty">Chưa có xe đủ điều kiện đang chờ.</p>
      )}
      <ol>
        {m.data.queue.map((q) => (
          <li key={q.id}>
            <strong>{q.vehicleCode}</strong> ·{" "}
            {q.vehicleKind === "rental" ? "Xe thuê" : "Xe cá nhân"} ·{" "}
            {q.hubName} · pin {q.batteryPercent}% → {q.targetBatteryPercent}%
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
              {s.vehicleCode} ·{" "}
              {s.vehicleKind === "rental" ? "Xe thuê" : "Xe cá nhân"} ·{" "}
              {s.hubName} · {s.pointCode}
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
