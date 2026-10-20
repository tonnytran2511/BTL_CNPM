import type { HubSuggestion, HubSummary, TripView } from "@emobility/contracts";
import { formatDateTime, formatNumber, statusLabel } from "../utils/format";
import "./TripPanel.css";

interface Props {
  hubs: HubSummary[];
  active: TripView[];
  history: TripView[];
  loaded: boolean;
  loading: boolean;
  error: string;
  returnError: string;
  suggestions: HubSuggestion[];
  suggestionTripId: string | null;
  busyId: string | null;
  onReturn: (tripId: string, targetHubId: string) => void;
  targets: Record<string, string>;
  onTarget: (tripId: string, hubId: string) => void;
}

export function TripPanel(props: Props) {
  const activeHubs = props.hubs.filter((hub) => hub.status === "active");
  const empty = props.loaded && !props.active.length && !props.history.length;
  return (
    <section className="trips" aria-label="Chuyến thuê của tôi">
      <div className="section-heading">
        <div>
          <p className="eyebrow">CHUYẾN THUÊ</p>
          <h2>Chuyến thuê của tôi</h2>
        </div>
        <span className="muted">
          {props.loaded
            ? props.active.length
              ? `Đang thuê ${formatNumber(props.active.length)} xe`
              : "Không có chuyến đang chạy"
            : ""}
        </span>
      </div>
      {props.error && (
        <p className="notice error" role="alert">
          {props.error}
        </p>
      )}
      {props.loading && !props.loaded && (
        <p role="status">Đang tải chuyến thuê…</p>
      )}
      {empty && !props.error && (
        <p className="empty">
          Chưa có chuyến thuê nào. Đặt xe rồi bấm “Nhận xe” ở phần “Đặt xe của
          tôi”.
        </p>
      )}
      {props.active.map((current) => (
        <div className="trip-current" key={current.id}>
          <div>
            <strong>{current.vehicle.code}</strong>
            <small>{statusLabel(current.vehicle.type)}</small>
          </div>
          <div>
            <span>Nhận tại {current.sourceHub.name}</span>
            <small>
              Từ {formatDateTime(current.startedAt)} · Pin lúc nhận{" "}
              {formatNumber(current.startBatteryPercent)}%
            </small>
          </div>
          <div className="trip-return">
            <label>
              Trả xe tại Hub
              <select
                value={props.targets[current.id] ?? ""}
                disabled={props.busyId !== null}
                onChange={(event) =>
                  props.onTarget(current.id, event.target.value)
                }
              >
                <option value="">Chọn Hub trả xe</option>
                {activeHubs.map((hub) => (
                  <option key={hub.id} value={hub.id}>
                    {hub.name} (còn {formatNumber(hub.parking.available)} chỗ)
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="primary compact"
              disabled={!props.targets[current.id] || props.busyId !== null}
              onClick={() =>
                props.onReturn(current.id, props.targets[current.id])
              }
            >
              {props.busyId === current.id ? "Đang trả xe…" : "Trả xe"}
            </button>
          </div>
        </div>
      ))}
      {props.returnError && (
        <div className="notice error" role="alert">
          <p>{props.returnError}</p>
          {props.suggestions.length > 0 && (
            <>
              <p>Hub khác còn chỗ:</p>
              <ul className="trip-suggestions">
                {props.suggestions.map((hub) => (
                  <li key={hub.id}>
                    <button
                      type="button"
                      className="secondary"
                      disabled={
                        props.busyId !== null || !props.suggestionTripId
                      }
                      onClick={() =>
                        props.suggestionTripId &&
                        props.onTarget(props.suggestionTripId, hub.id)
                      }
                    >
                      {hub.name} · còn {formatNumber(hub.freeSpaces)} chỗ
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
      {props.history.length > 0 && (
        <>
          <h3 className="trip-history-title">Lịch sử chuyến</h3>
          <ul className="trip-list">
            {props.history.map((trip) => (
              <li key={trip.id} className="trip-item">
                <div>
                  <strong>{trip.vehicle.code}</strong>
                  <small>{statusLabel(trip.vehicle.type)}</small>
                </div>
                <div>
                  <span>
                    {trip.sourceHub.name} → {trip.targetHub?.name ?? "—"}
                  </span>
                  <small>
                    {formatDateTime(trip.startedAt)}
                    {trip.endedAt ? ` – ${formatDateTime(trip.endedAt)}` : ""}
                  </small>
                </div>
                <div>
                  <span>
                    Pin {formatNumber(trip.startBatteryPercent)}% →{" "}
                    {trip.endBatteryPercent === null
                      ? "—"
                      : `${formatNumber(trip.endBatteryPercent)}%`}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
