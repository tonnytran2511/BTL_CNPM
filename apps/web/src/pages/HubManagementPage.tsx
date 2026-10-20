import { useState, type FormEvent } from "react";
import type { useHubManagement } from "../hooks/useHubManagement";
type Model = ReturnType<typeof useHubManagement>;
export function HubManagementPage({ model }: { model: Model }) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const create = (e: FormEvent) => {
    e.preventDefault();
    void model.create({ code, name, location }).then(() => {
      setCode("");
      setName("");
      setLocation("");
    });
  };
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
      <form className="hub-admin-create" onSubmit={create}>
        <h2>Tạo Hub</h2>
        <label>
          Mã Hub
          <input
            required
            maxLength={32}
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
        </label>
        <label>
          Tên Hub
          <input
            required
            maxLength={120}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label>
          Vị trí
          <input
            required
            maxLength={240}
            value={location}
            onChange={(e) => setLocation(e.target.value)}
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
  hub: Model["hubs"][number];
  model: Model;
}) {
  const [name, setName] = useState(hub.name);
  const [location, setLocation] = useState(hub.location);
  const [status, setStatus] = useState(hub.status);
  const [capacity, setCapacity] = useState(String(hub.parking.capacity));
  const [point, setPoint] = useState("");
  const save = (e: FormEvent) => {
    e.preventDefault();
    void model.update(hub.id, { name, location, status });
  };
  const changeCapacity = (e: FormEvent) => {
    e.preventDefault();
    void model.capacity(hub.id, Number(capacity));
  };
  return (
    <article className="hub-admin-card">
      <form onSubmit={save}>
        <h2>{hub.name}</h2>
        <label>
          Tên Hub
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label>
          Vị trí
          <input
            required
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          />
        </label>
        <label>
          Trạng thái
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as "active" | "inactive")}
          >
            <option value="active">Đang hoạt động</option>
            <option value="inactive">Ngừng hoạt động</option>
          </select>
        </label>
        <button className="secondary" disabled={model.busy}>
          Lưu thông tin
        </button>
        <button
          type="button"
          className="danger"
          disabled={model.busy}
          onClick={() => {
            if (
              window.confirm(
                `Xóa Hub ${hub.name}? Chỉ xóa được Hub chưa có dữ liệu liên quan.`,
              )
            )
              void model.remove(hub.id);
          }}
        >
          Xóa Hub
        </button>
      </form>
      <form onSubmit={changeCapacity}>
        <h3>Chỗ đỗ</h3>
        <p>
          {hub.parking.occupied} đang có xe · {hub.parking.held} đang được giữ
        </p>
        <label>
          Sức chứa
          <input
            type="number"
            min="0"
            required
            value={capacity}
            onChange={(e) => setCapacity(e.target.value)}
          />
        </label>
        <button className="secondary" disabled={model.busy}>
          Cập nhật sức chứa
        </button>
      </form>
      <div>
        <h3>Cổng sạc</h3>
        <ul>
          {hub.chargingPoints.map((p) => (
            <li key={p.id}>
              {p.code} · {p.status}
              <button
                type="button"
                className="text-button"
                disabled={model.busy}
                onClick={() => void model.removePoint(hub.id, p.id)}
              >
                Xóa
              </button>
            </li>
          ))}
        </ul>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void model.addPoint(hub.id, point).then(() => setPoint(""));
          }}
        >
          <label>
            Mã cổng sạc
            <input
              required
              maxLength={32}
              value={point}
              onChange={(e) => setPoint(e.target.value)}
            />
          </label>
          <button className="secondary" disabled={model.busy}>
            Thêm cổng sạc
          </button>
        </form>
      </div>
    </article>
  );
}
