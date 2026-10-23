import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { TripView } from "@emobility/contracts";
import { api, RequestError } from "../api/client";
import { useTrips } from "./useTrips";
import { useTripTarget } from "./useTripTarget";
import { splitTrips } from "../models/trip";

vi.mock("../api/client", async (original) => ({
  ...(await original<typeof import("../api/client")>()),
  api: { trips: vi.fn(), pickupReservation: vi.fn(), returnTrip: vi.fn() },
}));
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.trips).mockResolvedValue([]);
});
afterEach(cleanup);

it("old trip mutations cannot set errors or unlock a new user's pending mutation", async () => {
  let rejectOld!: (error: Error) => void;
  let finishNew!: (value: TripView) => void;
  vi.mocked(api.pickupReservation)
    .mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          rejectOld = reject;
        }),
    )
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishNew = resolve;
        }),
    );
  const { result, rerender } = renderHook(({ user }) => useTrips(user), {
    initialProps: { user: "first" },
  });
  await act(async () => {});
  let old!: Promise<boolean>, current!: Promise<boolean>;
  act(() => {
    old = result.current.pickup("old-reservation");
  });
  rerender({ user: "second" });
  await act(async () => {});
  expect(result.current.busyId).toBeNull();
  act(() => {
    current = result.current.pickup("new-reservation");
  });
  await act(async () => {
    rejectOld(new RequestError("Old session", 401));
    expect(await old).toBe(false);
  });
  expect(result.current.busyId).toBe("new-reservation");
  expect(result.current.pickupError).toBe("");
  await act(async () => {
    finishNew({} as TripView);
    expect(await current).toBe(true);
  });
  expect(result.current.busyId).toBeNull();
});

it("blocks duplicate trip submissions and preserves suggestions for the failed trip only", async () => {
  let reject!: (error: Error) => void;
  vi.mocked(api.returnTrip).mockImplementationOnce(
    () =>
      new Promise((_, fail) => {
        reject = fail;
      }),
  );
  const { result } = renderHook(() => useTrips("student"));
  await act(async () => {});
  let pending!: Promise<boolean>;
  act(() => {
    pending = result.current.returnVehicle("trip", "full-hub");
  });
  await act(async () => {
    expect(await result.current.returnVehicle("trip", "full-hub")).toBe(false);
  });
  expect(api.returnTrip).toHaveBeenCalledTimes(1);
  const suggestedHubs = [
    { id: "other", name: "Other", location: "Test", freeSpaces: 1 },
  ];
  await act(async () => {
    reject(new RequestError("Full Hub", 409, "HTTP_409", { suggestedHubs }));
    await pending;
  });
  expect(result.current.suggestions).toEqual(suggestedHubs);
  expect(result.current.suggestionTripId).toBe("trip");
  expect(api.trips).toHaveBeenCalledTimes(2);
});

it("keeps every active trip so the UI can offer return controls for each", () => {
  const first = { id: "first", status: "active" } as TripView;
  const second = { id: "second", status: "active" } as TripView;
  const completed = { id: "completed", status: "completed" } as TripView;
  expect(splitTrips([first, completed, second])).toEqual({
    active: [first, second],
    history: [completed],
  });
});

it("keeps independent destinations for multiple trips and clears them on account change", () => {
  const { result, rerender } = renderHook(({ user }) => useTripTarget(user), {
    initialProps: { user: "first" },
  });
  act(() => {
    result.current.select("trip-one", "hub-one");
    result.current.select("trip-two", "hub-two");
  });
  expect(result.current.targets).toEqual({
    "trip-one": "hub-one",
    "trip-two": "hub-two",
  });
  rerender({ user: "second" });
  expect(result.current.targets).toEqual({});
});
