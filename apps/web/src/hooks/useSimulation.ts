import { useEffect, useRef, useState, type FormEvent } from "react";
import type {
  DemandSimulationResult,
  SimulationLimits,
  User,
} from "@emobility/contracts";
import { simulationApi } from "../api/simulation";
import { emptySimulationForm, type SimulationForm } from "../models/simulation";
import { formatSimulationReport } from "../utils/simulationReport";
import { randomizeSimulationForm } from "../utils/randomSimulation";

export function useSimulation(user: User | null) {
  const [form, setForm] = useState<SimulationForm>(emptySimulationForm);
  const [limits, setLimits] = useState<SimulationLimits | null>(null);
  const [result, setResult] = useState<DemandSimulationResult | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => {
    setForm(emptySimulationForm);
    setResult(null);
    setLimits(null);
    setError("");
    setBusy(false);
    pending.current?.abort();
    pending.current = null;
    if (user?.role !== "operator") return;
    const controller = new AbortController();
    void simulationApi
      .config(controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setLimits(data);
      })
      .catch((e: unknown) => {
        if (!controller.signal.aborted)
          setError(
            e instanceof Error
              ? e.message
              : "Không thể tải cấu hình simulation.",
          );
      });
    return () => {
      controller.abort();
      pending.current?.abort();
    };
  }, [user?.id, user?.role, reload]);
  const run = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!limits || pending.current) return;
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const data = await simulationApi.run(
        {
          hubId: form.hubId,
          horizonMinutes: Number(form.horizonMinutes),
          stepMinutes: Number(form.stepMinutes),
          seed: Number(form.seed),
          baselineArrivalsPerStep: Number(form.baselineArrivalsPerStep),
          scenarioArrivalsPerStep: Number(form.scenarioArrivalsPerStep),
        },
        controller.signal,
      );
      if (!controller.signal.aborted) setResult(data);
    } catch (e) {
      if (!controller.signal.aborted)
        setError(e instanceof Error ? e.message : "Không thể chạy simulation.");
    } finally {
      if (pending.current === controller) pending.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  };
  return {
    form,
    limits,
    result,
    error,
    busy,
    run,
    clearResults: () => {
      if (pending.current) return;
      setResult(null);
      setError("");
    },
    randomize: () => {
      if (!limits || pending.current) return;
      const values = crypto.getRandomValues(new Uint32Array(5));
      const samples = Array.from(values, (n) => n / 4294967296);
      setForm((current) => randomizeSimulationForm(current, limits, samples));
      setError("");
    },
    saveReport: () => {
      if (!result) return;
      let url: string | undefined;
      let link: HTMLAnchorElement | undefined;
      try {
        const blob = new Blob(["\uFEFF", formatSimulationReport(result)], {
          type: "text/plain;charset=utf-8",
        });
        url = URL.createObjectURL(blob);
        link = document.createElement("a");
        link.href = url;
        link.download = `simulation-${result.hub.id}-${result.snapshotCapturedAt.replace(/[^0-9TZ]/g, "-")}.txt`;
        document.body.append(link);
        link.click();
      } catch {
        setError("Không thể tải báo cáo. Vui lòng thử lại.");
      } finally {
        link?.remove();
        if (url) {
          const objectUrl = url;
          window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
        }
      }
    },
    retry: () => setReload((n) => n + 1),
    change: (field: keyof SimulationForm, value: string) =>
      setForm((f) => ({ ...f, [field]: value })),
  };
}
