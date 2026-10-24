import { ScrollableHistory } from "./ScrollableHistory";
import type { HubSummary } from "@emobility/contracts";
import type { useMobility } from "../hooks/useMobility";
import {
  vehicleTypes,
  parkingLabels,
  chargingLabels,
} from "../models/mobility";
import { formatDateTime as formatTime } from "../utils/format";
type Props = { model: ReturnType<typeof useMobility>; hubs: HubSummary[] };
export function MobilityPanel({ model: m, hubs }: Props) {
  const hubOptions = hubs.map((h) => (
    <option key={h.id} value={h.id} disabled={h.status !== "active"}>
      {h.name}
      {h.status !== "active" ? " (ngừng hoạt động)" : ""}
    </option>
  ));
  const vehicleOptions = m.vehicles.map((v) => (
    <option key={v.id} value={v.id}>
      {v.code} · {v.batteryPercent ?? "Chưa rõ"}% pin
    </option>
  ));
  return (
    <section className="mobility-section" aria-label="Xe cá nhân, đỗ và sạc">
      <section
        className="mobility-region mobility-registration"
        aria-label="Đăng ký xe và chọn dịch vụ"
      >
        <div className="section-heading">
          <div>
            <p className="eyebrow">XE CÁ NHÂN</p>
            <h2>Đỗ xe & yêu cầu sạc</h2>
          </div>
          <button
            className="secondary"
            disabled={m.busy || m.loading}
            onClick={m.refresh}
          >
            Làm mới
          </button>
        </div>
        {m.loading && <p role="status">Đang tải xe và lịch đỗ…</p>}
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
        {!m.loading && (
          <div className="mobility-flow">
            <p className="eyebrow">
              {m.step === "register" || m.step === "vehicle"
                ? "BƯỚC 1 · ĐĂNG KÝ XE"
                : m.step === "choose"
                  ? "BƯỚC 2 · CHỌN DỊCH VỤ"
                  : "BƯỚC 3 · NHẬP THÔNG TIN"}
            </p>
            {m.step === "vehicle" && (
              <>
                <h3>Bạn đã đăng ký xe cá nhân chưa?</h3>
                <p className="muted">Chọn tình trạng đăng ký xe để tiếp tục.</p>
                <div className="mobility-choices">
                  <button
                    className="mobility-choice"
                    disabled={m.busy}
                    onClick={() => m.selectStep("choose")}
                  >
                    <strong>Đã có xe đăng ký →</strong>
                    <span>
                      Sử dụng xe đã đăng ký để chọn dịch vụ đỗ hoặc sạc.
                    </span>
                  </button>
                  <button
                    className="mobility-choice"
                    disabled={m.busy}
                    onClick={() => m.selectStep("register")}
                  >
                    <strong>Chưa đăng ký xe →</strong>
                    <span>
                      Đăng ký thông tin xe cá nhân trước khi chọn dịch vụ.
                    </span>
                  </button>
                </div>
              </>
            )}
            {m.step === "choose" && (
              <>
                <h3>Bạn muốn đặt chỗ đỗ hay yêu cầu sạc?</h3>
                <p className="muted">
                  Chọn dịch vụ để tiếp tục với xe đã đăng ký.
                </p>
                <div className="mobility-choices">
                  <button
                    className="mobility-choice"
                    disabled={m.busy}
                    onClick={() => m.selectStep("parking")}
                  >
                    <strong>Đặt chỗ đỗ →</strong>
                    <span>Chọn Hub và thời gian đỗ phù hợp.</span>
                  </button>
                  <button
                    className="mobility-choice"
                    disabled={m.busy}
                    onClick={() => m.selectStep("charging")}
                  >
                    <strong>Yêu cầu sạc →</strong>
                    <span>Gửi yêu cầu cho xe đã check-in tại Hub.</span>
                  </button>
                </div>
                <button
                  className="secondary"
                  disabled={m.busy}
                  onClick={() => m.selectStep("register")}
                >
                  Đăng ký thêm xe
                </button>
              </>
            )}
            {(m.step === "register" || m.step === "choose") && (
              <button
                className="secondary"
                disabled={m.busy}
                onClick={() => m.selectStep("vehicle")}
              >
                ← Quay lại bước 1
              </button>
            )}
            {(m.step === "parking" || m.step === "charging") && (
              <button
                className="secondary"
                disabled={m.busy}
                onClick={() => m.selectStep("choose")}
              >
                ← Quay lại chọn dịch vụ
              </button>
            )}
          </div>
        )}
        <div className="mobility-forms mobility-step-form">
          {!m.loading && m.step === "register" && (
            <form onSubmit={m.register}>
              <h3>Đăng ký xe cá nhân</h3>
              <fieldset disabled={m.busy || m.loading}>
                <label>
                  Mã xe / biển số
                  <input name="code" required maxLength={40} />
                </label>
                <label>
                  Loại xe
                  <select name="type">
                    {vehicleTypes.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Pin hiện tại (%)
                  <input
                    name="battery"
                    type="number"
                    min="0"
                    max="100"
                    required
                  />
                </label>
                <button className="primary">Đăng ký xe</button>
              </fieldset>
            </form>
          )}
          {!m.loading && m.step === "parking" && (
            <form onSubmit={m.reserve}>
              <h3>Thông tin đặt chỗ đỗ</h3>
              <fieldset disabled={m.busy || m.loading || !m.vehicles.length}>
                <label>
                  Xe của tôi
                  <select name="vehicle" required>
                    <option value="">Chọn xe</option>
                    {vehicleOptions}
                  </select>
                </label>
                <label>
                  Hub
                  <select name="hub" required>
                    <option value="">Chọn Hub</option>
                    {hubOptions}
                  </select>
                </label>
                <label>
                  Bắt đầu
                  <input type="datetime-local" name="start" required />
                </label>
                <label>
                  Kết thúc
                  <input type="datetime-local" name="end" required />
                </label>
                <button className="primary">Đặt chỗ</button>
              </fieldset>
              {!m.vehicles.length && <p>Đăng ký xe để đặt chỗ.</p>}
            </form>
          )}
          {!m.loading && m.step === "charging" && (
            <form onSubmit={m.charge}>
              <h3>Thông tin yêu cầu sạc</h3>
              <p>Xe cần check-in tại Hub trước khi gửi yêu cầu.</p>
              <fieldset disabled={m.busy || m.loading || !m.vehicles.length}>
                <label>
                  Xe
                  <select name="vehicle" required>
                    <option value="">Chọn xe</option>
                    {vehicleOptions}
                  </select>
                </label>
                <label>
                  Hub đang đỗ
                  <select name="hub" required>
                    <option value="">Chọn Hub</option>
                    {hubOptions}
                  </select>
                </label>
                <label>
                  Pin mục tiêu (%)
                  <input
                    name="target"
                    type="number"
                    min="1"
                    max="100"
                    required
                  />
                </label>
                <label>
                  Cần xe lúc (tùy chọn)
                  <input name="requiredBy" type="datetime-local" />
                </label>
                <button className="primary">Gửi yêu cầu sạc</button>
              </fieldset>
            </form>
          )}
        </div>
        {m.step === "parking" && (
          <details className="availability">
            <summary>Tra cứu chỗ đỗ theo thời gian</summary>
            <form onSubmit={m.checkAvailability}>
              <fieldset disabled={m.busy}>
                <label>
                  Hub
                  <select name="hub" required>
                    <option value="">Chọn Hub</option>
                    {hubOptions}
                  </select>
                </label>
                <label>
                  Bắt đầu
                  <input type="datetime-local" name="start" required />
                </label>
                <label>
                  Kết thúc
                  <input type="datetime-local" name="end" required />
                </label>
                <button className="secondary">Kiểm tra chỗ</button>
              </fieldset>
            </form>
          </details>
        )}
        <h3>Xe đã đăng ký</h3>
        {m.vehicles.length ? (
          <ul>
            {m.vehicles.map((v) => (
              <li key={v.id}>
                {v.code} — {vehicleTypes.find((t) => t.value === v.type)?.label}{" "}
                — pin {v.batteryPercent ?? "chưa rõ"}%
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty">Bạn chưa đăng ký xe.</p>
        )}
      </section>
      <section
        className="mobility-region mobility-history"
        aria-label="Lịch đỗ và yêu cầu sạc"
      >
        <h3>Lịch đỗ của tôi</h3>
        {!m.bookings.length && <p className="empty">Chưa có lịch đỗ.</p>}
        <ScrollableHistory label="Lịch đỗ của tôi" count={m.bookings.length}>
          {m.bookings.map((b) => (
            <article key={b.id}>
              <strong>
                {b.vehicleCode} · {b.hubName} · {b.spaceCode}
              </strong>
              <p>
                {formatTime(b.startsAt)} → {formatTime(b.endsAt)}
              </p>
              <p>{parkingLabels[b.status]}</p>
              <div className="mobility-actions">
                {b.status === "reserved" && (
                  <>
                    <button
                      className="secondary"
                      disabled={m.busy}
                      onClick={() => m.transition(b.id, "cancel")}
                    >
                      Hủy lịch
                    </button>
                    <button
                      className="primary"
                      disabled={m.busy}
                      onClick={() => m.transition(b.id, "check-in")}
                    >
                      Check-in
                    </button>
                  </>
                )}
                {b.status === "checked_in" && (
                  <button
                    className="primary"
                    disabled={m.busy}
                    onClick={() => m.transition(b.id, "check-out")}
                  >
                    Check-out
                  </button>
                )}
              </div>
            </article>
          ))}
        </ScrollableHistory>
        <h3>Yêu cầu sạc</h3>
        <p className="muted">
          Danh sách theo thời điểm gửi. Người vận hành phân bổ cổng và cập nhật
          phiên sạc cho xe cá nhân đủ điều kiện.
        </p>
        {!m.queue.length && <p className="empty">Chưa có yêu cầu sạc.</p>}
        <ScrollableHistory label="Yêu cầu sạc" count={m.queue.length}>
          {m.queue.map((q) => (
            <article key={q.id}>
              <strong>
                {q.vehicleCode} · {q.hubName}
              </strong>
              <p>
                Mục tiêu {q.targetBatteryPercent}% · {chargingLabels[q.status]}
              </p>
              <p>
                Gửi {formatTime(q.createdAt)}
                {q.requiredBy ? ` · Cần xe ${formatTime(q.requiredBy)}` : ""}
              </p>
            </article>
          ))}
        </ScrollableHistory>
      </section>
    </section>
  );
}
