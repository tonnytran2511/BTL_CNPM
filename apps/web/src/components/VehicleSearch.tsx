import type { HubSummary, VehicleSearchResult } from "@emobility/contracts";
import {
  vehicleTypeOptions,
  type VehicleFilterState,
} from "../models/vehicleFilter";
import { formatNumber, statusLabel } from "../utils/format";

interface Props {
  hubs: HubSummary[];
  filter: VehicleFilterState;
  result: VehicleSearchResult | null;
  loading: boolean;
  error: string;
  onHub: (id: string) => void;
  onType: (type: VehicleFilterState["type"]) => void;
  onMinBattery: (value: string) => void;
  onReset: () => void;
  onReserve: (vehicleId: string) => void;
  busyId: string | null;
  reserveError: string;
}
export function VehicleSearch(props: Props) {
  const { filter, result } = props;
  return (
    <section className="vehicle-search" aria-label="Tìm xe">
      <div className="section-heading">
        <div>
          <p className="eyebrow">THUÊ XE</p>
          <h2>Tìm xe còn trống</h2>
        </div>
        <span className="muted">
          {result ? `${formatNumber(result.vehicles.length)} xe phù hợp` : ""}
        </span>
      </div>
      <div className="filter-bar">
        <label>
          Hub
          <select
            value={filter.hubId}
            onChange={(e) => props.onHub(e.target.value)}
          >
            <option value="">Tất cả Hub</option>
            {props.hubs.map((hub) => (
              <option key={hub.id} value={hub.id}>
                {hub.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Loại xe
          <select
            value={filter.type}
            onChange={(e) =>
              props.onType(e.target.value as VehicleFilterState["type"])
            }
          >
            <option value="">Tất cả loại</option>
            {vehicleTypeOptions.map((type) => (
              <option key={type} value={type}>
                {statusLabel(type)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Pin tối thiểu (%)
          <input
            type="number"
            inputMode="numeric"
            min={result?.minimumBatteryPercent ?? 0}
            max={100}
            placeholder={result ? `≥ ${result.minimumBatteryPercent}` : ""}
            value={filter.minBattery}
            onChange={(e) => props.onMinBattery(e.target.value)}
          />
        </label>
        <button className="secondary" onClick={props.onReset}>
          Xóa bộ lọc
        </button>
      </div>
      {props.error && (
        <p className="notice error" role="alert">
          {props.error}
        </p>
      )}
      {props.reserveError && (
        <p className="notice error" role="alert">
          {props.reserveError}
        </p>
      )}
      {props.loading && !result && <p role="status">Đang tìm xe…</p>}
      {result && result.vehicles.length === 0 && !props.error && (
        <p className="empty">Không có xe phù hợp với bộ lọc hiện tại.</p>
      )}
      <ul className="vehicle-list">
        {result?.vehicles.map((vehicle) => (
          <li key={vehicle.id} className="vehicle-item">
            <div>
              <strong>{vehicle.code}</strong>
              <small>{statusLabel(vehicle.type)}</small>
            </div>
            <div>
              <span>{vehicle.hubName}</span>
              <small>{vehicle.hubLocation}</small>
            </div>
            <div>
              <span>Pin {formatNumber(vehicle.batteryPercent)}%</span>
              <progress
                aria-label={`Pin ${vehicle.code}`}
                max={100}
                value={vehicle.batteryPercent}
              />
            </div>
            <div className="vehicle-actions">
              <span className={`badge ${vehicle.status}`}>
                {statusLabel(vehicle.status)}
              </span>
              <button
                type="button"
                className="primary compact"
                disabled={props.busyId !== null}
                onClick={() => props.onReserve(vehicle.id)}
              >
                {props.busyId === vehicle.id ? "Đang đặt…" : "Đặt xe"}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
