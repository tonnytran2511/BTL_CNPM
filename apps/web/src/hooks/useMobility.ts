import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import type {
  User,
  PrivateVehicle,
  ParkingBooking,
  ChargingQueueEntry,
  ElectricVehicleType,
} from "@emobility/contracts";
import { mobilityApi } from "../api/mobility";
import { RequestError } from "../api/client";
import type { MobilityStep } from "../models/mobility";
function text(form: FormData, key: string) {
  return String(form.get(key) ?? "");
}
function instant(form: FormData, key: string) {
  return new Date(text(form, key)).toISOString();
}
export function useMobility(user: User | null, onChanged: () => Promise<void>) {
  const [vehicles, setVehicles] = useState<PrivateVehicle[]>([]);
  const [bookings, setBookings] = useState<ParkingBooking[]>([]);
  const [queue, setQueue] = useState<ChargingQueueEntry[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<MobilityStep>("vehicle");
  const inFlight = useRef(false);
  const generation = useRef(0);
  const pending = useRef<{ payload: string; key: string } | null>(null);
  const load = useCallback(
    async (signal?: AbortSignal) => {
      if (!user) return;
      const current = generation.current;
      const [v, b, q] = await Promise.all([
        mobilityApi.vehicles(signal),
        mobilityApi.bookings(signal),
        mobilityApi.queue(signal),
      ]);
      if (signal?.aborted || current !== generation.current) return;
      setVehicles(v);
      setBookings(b);
      setQueue(q);
    },
    [user?.id],
  );
  useEffect(() => {
    generation.current++;
    pending.current = null;
    inFlight.current = false;
    setVehicles([]);
    setBookings([]);
    setQueue([]);
    setError("");
    setMessage("");
    setBusy(false);
    setStep("vehicle");
    if (!user) return;
    const controller = new AbortController();
    setLoading(true);
    void load(controller.signal)
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => {
      controller.abort();
      generation.current++;
    };
  }, [user?.id, load]);
  const run = async (
    operation: string,
    body: unknown,
    work: (key: string) => Promise<unknown>,
    success: string,
    onSuccess?: (result: unknown) => void,
  ) => {
    if (!user || inFlight.current) return;
    const current = generation.current;
    inFlight.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    const payload = JSON.stringify([operation, body]);
    if (pending.current?.payload !== payload)
      pending.current = { payload, key: crypto.randomUUID() };
    try {
      const result = await work(pending.current.key);
      if (current !== generation.current) return;
      onSuccess?.(result);
      pending.current = null;
      if (success) setMessage(success);
      await load();
      await onChanged();
    } catch (e) {
      if (current !== generation.current) return;
      if (e instanceof RequestError && e.status >= 400 && e.status < 500)
        pending.current = null;
      setError(e instanceof Error ? e.message : "Không thể xử lý yêu cầu.");
    } finally {
      if (current === generation.current) {
        inFlight.current = false;
        setBusy(false);
      }
    }
  };
  const formAction = (
    event: FormEvent<HTMLFormElement>,
    work: (form: FormData) => Promise<void>,
  ) => {
    event.preventDefault();
    try {
      void work(new FormData(event.currentTarget)).catch((e) =>
        setError(e.message),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Dữ liệu không hợp lệ.");
    }
  };
  const register = (event: FormEvent<HTMLFormElement>) =>
    formAction(event, async (form) => {
      const body = {
        code: text(form, "code"),
        type: text(form, "type") as ElectricVehicleType,
        batteryPercent: Number(text(form, "battery")),
      };
      await run(
        "register",
        body,
        (key) => mobilityApi.register(body, key),
        "Đã đăng ký xe.",
        (result) => {
          const vehicle = result as PrivateVehicle;
          setVehicles((current) => [
            ...current.filter((item) => item.id !== vehicle.id),
            vehicle,
          ]);
          setStep("choose");
        },
      );
    });
  const reserve = (event: FormEvent<HTMLFormElement>) =>
    formAction(event, async (form) => {
      const body = {
        hubId: text(form, "hub"),
        privateVehicleId: text(form, "vehicle"),
        startsAt: instant(form, "start"),
        endsAt: instant(form, "end"),
      };
      await run(
        "reserve",
        body,
        (key) => mobilityApi.reserve(body, key),
        "Đã đặt chỗ đỗ.",
      );
    });
  const checkAvailability = (event: FormEvent<HTMLFormElement>) =>
    formAction(event, async (form) => {
      const body = {
        hubId: text(form, "hub"),
        startsAt: instant(form, "start"),
        endsAt: instant(form, "end"),
      };
      await run(
        "availability",
        body,
        async () => {
          const result = await mobilityApi.availability(body);
          setMessage(
            `Còn ${result.available} chỗ phù hợp trong khoảng thời gian đã chọn.`,
          );
        },
        "",
      );
    });
  const charge = (event: FormEvent<HTMLFormElement>) =>
    formAction(event, async (form) => {
      const body = {
        hubId: text(form, "hub"),
        vehicle: { kind: "private" as const, id: text(form, "vehicle") },
        targetBatteryPercent: Number(text(form, "target")),
        requiredBy: text(form, "requiredBy")
          ? instant(form, "requiredBy")
          : undefined,
      };
      await run(
        "charge",
        body,
        (key) => mobilityApi.charge(body, key),
        "Yêu cầu sạc đã vào hàng chờ.",
      );
    });
  const transition = (id: string, action: string) =>
    void run(
      action,
      { id },
      (key) => mobilityApi.transition(id, action, key),
      "Đã cập nhật lịch đỗ.",
    );
  const refresh = () =>
    void run("refresh", {}, async () => {}, "Đã làm mới dữ liệu.");
  const selectStep = (next: MobilityStep) => {
    if (inFlight.current || loading) return;
    if (next !== "register" && next !== "vehicle" && !vehicles.length) {
      setMessage(
        "Bạn chưa có xe đăng ký. Hãy đăng ký xe trước khi chọn dịch vụ.",
      );
      setError("");
      setStep("register");
      return;
    }
    setError("");
    setMessage("");
    setStep(next);
  };
  return {
    step,
    selectStep,
    vehicles,
    bookings,
    queue,
    error,
    message,
    loading,
    busy,
    register,
    reserve,
    charge,
    transition,
    refresh,
    checkAvailability,
  };
}
