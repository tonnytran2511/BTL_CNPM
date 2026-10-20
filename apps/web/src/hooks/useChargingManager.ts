import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import type { ChargingOverview, User } from "@emobility/contracts";
import { chargingApi } from "../api/charging";
import { RequestError } from "../api/client";
export function useChargingManager(
  user: User | null,
  onChanged: () => Promise<void>,
) {
  const [data, setData] = useState<ChargingOverview>({
    queue: [],
    sessions: [],
  });
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const epoch = useRef(0);
  const running = useRef(false);
  const pending = useRef<{ payload: string; key: string } | null>(null);
  useEffect(() => {
    epoch.current++;
    running.current = false;
    pending.current = null;
    setData({ queue: [], sessions: [] });
    setError("");
    setMessage("");
    setBusy(false);
    setLoading(false);
    if (user?.role !== "operator") return;
    const controller = new AbortController();
    setLoading(true);
    void chargingApi
      .overview(controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setData(value);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => {
      controller.abort();
      epoch.current++;
    };
  }, [user?.id, user?.role]);
  const run = async (
    payload: unknown,
    work: (key: string) => Promise<unknown>,
    success: string,
  ) => {
    if (user?.role !== "operator" || running.current) return;
    running.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    const current = epoch.current;
    const text = JSON.stringify(payload);
    if (pending.current?.payload !== text)
      pending.current = { payload: text, key: crypto.randomUUID() };
    try {
      await work(pending.current.key);
      if (current !== epoch.current) return;
      pending.current = null;
      setMessage(success);
      const result = await chargingApi.overview();
      if (current !== epoch.current) return;
      setData(result);
      await onChanged();
    } catch (e) {
      if (current !== epoch.current) return;
      if (e instanceof RequestError && e.status >= 400 && e.status < 500)
        pending.current = null;
      setError(e instanceof Error ? e.message : "Không thể xử lý yêu cầu.");
    } finally {
      if (current === epoch.current) {
        running.current = false;
        setBusy(false);
      }
    }
  };
  const schedule = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const hub = String(new FormData(e.currentTarget).get("hub") ?? "");
    void run(
      ["schedule", hub],
      (key) => chargingApi.schedule(hub, key),
      "Đã phân bổ các cổng còn trống theo thứ tự ưu tiên.",
    );
  };
  const action = (id: string, action: string, battery?: number) =>
    void run(
      [id, action, battery ?? null],
      (key) => chargingApi.transition(id, action, battery, key),
      "Đã cập nhật phiên sạc.",
    );
  const submitSession = (e: FormEvent<HTMLFormElement>, id: string) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const button = (e.nativeEvent as SubmitEvent)
      .submitter as HTMLButtonElement | null;
    action(
      id,
      button?.value === "cancel" ? "cancel" : "complete",
      Number(form.get("battery")),
    );
  };
  const refresh = () =>
    void run(["refresh"], async () => {}, "Đã làm mới hàng chờ và phiên sạc.");
  return {
    data,
    error,
    message,
    busy,
    loading,
    schedule,
    action,
    submitSession,
    refresh,
  };
}
