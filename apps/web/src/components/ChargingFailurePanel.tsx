import type { useChargingFailures } from "../hooks/useChargingFailures";
export function ChargingFailurePanel({
  model: m,
}: {
  model: ReturnType<typeof useChargingFailures>;
}) {
  return (
    <section
      className="mobility-section mobility-region mobility-history"
      aria-label="Sự cố cổng sạc"
    >
      <div className="section-heading">
        <div>
          <p className="eyebrow">NGƯỜI VẬN HÀNH</p>
          <h2>Sự cố cổng sạc</h2>
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
        Báo hỏng sẽ dừng phiên liên quan. Yêu cầu còn cần sạc giữ thời điểm chờ
        cũ để phân bổ sang cổng khác; cổng hỏng chỉ mở lại sau xác nhận sửa
        xong.
      </p>
      {m.error && (
        <p role="alert" className="notice error">
          {m.error}
        </p>
      )}
      {m.message && (
        <p role="status" className="notice">
          {m.message}
        </p>
      )}
      {m.loading && <p role="status">Đang tải cổng sạc…</p>}
      <label>
        Chọn cổng sạc
        <select
          value={m.selectedId}
          disabled={m.busy || m.loading}
          onChange={(e) => m.setSelectedId(e.target.value)}
        >
          <option value="">Chọn cổng tại Hub</option>
          {m.points.map((p) => (
            <option key={p.id} value={p.id}>
              {p.hubName} · {p.code} ·{" "}
              {p.status === "failed"
                ? "Hỏng"
                : p.status === "occupied"
                  ? "Đang được giữ/sử dụng"
                  : "Còn trống"}
            </option>
          ))}
        </select>
      </label>
      {!m.points.length && !m.loading && (
        <p className="empty">Chưa có cổng sạc.</p>
      )}
      {m.selected && (
        <div className="mobility-list mobility-list-vertical">
          <article>
            <strong>
              {m.selected.hubName} · {m.selected.code}
            </strong>
            {m.selected.sessionId && (
              <p>
                {m.selected.vehicleCode} ·{" "}
                {m.selected.sessionStatus === "charging"
                  ? "Đang sạc"
                  : "Chờ bắt đầu"}{" "}
                · pin {m.selected.batteryPercent ?? "chưa rõ"}% →{" "}
                {m.selected.targetBatteryPercent}%
              </p>
            )}
            {m.selected.status === "failed" ? (
              <div>
                <p>
                  Cổng đang hỏng. Hãy sửa và kiểm tra an toàn trước khi xác
                  nhận.
                </p>
                {m.selected.openIncidentDescription && (
                  <p>Sự cố: {m.selected.openIncidentDescription}</p>
                )}
                <button
                  className="primary"
                  disabled={m.busy || m.loading}
                  onClick={m.recover}
                >
                  Xác nhận đã sửa xong
                </button>
              </div>
            ) : (
              <form
                key={`${m.selected.id}:${m.selected.sessionId ?? ""}`}
                data-point-id={m.selected.id}
                data-session-id={m.selected.sessionId ?? ""}
                onSubmit={m.report}
              >
                <fieldset disabled={m.busy || m.loading}>
                  <label>
                    Mô tả sự cố
                    <input name="description" required maxLength={2000} />
                  </label>
                  {m.selected.sessionStatus === "charging" && (
                    <label>
                      Pin thực tế đã đạt (%)
                      <input
                        name="battery"
                        type="number"
                        required
                        min={m.selected.batteryPercent ?? 0}
                        max="100"
                      />
                      <small>
                        Nhập pin đang quan sát, không tự giả định đã đạt mục
                        tiêu.
                      </small>
                    </label>
                  )}
                  <button className="primary">
                    Báo hỏng cổng và xử lý phiên
                  </button>
                </fieldset>
              </form>
            )}
          </article>
        </div>
      )}
    </section>
  );
}
