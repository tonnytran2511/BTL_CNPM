import { useCallback, useEffect, useState } from "react";
import type { HubDetail } from "@emobility/contracts";
import { api } from "../api/client";

export function useHubManagement(enabled: boolean) {
  const [hubs, setHubs] = useState<HubDetail[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(async (signal?: AbortSignal) => {
    setError("");
    try {
      const summaries = await api.hubs(signal);
      const details = await Promise.all(
        summaries.map((h) => api.detail(h.id, signal)),
      );
      if (!signal?.aborted) setHubs(details);
    } catch (e) {
      if (!signal?.aborted)
        setError(
          e instanceof Error ? e.message : "Không thể tải danh sách Hub.",
        );
    }
  }, []);
  useEffect(() => {
    if (!enabled) return;
    const c = new AbortController();
    void refresh(c.signal);
    return () => c.abort();
  }, [enabled, refresh]);
  const mutate = async (work: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    try {
      await work();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Thao tác không thành công.");
    } finally {
      setBusy(false);
    }
  };
  return {
    hubs,
    error,
    busy,
    refresh: () => void refresh(),
    create: (input: { code: string; name: string; location: string }) =>
      mutate(() => api.createHub(input)),
    update: (
      id: string,
      input: { name: string; location: string; status: "active" | "inactive" },
    ) => mutate(() => api.updateHub(id, input)),
    remove: (id: string) => mutate(() => api.deleteHub(id)),
    capacity: (id: string, capacity: number) =>
      mutate(() => api.setParkingCapacity(id, capacity)),
    addPoint: (id: string, code: string) =>
      mutate(() => api.addChargingPoint(id, code)),
    removePoint: (id: string, pointId: string) =>
      mutate(() => api.removeChargingPoint(id, pointId)),
  };
}
