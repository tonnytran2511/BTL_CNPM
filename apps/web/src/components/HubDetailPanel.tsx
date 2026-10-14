import type { HubDetail } from "@emobility/contracts";
import { formatNumber, statusLabel } from "../utils/format";
interface Props {
  detail: HubDetail | null;
  loading: boolean;
  error: string;
  onClose: () => void;
}
export function HubDetailPanel({ detail, loading, error, onClose }: Props) {
  return (
    <section className="detail-panel" aria-label="Chi tiết Hub">
      <div className="section-heading">
        <div>
          <p className="eyebrow">THÔNG TIN TÀI NGUYÊN</p>
          <h2>{detail?.name ?? "Chi tiết Hub"}</h2>
        </div>
        <button className="secondary" onClick={onClose}>
          Đóng
        </button>
      </div>
      {loading && <p role="status">Đang tải tài nguyên…</p>}
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {detail && (
        <div className="detail-columns">
          <div>
            <h3>Phương tiện</h3>
            {detail.vehicleList.length === 0 ? (
              <p>Hub chưa có phương tiện.</p>
            ) : (
              <ul className="resource-list">
                {detail.vehicleList.map((vehicle) => (
                  <li key={vehicle.id}>
                    <div>
                      <strong>{vehicle.code}</strong>
                      <small>
                        {statusLabel(vehicle.type)} ·{" "}
                        {statusLabel(vehicle.status)}
                      </small>
                    </div>
                    <span>{formatNumber(vehicle.batteryPercent)}% pin</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h3>Cổng sạc</h3>
            {detail.chargingPoints.length === 0 ? (
              <p>Hub chưa có cổng sạc.</p>
            ) : (
              <ul className="resource-list">
                {detail.chargingPoints.map((point) => (
                  <li key={point.id}>
                    <strong>{point.code}</strong>
                    <span className={`badge ${point.status}`}>
                      {statusLabel(point.status)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="muted">
              Chỗ đang đỗ: {formatNumber(detail.parking.occupied)} · Chỗ đang
              giữ: {formatNumber(detail.parking.held)}
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
