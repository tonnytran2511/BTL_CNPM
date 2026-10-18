import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { api } from "../api/client";
import { useReservations } from "./useReservations";

vi.mock("../api/client", () => ({
  api: {
    reservations: vi.fn(),
    reserveVehicle: vi.fn(),
    cancelReservation: vi.fn(),
  },
}));
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.reservations).mockResolvedValue([]);
});
afterEach(cleanup);

it("old-user mutation cannot lock or set errors in the next session", async () => {
  let rejectOld!: (error: Error) => void;
  vi.mocked(api.reserveVehicle).mockImplementationOnce(
    () =>
      new Promise((_, reject) => {
        rejectOld = reject;
      }),
  );
  const { result, rerender } = renderHook(({ user }) => useReservations(user), {
    initialProps: { user: "first" },
  });
  await act(async () => {});
  let old!: Promise<boolean>;
  act(() => {
    old = result.current.reserve("old-vehicle");
  });
  expect(result.current.busyId).toBe("old-vehicle");
  rerender({ user: "second" });
  await act(async () => {});
  expect(result.current.busyId).toBeNull();
  await act(async () => {
    rejectOld(new Error("old session failed"));
    expect(await old).toBe(false);
  });
  expect(result.current.reserveError).toBe("");
  expect(result.current.busyId).toBeNull();
  vi.mocked(api.reserveVehicle).mockResolvedValueOnce({} as never);
  await act(async () => {
    expect(await result.current.reserve("new-vehicle")).toBe(true);
  });
  expect(api.reserveVehicle).toHaveBeenLastCalledWith("new-vehicle");
});

it("blocks duplicate submits and reloads reservations after a conflict", async () => {
  let reject!: (error: Error) => void;
  vi.mocked(api.reserveVehicle).mockImplementation(
    () =>
      new Promise((_, fail) => {
        reject = fail;
      }),
  );
  const { result } = renderHook(() => useReservations("student"));
  await act(async () => {});
  let first!: Promise<boolean>;
  act(() => {
    first = result.current.reserve("vehicle");
  });
  await act(async () => {
    expect(await result.current.reserve("vehicle")).toBe(false);
  });
  expect(api.reserveVehicle).toHaveBeenCalledTimes(1);
  await act(async () => {
    reject(new Error("already reserved"));
    await first;
  });
  expect(result.current.reserveError).toBe("already reserved");
  expect(result.current.busyId).toBeNull();
  expect(api.reservations).toHaveBeenCalledTimes(2);
});
