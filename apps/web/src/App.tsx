import { useFoundation } from "./hooks/useFoundation";
import { useSimulation } from "./hooks/useSimulation";
import { SimulationPage } from "./pages/SimulationPage";
import { useAppPage } from "./hooks/useAppPage";
import { useHubDetail } from "./hooks/useHubDetail";
import { useRental } from "./hooks/useRental";
import { TripPanel } from "./components/TripPanel";
import { ReservationList } from "./components/ReservationList";
import { LoginForm } from "./components/LoginForm";
import { HubCard } from "./components/HubCard";
import { HubDetailPanel } from "./components/HubDetailPanel";
import { VehicleSearch } from "./components/VehicleSearch";
import { formatNumber, formatTime } from "./utils/format";
import { useMobility } from "./hooks/useMobility";
import { MobilityPanel } from "./components/MobilityPanel";
import { useHubManagement } from "./hooks/useHubManagement";
import { HubManagementPage } from "./pages/HubManagementPage";
import { useOperations } from "./hooks/useOperations";
import { OperationsPage } from "./pages/OperationsPage";
export function App() {
  const model = useFoundation();
  const simulation = useSimulation(model.user);
  const page = useAppPage(model.user?.role);
  const hubManagement = useHubManagement(
    model.user,
    model.user?.role === "operator" && page === "hub-management",
    model.sessionExpired,
    model.accessRevoked,
  );
  const operations = useOperations(
    model.user,
    model.user?.role === "operator" && page === "operations",
    model.config?.pollIntervalMs ?? 0,
    model.sessionExpired,
    model.accessRevoked,
  );
  const hub = useHubDetail(
    model.user?.id,
    model.updatedAt,
    model.sessionExpired,
  );
  const mobility = useMobility(model.user, model.refresh);
  const {
    vehicles,
    reservations,
    trips,
    tripTarget,
    reserve,
    cancel,
    pickup,
    giveBack,
    busyId,
  } = useRental(model.user?.id, model.updatedAt, model.refresh);
  if (model.booting)
    return (
      <main className="center-state" role="status">
        Đang kết nối mạng lưới…
      </main>
    );
  if (!model.config)
    return (
      <main className="center-state">
        <h1>Chưa thể kết nối</h1>
        <p role="alert">{model.error}</p>
        <button className="primary" onClick={model.retry}>
          Thử lại
        </button>
      </main>
    );
  if (!model.user)
    return (
      <LoginForm
        appName={model.config.appName}
        email={model.email}
        password={model.password}
        busy={model.busy}
        error={model.error}
        onEmail={model.setEmail}
        onPassword={model.setPassword}
        onSubmit={model.login}
      />
    );
  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#/">
          <span className="brand-mark" aria-hidden="true">
            ↗
          </span>
          <span>
            {model.config.appName}
            <small>ĐHQG–HCM · MOBILITY NETWORK</small>
          </span>
        </a>
        <div className="account">
          <span>
            <strong>{model.user.name}</strong>
            <small>{model.role}</small>
          </span>
          <button
            className="secondary"
            disabled={model.busy}
            onClick={model.logout}
          >
            Đăng xuất
          </button>
        </div>
      </header>
      <nav className="page-nav" aria-label="Điều hướng chính">
        <a href="#/" aria-current={page === "overview" ? "page" : undefined}>
          Tổng quan
        </a>
        {model.user.role === "operator" && (
          <>
            <a
              href="#/simulation"
              aria-current={page === "simulation" ? "page" : undefined}
            >
              Mô phỏng
            </a>
            <a
              href="#/hubs/manage"
              aria-current={page === "hub-management" ? "page" : undefined}
            >
              Quản lý Hub
            </a>
            <a
              href="#/operations"
              aria-current={page === "operations" ? "page" : undefined}
            >
              Vận hành
            </a>
          </>
        )}
      </nav>
      <main id="main" tabIndex={-1}>
        {page === "hub-management" ? (
          <HubManagementPage model={hubManagement} />
        ) : page === "operations" ? (
          <OperationsPage model={operations} />
        ) : page === "simulation" ? (
          <SimulationPage
            model={simulation}
            hubs={model.hubs}
            error={model.error}
            loading={!model.updatedAt && !model.error}
            onRefresh={model.refresh}
          />
        ) : (
          <>
            <section className="hero">
              <div>
                <p className="eyebrow">
                  {model.role.toUpperCase()} / MOBILITY HUBS
                </p>
                <h1>{model.heading}</h1>
                <p>
                  Theo dõi phương tiện, chỗ đỗ và khả năng sạc tại từng điểm.
                </p>
              </div>
              <div className="refresh-meta">
                <span>
                  {model.updatedAt
                    ? `Cập nhật ${formatTime(model.updatedAt)}`
                    : "Đang tải dữ liệu"}
                </span>
                <button
                  className="secondary"
                  onClick={model.refresh}
                  disabled={model.refreshing}
                >
                  {model.refreshing ? "Đang cập nhật…" : "Làm mới ↻"}
                </button>
              </div>
            </section>
            {model.error && (
              <p className="notice error" role="alert">
                {model.error}
                {model.updatedAt &&
                  " Dữ liệu hiển thị là lần cập nhật thành công gần nhất."}
              </p>
            )}
            <section className="stat-grid" aria-label="Chỉ số mạng lưới">
              {model.stats.map((stat) => (
                <article className="stat-card" key={stat.label}>
                  <p>{stat.label}</p>
                  <strong>
                    {model.updatedAt ? formatNumber(stat.value) : "—"}
                  </strong>
                  <small>{stat.hint}</small>
                </article>
              ))}
            </section>
            <section className="hubs-section">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">MẠNG LƯỚI</p>
                  <h2>Các Mobility Hub</h2>
                </div>
                <span className="muted">
                  {formatNumber(model.hubs.length)} điểm phục vụ
                </span>
              </div>
              {!model.updatedAt && !model.error && (
                <p role="status">Đang tải các Hub…</p>
              )}
              {model.updatedAt && model.hubs.length === 0 && (
                <p className="empty">Chưa có Hub để hiển thị.</p>
              )}
              <div className="hub-grid">
                {model.hubs.map((item) => (
                  <HubCard key={item.id} hub={item} onOpen={hub.open} />
                ))}
              </div>
            </section>
            <MobilityPanel model={mobility} hubs={model.hubs} />
            <VehicleSearch
              hubs={model.hubs}
              filter={vehicles.filter}
              result={vehicles.result}
              loading={vehicles.loading}
              error={vehicles.error}
              onHub={vehicles.setHubId}
              onType={vehicles.setType}
              onMinBattery={vehicles.setMinBattery}
              onReset={vehicles.reset}
              onReserve={reserve}
              busyId={busyId}
              reserveError={reservations.reserveError}
            />
            <ReservationList
              active={reservations.active}
              history={reservations.history}
              loaded={reservations.loaded}
              loading={reservations.loading}
              error={reservations.error}
              cancelError={reservations.cancelError}
              pickupError={trips.pickupError}
              busyId={busyId}
              now={reservations.now}
              onCancel={cancel}
              onPickup={pickup}
            />
            <TripPanel
              hubs={model.hubs}
              active={trips.active}
              history={trips.history}
              loaded={trips.loaded}
              loading={trips.loading}
              error={trips.error}
              returnError={trips.returnError}
              suggestions={trips.suggestions}
              suggestionTripId={trips.suggestionTripId}
              busyId={busyId}
              onReturn={giveBack}
              targets={tripTarget.targets}
              onTarget={tripTarget.select}
            />
            {hub.selectedId && (
              <HubDetailPanel
                detail={hub.detail}
                loading={hub.loading}
                error={hub.error}
                onClose={hub.close}
                onRetry={hub.retry}
              />
            )}
          </>
        )}
        <footer className="page-footer">
          <span>{model.config.appName}</span>
          <span>Di chuyển thuận tiện. Kết nối khu đô thị.</span>
        </footer>
      </main>
    </div>
  );
}
