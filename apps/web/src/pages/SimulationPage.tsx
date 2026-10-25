import type { HubSummary } from "@emobility/contracts";
import type { useSimulation } from "../hooks/useSimulation";
import { SimulationPanel } from "../components/SimulationPanel";
import { SimulationGuide } from "../components/SimulationGuide";
import { useGuideDialog } from "../hooks/useGuideDialog";
import type { useScenarios } from "../hooks/useScenarios";
import { ScenarioPanel } from "../components/ScenarioPanel";
import { useSimulationView } from "../hooks/useSimulationView";

interface Props {
  scenarios: ReturnType<typeof useScenarios>;
  model: ReturnType<typeof useSimulation>;
  hubs: HubSummary[];
  error: string;
  loading: boolean;
  onRefresh: () => void;
}
export function SimulationPage(props: Props) {
  const guide = useGuideDialog();
  const simulation = useSimulationView();
  return (
    <>
      <section className="hero">
        <div>
          <p className="eyebrow">WHAT-IF SIMULATION</p>
          <h1>Điều gì xảy ra nếu…?</h1>
          <p>
            So sánh nhu cầu tăng, chỗ đỗ đầy và cổng sạc hỏng trên cùng dữ liệu
            ban đầu.
          </p>
        </div>
      </section>
      <label className="simulation-mode-picker">
        Chọn mô hình mô phỏng
        <select
          value={simulation.view}
          onChange={(event) => simulation.select(event.target.value)}
        >
          <option value="scenarios">Mô phỏng tình huống và lịch sử</option>
          <option value="legacy">Mô phỏng tăng nhu cầu (bản cơ bản)</option>
        </select>
      </label>
      {props.error && (
        <div className="notice error" role="alert">
          <p>{props.error}</p>
          <button className="secondary" onClick={props.onRefresh}>
            Tải lại danh sách Hub
          </button>
        </div>
      )}
      {props.loading && <p role="status">Đang tải danh sách Hub…</p>}
      {simulation.view === "scenarios" ? (
        <ScenarioPanel model={props.scenarios} hubs={props.hubs} />
      ) : (
        <SimulationPanel
          model={props.model}
          hubs={props.hubs}
          onOpenGuide={guide.open}
        />
      )}
      <dialog
        ref={guide.ref}
        className="simulation-guide-dialog"
        aria-labelledby="simulation-guide-title"
      >
        <div className="guide-dialog-actions">
          <button
            type="button"
            className="secondary"
            onClick={guide.close}
            autoFocus
          >
            Đóng hướng dẫn ×
          </button>
        </div>
        <SimulationGuide />
      </dialog>
    </>
  );
}
