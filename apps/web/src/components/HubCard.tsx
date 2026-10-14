import type { HubSummary } from "@emobility/contracts";
import { formatNumber, statusLabel } from "../utils/format";
export function HubCard({
  hub,
  onOpen,
}: {
  hub: HubSummary;
  onOpen: (id: string) => void;
}) {
  return (
    <article className="hub-card">
      <div className="hub-card-top">
        <span className={`badge ${hub.status}`}>{statusLabel(hub.status)}</span>
        <span className="hub-symbol" aria-hidden="true">
          ↗
        </span>
      </div>
      <h3>{hub.name}</h3>
      <p className="muted">{hub.location}</p>
      <dl className="resources">
        <div>
          <dt>Xe sẵn sàng</dt>
          <dd>
            {formatNumber(hub.vehicles.available)}
            <small> / {formatNumber(hub.vehicles.total)}</small>
          </dd>
        </div>
        <div>
          <dt>Chỗ đỗ trống</dt>
          <dd>
            {formatNumber(hub.parking.available)}
            <small> / {formatNumber(hub.parking.capacity)}</small>
          </dd>
        </div>
        <div>
          <dt>Cổng sạc trống</dt>
          <dd>
            {formatNumber(hub.charging.available)}
            <small> / {formatNumber(hub.charging.total)}</small>
          </dd>
        </div>
      </dl>
      <div className="usage">
        <span>Mức sử dụng chỗ đỗ</span>
        <strong>{formatNumber(hub.utilizationPercent)}%</strong>
      </div>
      <progress
        aria-label={`Mức sử dụng chỗ đỗ ${hub.name}`}
        max={100}
        value={hub.utilizationPercent}
      />
      <div className="hub-footer">
        <span>
          {hub.charging.failed > 0
            ? `${formatNumber(hub.charging.failed)} cổng sạc có sự cố`
            : "Không có sự cố cổng sạc"}
        </span>
        <button className="text-button" onClick={() => onOpen(hub.id)}>
          Chi tiết ↗
        </button>
      </div>
    </article>
  );
}
