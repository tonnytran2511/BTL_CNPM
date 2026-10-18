import { useEffect, useMemo, useState } from "react";
import type { VehicleSearchResult } from "@emobility/contracts";
import { api } from "../api/client";
import {
  emptyVehicleFilter,
  toSearchQuery,
  type VehicleFilterState,
} from "../models/vehicleFilter";

/** Loads rentable vehicles for the current filters; refetches on filter change and on each poll. */
export function useVehicleSearch(userId?: string, refreshKey?: string | null) {
  const [filter, setFilter] = useState<VehicleFilterState>(emptyVehicleFilter);
  const [result, setResult] = useState<VehicleSearchResult | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const query = useMemo(() => toSearchQuery(filter), [filter]);
  useEffect(() => {
    setFilter(emptyVehicleFilter);
    setResult(null);
    setError("");
  }, [userId]);
  useEffect(() => {
    if (!userId) return;
    const controller = new AbortController();
    setLoading(true);
    void api
      .vehicles(query, controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return;
        setResult(data);
        setError("");
      })
      .catch((e) => {
        if (!controller.signal.aborted)
          setError(e instanceof Error ? e.message : "Không thể tìm xe.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [query, userId, refreshKey]);
  return {
    filter,
    result,
    error,
    loading,
    setHubId: (hubId: string) => setFilter((f) => ({ ...f, hubId })),
    setType: (type: VehicleFilterState["type"]) =>
      setFilter((f) => ({ ...f, type })),
    setMinBattery: (minBattery: string) =>
      setFilter((f) => ({ ...f, minBattery })),
    reset: () => setFilter(emptyVehicleFilter),
  };
}
