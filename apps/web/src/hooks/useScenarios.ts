import { useEffect, useRef, useState, type FormEvent } from "react";
import type {
  HubDetail,
  SavedSimulation,
  ScenarioLimits,
  SimulationHistoryPage,
  User,
} from "@emobility/contracts";
import { scenariosApi } from "../api/scenarios";
import { api } from "../api/client";
import {
  initialScenarioForm,
  scenarioRequest,
  type ScenarioForm,
} from "../models/scenarios";
import { formatScenarioReport } from "../utils/scenarioReport";

export function useScenarios(user: User | null) {
  const [form, setForm] = useState<ScenarioForm>(initialScenarioForm);
  const [limits, setLimits] = useState<ScenarioLimits | null>(null);
  const [saved, setSaved] = useState<SavedSimulation | null>(null);
  const [history, setHistory] = useState<SimulationHistoryPage>({
    items: [],
    nextBefore: null,
  });
  const [detail, setDetail] = useState<HubDetail | null>(null);
  const [error, setError] = useState("");
  const [historyError, setHistoryError] = useState("");
  const [pointError, setPointError] = useState("");
  const [busy, setBusy] = useState(false);
  const [historyBusy, setHistoryBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const pending = useRef<AbortController | null>(null);
  const historyPending = useRef<AbortController | null>(null);
  const historyVersion = useRef(0);
  const generation = useRef(0);
  const retry = useRef<{ payload: string; key: string } | null>(null);
  useEffect(() => {
    const current = ++generation.current;
    const historyRequest = ++historyVersion.current;
    pending.current?.abort();
    pending.current = null;
    historyPending.current?.abort();
    historyPending.current = null;
    retry.current = null;
    setForm(initialScenarioForm);
    setSaved(null);
    setLimits(null);
    setHistory({ items: [], nextBefore: null });
    setError("");
    setHistoryError("");
    setBusy(false);
    setHistoryBusy(false);
    if (user?.role !== "operator") return;
    const controller = new AbortController();
    void scenariosApi
      .config(controller.signal)
      .then((data) => {
        if (!controller.signal.aborted && generation.current === current)
          setLimits(data);
      })
      .catch((e) => {
        if (!controller.signal.aborted && generation.current === current)
          setError(e instanceof Error ? e.message : "Không tải được cấu hình.");
      });
    void scenariosApi
      .history(undefined, controller.signal)
      .then((data) => {
        if (
          !controller.signal.aborted &&
          generation.current === current &&
          historyVersion.current === historyRequest
        )
          setHistory(data);
      })
      .catch((e) => {
        if (
          !controller.signal.aborted &&
          generation.current === current &&
          historyVersion.current === historyRequest
        )
          setHistoryError(
            e instanceof Error ? e.message : "Không tải được lịch sử.",
          );
      });
    return () => {
      controller.abort();
      pending.current?.abort();
      historyPending.current?.abort();
    };
  }, [user?.id, user?.role, reload]);
  useEffect(() => {
    setDetail(null);
    setPointError("");
    if (!form.hubId || user?.role !== "operator") return;
    const controller = new AbortController();
    void api
      .detail(form.hubId, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setDetail(data);
      })
      .catch((e) => {
        if (!controller.signal.aborted)
          setPointError(
            e instanceof Error ? e.message : "Không tải được cổng sạc.",
          );
      });
    return () => controller.abort();
  }, [form.hubId, user?.id, user?.role, reload]);
  const loadHistory = async (more = false) => {
    if (historyPending.current || user?.role !== "operator") return;
    const controller = new AbortController();
    historyPending.current = controller;
    const current = generation.current;
    const historyRequest = ++historyVersion.current;
    setHistoryBusy(true);
    setHistoryError("");
    try {
      const data = await scenariosApi.history(
        more ? (history.nextBefore ?? undefined) : undefined,
        controller.signal,
      );
      if (
        !controller.signal.aborted &&
        current === generation.current &&
        historyVersion.current === historyRequest
      )
        setHistory((previous) =>
          more
            ? {
                items: [
                  ...previous.items,
                  ...data.items.filter(
                    (item) => !previous.items.some((old) => old.id === item.id),
                  ),
                ],
                nextBefore: data.nextBefore,
              }
            : data,
        );
    } catch (e) {
      if (
        !controller.signal.aborted &&
        current === generation.current &&
        historyVersion.current === historyRequest
      )
        setHistoryError(
          e instanceof Error ? e.message : "Không tải được lịch sử.",
        );
    } finally {
      if (historyPending.current === controller) historyPending.current = null;
      if (current === generation.current && !controller.signal.aborted)
        setHistoryBusy(false);
    }
  };
  const operation = async (
    work: (signal: AbortSignal) => Promise<SavedSimulation>,
  ) => {
    if (pending.current || user?.role !== "operator") return false;
    const controller = new AbortController();
    pending.current = controller;
    const current = generation.current;
    setBusy(true);
    setError("");
    try {
      const data = await work(controller.signal);
      if (controller.signal.aborted || current !== generation.current)
        return false;
      setSaved(data);
      return true;
    } catch (e) {
      if (!controller.signal.aborted && current === generation.current)
        setError(e instanceof Error ? e.message : "Không tải được kết quả.");
      return false;
    } finally {
      if (pending.current === controller) pending.current = null;
      if (current === generation.current && !controller.signal.aborted)
        setBusy(false);
    }
  };
  return {
    form,
    limits,
    saved,
    history,
    detail,
    error,
    historyError,
    pointError,
    busy,
    historyBusy,
    retryConfig: () => setReload((value) => value + 1),
    change: <K extends keyof ScenarioForm>(field: K, value: ScenarioForm[K]) =>
      setForm((current) => ({
        ...current,
        [field]: value,
        ...(field === "hubId" ? { failedChargingPointIds: [] } : {}),
      })),
    togglePoint: (id: string) =>
      setForm((current) => ({
        ...current,
        failedChargingPointIds: current.failedChargingPointIds.includes(id)
          ? current.failedChargingPointIds.filter((point) => point !== id)
          : [...current.failedChargingPointIds, id],
      })),
    run: async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!limits || pending.current || user?.role !== "operator") return;
      const body = scenarioRequest(form),
        payload = JSON.stringify(body);
      if (retry.current?.payload !== payload)
        retry.current = { payload, key: crypto.randomUUID() };
      const key = retry.current.key,
        current = generation.current;
      if (await operation((signal) => scenariosApi.run(body, key, signal))) {
        if (current !== generation.current) return;
        retry.current = null;
        historyPending.current?.abort();
        historyPending.current = null;
        void loadHistory();
      }
    },
    open: (id: string) =>
      operation((signal) => scenariosApi.detail(id, signal)),
    refreshHistory: () => loadHistory(),
    moreHistory: () => loadHistory(true),
    clear: () => {
      if (!pending.current) {
        setSaved(null);
        setError("");
      }
    },
    download: () => {
      if (!saved) return;
      let url: string | undefined;
      const link = document.createElement("a");
      try {
        url = URL.createObjectURL(
          new Blob(["\uFEFF", formatScenarioReport(saved)], {
            type: "text/plain;charset=utf-8",
          }),
        );
        link.href = url;
        link.download = `simulation-${saved.id}.txt`;
        document.body.append(link);
        link.click();
      } catch {
        setError("Không tải được báo cáo. Vui lòng thử lại.");
      } finally {
        link.remove();
        if (url) {
          const revoke = url;
          window.setTimeout(() => URL.revokeObjectURL(revoke), 1000);
        }
      }
    },
  };
}
