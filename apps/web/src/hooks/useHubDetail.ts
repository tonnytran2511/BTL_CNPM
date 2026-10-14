import { useCallback, useEffect, useRef, useState } from "react";
import type { HubDetail } from "@emobility/contracts";
import { api, RequestError } from "../api/client";

export function useHubDetail(
  userId?: string,
  refreshKey?: string | null,
  onSessionExpired?: () => void,
) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<HubDetail | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const refresh = useRef<(() => void) | null>(null);

  useEffect(() => {
    setSelectedId(null);
    setDetail(null);
    setError("");
  }, [userId]);

  useEffect(() => {
    setDetail(null);
    setError("");
    setLoading(false);
    if (!selectedId || !userId) return;
    let active: AbortController | null = null;
    let disposed = false;
    const load = async () => {
      // A slow detail request may span several dashboard polls. Let it finish.
      if (disposed || active) return;
      const controller = new AbortController();
      active = controller;
      setLoading(true);
      try {
        const next = await api.detail(selectedId, controller.signal);
        if (disposed || controller.signal.aborted) return;
        setDetail(next);
        setError("");
      } catch (e) {
        if (disposed || controller.signal.aborted) return;
        if (e instanceof RequestError && e.status === 401) {
          onSessionExpired?.();
          setDetail(null);
        }
        // An unavailable/inaccessible Hub must not keep stale resource details.
        if (e instanceof RequestError && [403, 404].includes(e.status))
          setDetail(null);
        setError(e instanceof Error ? e.message : "Không thể tải Hub.");
      } finally {
        if (!disposed) {
          active = null;
          setLoading(false);
        }
      }
    };
    refresh.current = () => void load();
    void load();
    return () => {
      disposed = true;
      active?.abort();
      refresh.current = null;
    };
  }, [selectedId, userId, onSessionExpired]);

  useEffect(() => {
    refresh.current?.();
  }, [refreshKey]);

  const retry = useCallback(() => refresh.current?.(), []);
  return {
    selectedId,
    detail,
    error,
    loading,
    retry,
    open: setSelectedId,
    close: () => setSelectedId(null),
  };
}
