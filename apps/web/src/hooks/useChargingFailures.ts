import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import type {
  ChargingFailureInput,
  ChargingPointFailureView,
  User,
} from "@emobility/contracts";
import { chargingFailureApi } from "../api/chargingFailure";
import { RequestError } from "../api/client";
export function useChargingFailures(
  user: User | null,
  onChanged: () => Promise<void>,
  refreshKey?: string | null,
) {
  const [points, setPoints] = useState<ChargingPointFailureView[]>([]),
    [selectedId, setSelectedId] = useState("");
  const [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(false);
  const epoch = useRef(0),
    version = useRef(0),
    running = useRef(false),
    pending = useRef<{ payload: string; key: string } | null>(null);
  useEffect(() => {
    epoch.current++;
    running.current = false;
    pending.current = null;
    setPoints([]);
    setSelectedId("");
    setError("");
    setMessage("");
    setBusy(false);
    setLoading(false);
    return () => {
      epoch.current++;
    };
  }, [user?.id, user?.role]);
  useEffect(() => {
    if (user?.role !== "operator") return;
    const controller = new AbortController(),
      current = epoch.current,
      request = ++version.current;
    setLoading(true);
    void chargingFailureApi
      .points(controller.signal)
      .then((data) => {
        if (
          !controller.signal.aborted &&
          current === epoch.current &&
          request === version.current
        )
          setPoints(data);
      })
      .catch((e) => {
        if (
          !controller.signal.aborted &&
          current === epoch.current &&
          request === version.current
        )
          setError(e instanceof Error ? e.message : "Không tải được cổng sạc.");
      })
      .finally(() => {
        if (!controller.signal.aborted && current === epoch.current)
          setLoading(false);
      });
    return () => controller.abort();
  }, [user?.id, user?.role, refreshKey]);
  const selected = points.find((p) => p.id === selectedId) ?? null;
  const run = async (
    payload: unknown,
    work: (key: string) => Promise<unknown>,
    success: string,
  ) => {
    if (user?.role !== "operator" || running.current) return;
    const current = epoch.current;
    running.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    const text = JSON.stringify(payload);
    if (pending.current?.payload !== text)
      pending.current = { payload: text, key: crypto.randomUUID() };
    try {
      await work(pending.current.key);
      if (current !== epoch.current) return;
      pending.current = null;
      setMessage(success);
      const request = ++version.current;
      const data = await chargingFailureApi.points();
      if (current !== epoch.current) return;
      if (request === version.current) setPoints(data);
      await onChanged();
    } catch (e) {
      if (current !== epoch.current) return;
      if (e instanceof RequestError && e.status >= 400 && e.status < 500)
        pending.current = null;
      setError(e instanceof Error ? e.message : "Không thể cập nhật cổng sạc.");
    } finally {
      if (current === epoch.current) {
        running.current = false;
        setBusy(false);
      }
    }
  };
  const report = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selected) return;
    // Reject submits from a stale form after the operator changes point/session.
    const submittedPointId = event.currentTarget.dataset.pointId;
    const submittedSessionId = event.currentTarget.dataset.sessionId;
    if (
      submittedPointId !== selected.id ||
      submittedSessionId !== (selected.sessionId ?? "")
    ) {
      setError("Cổng hoặc phiên sạc đã thay đổi. Vui lòng nhập lại thông tin.");
      return;
    }
    const form = new FormData(event.currentTarget),
      actual = String(form.get("battery") ?? "");
    if (
      selected.sessionStatus === "charging" &&
      (actual.trim() === "" || !Number.isFinite(Number(actual)))
    ) {
      setError("Vui lòng nhập pin thực tế cho đúng phiên sạc.");
      return;
    }
    const body: ChargingFailureInput = {
      description: String(form.get("description") ?? "").trim(),
      sessionId: selected.sessionId ?? undefined,
      achievedBatteryPercent:
        selected.sessionStatus === "charging" && actual !== ""
          ? Number(actual)
          : undefined,
    };
    const id = selected.id;
    void run(
      ["fail", id, body],
      (key) => chargingFailureApi.report(id, body, key),
      "Đã báo hỏng cổng. Phiên liên quan được gián đoạn; yêu cầu còn thiếu pin trở lại hàng chờ.",
    );
  };
  const recover = () => {
    if (!selected) return;
    const id = selected.id;
    void run(
      ["recover", id],
      (key) => chargingFailureApi.recover(id, key),
      "Đã xác nhận sửa xong. Cổng sạc có thể nhận phiên mới.",
    );
  };
  const refresh = () =>
    void run(["refresh"], async () => {}, "Đã làm mới cổng sạc.");
  return {
    points,
    selected,
    selectedId,
    setSelectedId,
    error,
    message,
    busy,
    loading,
    report,
    recover,
    refresh,
  };
}
