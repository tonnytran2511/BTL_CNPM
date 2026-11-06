import type { HubDetail } from "@emobility/contracts";
import type { HubEditForm, HubManagementModel } from "../models/hubManagement";

export function HubManagementPage({ model }: { model: HubManagementModel }) {
  return (
    <section className="hub-admin">
      <div className="hero">
        <div>
          <p className="eyebrow">OPERATOR / HUBS</p>
          <h1>Quản lý Hub và tài nguyên</h1>
          <p>Cấu hình thông tin Hub, số chỗ đỗ và cổng sạc.</p>
        </div>
        <button
          className="secondary"
          onClick={model.refresh}
          disabled={model.busy}
        >
          Làm mới ↻
        </button>
      </div>
      {model.error && (
        <p className="notice error" role="alert">
          {model.error}
        </p>
      )}
      <form className="hub-admin-create" onSubmit={model.submitCreate}>
        <h2>Tạo Hub</h2>
        <label>
          Mã Hub
          <input
            required
            maxLength={32}
            value={model.createForm.code}
            onChange={(event) =>
              model.changeCreateField("code", event.currentTarget.value)
            }
          />
        </label>
        <label>
          Tên Hub
          <input
            required
            maxLength={120}
            value={model.createForm.name}
            onChange={(event) =>
              model.changeCreateField("name", event.currentTarget.value)
            }
          />
        </label>
        <label>
          Vị trí
          <input
            required
            maxLength={240}
            value={model.createForm.location}
            onChange={(event) =>
              model.changeCreateField("location", event.currentTarget.value)
            }
          />
        </label>
        <button className="primary" disabled={model.busy}>
          Tạo Hub
        </button>
      </form>
      {model.hubs.map((hub) => (
        <HubEditor key={hub.id} hub={hub} model={model} />
      ))}
      {!model.hubs.length && !model.error && <p role="status">Đang tải Hub…</p>}
    </section>
  );
}

function HubEditor({
  hub,
  model,
}: {
  hub: HubDetail;
  model: HubManagementModel;
}) {
  const form = model.editForms[hub.id];
  if (!form) return null;

  return (
    <article className="hub-admin-card">
      <form onSubmit={(event) => model.submitUpdate(hub.id, event)}>
        <div className="hub-admin-title-row">
          <h2>{hub.name}</h2>
          <div className="hub-admin-title-actions">
            <button type="submit" className="text-button" disabled={model.busy}>
              Lưu thông tin
            </button>
            <button
              type="button"
              className="text-button hub-admin-delete-action"
              disabled={model.busy}
              onClick={() => model.removeHub(hub.id)}
            >
              Xóa Hub
            </button>
          </div>
        </div>
        <label>
          Tên Hub
          <input
            required
            value={form.name}
            onChange={(event) =>
              model.changeHubField(hub.id, "name", event.currentTarget.value)
            }
          />
        </label>
        <label>
          Vị trí
          <input
            required
            value={form.location}
            onChange={(event) =>
              model.changeHubField(
                hub.id,
                "location",
                event.currentTarget.value,
              )
            }
          />
        </label>
        <label>
          Trạng thái
          <select
            value={form.status}
            onChange={(event) =>
              model.changeHubField(
                hub.id,
                "status",
                event.currentTarget.value as HubEditForm["status"],
              )
            }
          >
            <option value="active">Đang hoạt động</option>
            <option value="inactive">Ngừng hoạt động</option>
          </select>
        </label>
      </form>
      <div className="hub-admin-resource-column">
        <form onSubmit={(event) => model.submitCapacity(hub.id, event)}>
          <div className="hub-admin-resource-heading">
            <h3>Chỗ đỗ</h3>
            <p className="hub-admin-resource-value">
              {hub.parking.occupied} đang có xe · {hub.parking.held} đang được
              giữ
            </p>
          </div>
          <div className="hub-admin-field">
            <div className="hub-admin-field-title">
              <label htmlFor={`hub-capacity-${hub.id}`}>Sức chứa</label>
              <button
                type="submit"
                className="text-button"
                disabled={model.busy}
              >
                Cập nhật sức chứa
              </button>
            </div>
            <input
              id={`hub-capacity-${hub.id}`}
              type="number"
              min="0"
              required
              value={form.capacity}
              onChange={(event) =>
                model.changeHubField(
                  hub.id,
                  "capacity",
                  event.currentTarget.value,
                )
              }
            />
          </div>
        </form>
        <form onSubmit={(event) => model.submitChargingPoint(hub.id, event)}>
          <div className="hub-admin-field">
            <div className="hub-admin-field-title">
              <label htmlFor={`hub-charging-point-${hub.id}`}>
                Mã cổng sạc
              </label>
              <button
                type="submit"
                className="text-button"
                disabled={model.busy}
              >
                Thêm cổng sạc
              </button>
            </div>
            <input
              id={`hub-charging-point-${hub.id}`}
              required
              maxLength={32}
              value={form.chargingPointCode}
              onChange={(event) =>
                model.changeHubField(
                  hub.id,
                  "chargingPointCode",
                  event.currentTarget.value,
                )
              }
            />
          </div>
        </form>
      </div>
      <div className="hub-admin-charging-points">
        <h3>Cổng sạc</h3>
        <ul className="hub-admin-resource-list">
          {hub.chargingPoints.map((point) => (
            <li key={point.id}>
              {point.code} · {point.status}
              <button
                type="button"
                className="text-button"
                disabled={model.busy}
                onClick={() => model.removeChargingPoint(hub.id, point.id)}
              >
                Xóa
              </button>
            </li>
          ))}
        </ul>
      </div>
    </article>
  );
}
