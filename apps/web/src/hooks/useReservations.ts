import { useCallback, useEffect, useRef, useState } from "react";
import type { VehicleReservationView } from "@emobility/contracts";
import { api } from "../api/client";
import { splitReservations } from "../models/reservation";

/**
 * Lượt đặt xe của người dùng hiện tại, cùng thao tác đặt/hủy.
 * Không tự retry mutation (docs/api.md): mỗi thao tác chỉ gửi một lần, nút bị khóa khi đang chạy.
 */
export function useReservations(userId?: string, refreshKey?: string | null) {
  const [items, setItems] = useState<VehicleReservationView[] | null>(null);
  const [error, setError] = useState("");
  const [reserveError, setReserveError] = useState("");
  const [cancelError, setCancelError] = useState("");
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const working = useRef(false);

  useEffect(() => {
    setItems(null);
    setError("");
    setReserveError("");
    setCancelError("");
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    const controller = new AbortController();
    setLoading(true);
    void api
      .reservations(controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return;
        setItems(data);
        setError("");
      })
      .catch((e) => {
        if (!controller.signal.aborted)
          setError(
            e instanceof Error ? e.message : "Không thể tải lượt đặt xe.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [userId, refreshKey, version]);

  // Đồng hồ đếm ngược hạn giữ xe.
  useEffect(() => {
    if (!userId) return;
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, [userId]);

  const run = useCallback(
    async (
      id: string,
      action: () => Promise<unknown>,
      fallback: string,
      setFailure: (message: string) => void,
    ) => {
      if (working.current) return;
      working.current = true;
      setBusyId(id);
      setReserveError("");
      setCancelError("");
      try {
        await action();
      } catch (e) {
        setFailure(e instanceof Error ? e.message : fallback);
      } finally {
        working.current = false;
        setBusyId(null);
        setNow(Date.now());
        setVersion((v) => v + 1); // dù thành công hay xung đột, đọc lại dữ liệu thật
      }
    },
    [],
  );

  return {
    ...splitReservations(items ?? []),
    loaded: items !== null,
    loading,
    error,
    reserveError,
    cancelError,
    busyId,
    now,
    reserve: (vehicleId: string) =>
      run(
        vehicleId,
        () => api.reserveVehicle(vehicleId),
        "Không thể đặt xe.",
        setReserveError,
      ),
    cancel: (reservationId: string) =>
      run(
        reservationId,
        () => api.cancelReservation(reservationId),
        "Không thể hủy lượt đặt xe.",
        setCancelError,
      ),
  };
}
