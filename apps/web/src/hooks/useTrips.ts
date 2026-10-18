import { useCallback, useEffect, useRef, useState } from "react";
import type { HubSuggestion, TripView } from "@emobility/contracts";
import { api, RequestError } from "../api/client";
import { splitTrips, suggestedHubsFrom } from "../models/trip";

/**
 * Nhận xe, chuyến hiện tại, trả xe và lịch sử chuyến của người dùng hiện tại (T08).
 * Không tự retry mutation: mỗi thao tác chỉ gửi một lần, nút bị khóa khi đang chạy.
 */
export function useTrips(userId?: string, refreshKey?: string | null) {
  const [items, setItems] = useState<TripView[] | null>(null);
  const [error, setError] = useState("");
  const [pickupError, setPickupError] = useState("");
  const [returnError, setReturnError] = useState("");
  const [suggestions, setSuggestions] = useState<HubSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const working = useRef(false);

  useEffect(() => {
    setItems(null);
    setError("");
    setPickupError("");
    setReturnError("");
    setSuggestions([]);
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    const controller = new AbortController();
    setLoading(true);
    void api
      .trips(controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return;
        setItems(data);
        setError("");
      })
      .catch((e) => {
        if (!controller.signal.aborted)
          setError(
            e instanceof Error ? e.message : "Không thể tải chuyến thuê.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [userId, refreshKey, version]);

  const run = useCallback(
    async (
      id: string,
      action: () => Promise<unknown>,
      fallback: string,
      onError: (e: unknown, message: string) => void,
    ) => {
      if (working.current) return;
      working.current = true;
      setBusyId(id);
      setPickupError("");
      setReturnError("");
      setSuggestions([]);
      try {
        await action();
      } catch (e) {
        onError(e, e instanceof Error ? e.message : fallback);
      } finally {
        working.current = false;
        setBusyId(null);
        setVersion((v) => v + 1); // dù thành công hay xung đột, đọc lại dữ liệu thật
      }
    },
    [],
  );

  return {
    ...splitTrips(items ?? []),
    loaded: items !== null,
    loading,
    error,
    pickupError,
    returnError,
    suggestions,
    busyId,
    pickup: (reservationId: string) =>
      run(
        reservationId,
        () => api.pickupReservation(reservationId),
        "Không thể nhận xe.",
        (_e, message) => setPickupError(message),
      ),
    returnVehicle: (tripId: string, targetHubId: string) =>
      run(
        tripId,
        () => api.returnTrip(tripId, targetHubId),
        "Không thể trả xe.",
        (e, message) => {
          setReturnError(message);
          if (e instanceof RequestError)
            setSuggestions(suggestedHubsFrom(e.details));
        },
      ),
  };
}
