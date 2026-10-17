import type { HubSummary } from "@emobility/contracts";
import type { useSimulation } from "../hooks/useSimulation";
import { SimulationPanel } from "../components/SimulationPanel";
import { SimulationGuide } from "../components/SimulationGuide";
import { useGuideDialog } from "../hooks/useGuideDialog";

interface Props {
  model: ReturnType<typeof useSimulation>;
  hubs: HubSummary[];
  error: string;
  loading: boolean;
  onRefresh: () => void;
}
export function SimulationPage(props: Props) {
  const guide = useGuideDialog();
  return (
    <>
      <section className="hero">
        <div>
          <p className="eyebrow">WHAT-IF SIMULATION</p>
          <h1>Nếu nhu cầu tăng thì sao?</h1>
          <p>So sánh khả năng phục vụ của một Hub trong hai mức nhu cầu.</p>
        </div>
        <button
          type="button"
          className="secondary"
          onClick={guide.open}
          aria-haspopup="dialog"
        >
          Hướng dẫn sử dụng
        </button>
      </section>
      {props.error && (
        <div className="notice error" role="alert">
          <p>{props.error}</p>
          <button className="secondary" onClick={props.onRefresh}>
            Tải lại danh sách Hub
          </button>
        </div>
      )}
      {props.loading && <p role="status">Đang tải danh sách Hub…</p>}
      <SimulationPanel model={props.model} hubs={props.hubs} />
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
