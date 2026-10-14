import { useEffect, useState } from "react";
import type { HubDetail } from "@emobility/contracts";
import { api } from "../api/client";
export function useHubDetail(userId?: string, refreshKey?: string | null) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<HubDetail | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    setSelectedId(null);
    setDetail(null);
    setError("");
  }, [userId]);
  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      setError("");
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setDetail(null);
    setError("");
    void api
      .detail(selectedId, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setDetail(data);
      })
      .catch((e) => {
        if (!controller.signal.aborted)
          setError(e instanceof Error ? e.message : "Không thể tải Hub.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [selectedId, refreshKey, userId]);
  return {
    selectedId,
    detail,
    error,
    loading,
    open: setSelectedId,
    close: () => setSelectedId(null),
  };
}
