import { useState } from "react";
import type { VehicleReservationView } from "@emobility/contracts";
import { minutesLeft, reservationStatusLabel } from "../models/reservation";
import { formatDateTime, formatNumber, statusLabel } from "../utils/format";
import "./ReservationList.css";

interface Props {
  active: VehicleReservationView[];
  history: VehicleReservationView[];
  loaded: boolean;
  loading: boolean;
  error: string;
  cancelError: string;
  busyId: string | null;
  now: number;
  onCancel: (reservationId: string) => void;
}

function Item({
  item,
  now,
  busyId,
  confirming,
  onAsk,
  onDismiss,
  onCancel,
}: {
  item: VehicleReservationView;
  now: number;
  busyId: string | null;
  confirming: boolean;
  onAsk: () => void;
  onDismiss: () => void;
  onCancel: () => void;
}) {
  const isActive = item.status === "active";
  const left = minutesLeft(item.expiresAt, now);
  const busy = busyId === item.id;
  return (
    <li className={`reservation-item ${item.status}`}>
      <div>
        <strong>{item.vehicle.code}</strong>
        <small>
          {statusLabel(item.vehicle.type)} · Pin{" "}
          {formatNumber(item.vehicle.batteryPercent)}%
        </small>
      </div>
      <div>
        <span>{item.hub.name}</span>
        <small>{item.hub.location}</small>
      </div>
      <div>
        {isActive ? (
          <>
            <span>Giữ đến {formatDateTime(item.expiresAt)}</span>
            <small className={left <= 0 ? "overdue" : undefined}>
              {left > 0
                ? `Còn ${formatNumber(left)} phút`
                : "Đã quá hạn giữ xe"}
            </small>
          </>
        ) : (
          <>
            <span>Đặt lúc {formatDateTime(item.createdAt)}</span>
            {item.closedAt && (
              <small>Kết thúc {formatDateTime(item.closedAt)}</small>
            )}
          </>
        )}
      </div>
      <div className="reservation-actions">
        <span className={`badge ${item.status}`}>
          {reservationStatusLabel[item.status]}
        </span>
        {isActive &&
          (confirming ? (
            <span className="reservation-confirm">
              <button
                type="button"
                className="primary compact"
                disabled={busyId !== null}
                onClick={onCancel}
              >
                {busy ? "Đang hủy…" : "Xác nhận hủy"}
              </button>
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={onDismiss}
              >
                Giữ xe
              </button>
            </span>
          ) : (
            <button
              type="button"
              className="secondary"
              disabled={busyId !== null}
              onClick={onAsk}
            >
              Hủy đặt xe
            </button>
          ))}
      </div>
    </li>
  );
}

export function ReservationList(props: Props) {
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const empty = props.loaded && !props.active.length && !props.history.length;
  const row = (item: VehicleReservationView) => (
    <Item
      key={item.id}
      item={item}
      now={props.now}
      busyId={props.busyId}
      confirming={confirmId === item.id}
      onAsk={() => setConfirmId(item.id)}
      onDismiss={() => setConfirmId(null)}
      onCancel={() => {
        setConfirmId(null);
        props.onCancel(item.id);
      }}
    />
  );
  return (
    <section className="reservations" aria-label="Đặt xe của tôi">
      <div className="section-heading">
        <div>
          <p className="eyebrow">ĐẶT XE</p>
          <h2>Đặt xe của tôi</h2>
        </div>
        <span className="muted">
          {props.loaded
            ? `${formatNumber(props.active.length)} xe đang giữ`
            : ""}
        </span>
      </div>
      {props.error && (
        <p className="notice error" role="alert">
          {props.error}
        </p>
      )}
      {props.cancelError && (
        <p className="notice error" role="alert">
          {props.cancelError}
        </p>
      )}
      {props.loading && !props.loaded && (
        <p role="status">Đang tải lượt đặt xe…</p>
      )}
      {empty && !props.error && (
        <p className="empty">
          Bạn chưa đặt xe nào. Chọn một xe ở phần “Tìm xe còn trống” và bấm “Đặt
          xe”.
        </p>
      )}
      {props.active.length > 0 && (
        <ul className="reservation-list">{props.active.map(row)}</ul>
      )}
      {props.history.length > 0 && (
        <>
          <h3 className="reservation-history-title">Lịch sử</h3>
          <ul className="reservation-list">{props.history.map(row)}</ul>
        </>
      )}
    </section>
  );
}
