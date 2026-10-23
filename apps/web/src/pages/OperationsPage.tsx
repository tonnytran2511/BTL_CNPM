import type {
  Incident,
  OperationLogEntry,
  Redistribution,
} from "@emobility/contracts";
import type { OperationsModel } from "../models/operations";
import {
  operationActionLabel,
  operationStatus,
  operationTime,
} from "../models/operations";

export function OperationsPage({ model }: { model: OperationsModel }) {
  return (
    <section className="operations-page">
      <div className="hero">
        <div>
          <p className="eyebrow">OPERATOR / OPERATIONS</p>
          <h1>Sự cố và điều chuyển</h1>
          <p>Theo dõi lệnh, xử lý sự cố và tra cứu lịch sử vận hành.</p>
        </div>
        <button
          className="secondary"
          onClick={model.refresh}
          disabled={model.loading || model.busy}
        >
          {model.loading ? "Đang cập nhật…" : "Làm mới ↻"}
        </button>
      </div>
      {model.error && (
        <p className="notice error" role="alert">
          {model.error}
        </p>
      )}

      <div className="operations-create-grid">
        <form className="operation-form" onSubmit={model.createIncident}>
          <h2>Ghi nhận sự cố</h2>
          <label>
            Loại tài nguyên
            <select
              value={model.incidentForm.resourceType}
              onChange={(event) => {
                const resourceType = event.currentTarget
                  .value as Incident["resourceType"];
                model.changeIncident("resourceType", resourceType);
              }}
            >
              <option value="vehicle">Xe</option>
              <option value="charging_point">Cổng sạc</option>
              <option value="hub">Hub</option>
            </select>
          </label>
          <label>
            Tài nguyên
            <select
              required
              value={model.incidentForm.resourceId}
              onChange={(event) =>
                model.changeIncident("resourceId", event.currentTarget.value)
              }
            >
              <option value="">Chọn tài nguyên</option>
              {model.incidentResources.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Mô tả
            <textarea
              required
              maxLength={2000}
              value={model.incidentForm.description}
              onChange={(event) =>
                model.changeIncident("description", event.currentTarget.value)
              }
            />
          </label>
          <button
            className="primary"
            disabled={model.busy || !model.incidentResources.length}
          >
            Ghi nhận
          </button>
        </form>

        <form className="operation-form" onSubmit={model.createRedistribution}>
          <h2>Tạo lệnh điều chuyển</h2>
          <label>
            Hub nguồn
            <select
              required
              value={model.redistributionForm.sourceHubId}
              onChange={(event) =>
                model.changeRedistribution("sourceHubId", event.currentTarget.value)
              }
            >
              <option value="">Chọn Hub nguồn</option>
              {model.sourceHubs.map((hub) => (
                <option key={hub.id} value={hub.id}>
                  {hub.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Hub đích
            <select
              required
              value={model.redistributionForm.targetHubId}
              onChange={(event) =>
                model.changeRedistribution("targetHubId", event.currentTarget.value)
              }
            >
              <option value="">Chọn Hub đích</option>
              {model.targetHubs.map((hub) => (
                <option key={hub.id} value={hub.id}>
                  {hub.name}
                </option>
              ))}
            </select>
          </label>
          <fieldset>
            <legend>Xe available tại nguồn</legend>
            {model.availableVehicles.length ? (
              model.availableVehicles.map((vehicle) => (
                <label className="operation-checkbox" key={vehicle.id}>
                  <input
                    type="checkbox"
                    checked={model.redistributionForm.vehicleIds.includes(
                      vehicle.id,
                    )}
                    onChange={() => model.toggleVehicle(vehicle.id)}
                  />
                  {vehicle.code} · {vehicle.type}
                </label>
              ))
            ) : (
              <p className="muted">Chọn Hub nguồn có xe khả dụng.</p>
            )}
          </fieldset>
          <button
            className="primary"
            disabled={
              model.busy ||
              !model.redistributionForm.vehicleIds.length ||
              !model.redistributionForm.targetHubId
            }
          >
            Tạo lệnh
          </button>
        </form>
      </div>

      <section className="operations-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">WORK QUEUE</p>
            <h2>Lệnh điều chuyển</h2>
          </div>
        </div>
        {model.redistributions.length === 0 && !model.loading && (
          <p className="empty">Chưa có lệnh điều chuyển.</p>
        )}
        <div className="operation-list">
          {model.redistributions.map((order) => (
            <RedistributionCard key={order.id} order={order} model={model} />
          ))}
        </div>
      </section>

      <section className="operations-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">INCIDENTS</p>
            <h2>Sự cố</h2>
          </div>
        </div>
        {model.incidents.length === 0 && !model.loading && (
          <p className="empty">Chưa có sự cố.</p>
        )}
        <div className="operation-list">
          {model.incidents.map((incident) => (
            <IncidentCard key={incident.id} incident={incident} model={model} />
          ))}
        </div>
      </section>

      <section className="operations-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">AUDIT TRAIL</p>
            <h2>Lịch sử vận hành</h2>
          </div>
        </div>
        {model.log.length === 0 && !model.loading && (
          <p className="empty">Chưa có sự kiện vận hành.</p>
        )}
        <ol className="operation-log">
          {model.log.map((entry) => <LogEntry key={entry.id} entry={entry} />)}
        </ol>
      </section>
    </section>
  );
}

function RedistributionCard({
  order,
  model,
}: {
  order: Redistribution;
  model: OperationsModel;
}) {
  return (
    <article className="operation-card">
      <div>
        <h3>Lệnh {order.id}</h3>
        <p>
          {model.hubNames[order.sourceHubId] ?? order.sourceHubId} →{" "}
          {model.hubNames[order.targetHubId] ?? order.targetHubId}
        </p>
        <p>
          {order.vehicleIds.length} xe · Tạo bởi{" "}
          {model.actorNames[order.createdBy] ?? order.createdBy} ·{" "}
          {operationTime(order.createdAt)}
        </p>
        <p>
          Trạng thái: <strong>{operationStatus(order.status)}</strong>
        </p>
      </div>
      <div className="operation-actions">
        {order.status === "pending" && (
          <>
            <button
              className="primary"
              disabled={model.busy}
              onClick={() => void model.startRedistribution(order.id)}
            >
              Bắt đầu
            </button>
            <button
              className="secondary"
              disabled={model.busy}
              onClick={() => void model.cancelRedistribution(order.id)}
            >
              Hủy lệnh
            </button>
          </>
        )}
        {order.status === "in_progress" && (
          <button
            className="primary"
            disabled={model.busy}
            onClick={() => void model.completeRedistribution(order.id)}
          >
            Hoàn tất điều chuyển
          </button>
        )}
      </div>
    </article>
  );
}

function IncidentCard({
  incident,
  model,
}: {
  incident: Incident;
  model: OperationsModel;
}) {
  return (
    <article className="operation-card">
      <div>
        <h3>{incident.resourceType} · {incident.resourceId}</h3>
        <p>{incident.description}</p>
        <p>
          {operationStatus(incident.status)} · Báo bởi{" "}
          {model.actorNames[incident.reportedBy] ?? incident.reportedBy} ·{" "}
          {operationTime(incident.createdAt)}
        </p>
        {incident.resolvedAt && (
          <p>Đã xử lý lúc {operationTime(incident.resolvedAt)}</p>
        )}
      </div>
      {incident.status === "open" && (
        <button
          className="secondary"
          disabled={model.busy}
          onClick={() => void model.resolveIncident(incident.id)}
        >
          Đánh dấu đã xử lý
        </button>
      )}
    </article>
  );
}

function LogEntry({ entry }: { entry: OperationLogEntry }) {
  return (
    <li>
      <time dateTime={entry.occurredAt}>{operationTime(entry.occurredAt)}</time>
      <strong>
        {operationActionLabel(entry.action)} ·{" "}
        {entry.commandType === "incident" ? "Sự cố" : "Lệnh điều chuyển"}
      </strong>
      <span>
        {entry.fromStatus
          ? `${operationStatus(entry.fromStatus)} → `
          : ""}
        {operationStatus(entry.toStatus)}
      </span>
      <span>
        {entry.actorName} · ID {entry.commandId}
      </span>
    </li>
  );
}
