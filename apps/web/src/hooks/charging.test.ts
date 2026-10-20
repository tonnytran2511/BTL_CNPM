import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { FormEvent } from "react";
import type { ChargingOverview, User } from "@emobility/contracts";
import { chargingApi } from "../api/charging";
import { useChargingManager } from "./useChargingManager";
vi.mock("../api/charging", () => ({
  chargingApi: {
    overview: vi.fn(),
    createRental: vi.fn(),
    cancelQueued: vi.fn(),
    transition: vi.fn(),
    schedule: vi.fn(),
  },
}));
const operator: User = {
  id: "operator",
  email: "operator@example.test",
  name: "Operator",
  role: "operator",
};
const overview: ChargingOverview = {
  queue: [],
  sessions: [],
  rentalCandidates: [
    {
      id: "fleet-1",
      code: "Fleet 1",
      hubId: "hub-1",
      hubName: "Hub 1",
      batteryPercent: 30,
    },
  ],
  rentalPending: [],
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(chargingApi.overview).mockResolvedValue(overview);
});
afterEach(cleanup);
it("students do not load operator charging data", async () => {
  renderHook(() =>
    useChargingManager({ ...operator, role: "student" }, vi.fn()),
  );
  await act(async () => {});
  expect(chargingApi.overview).not.toHaveBeenCalled();
});
it("rental request uses selected candidate's actual Hub and a timezone-aware deadline", async () => {
  const changed = vi.fn().mockResolvedValue(undefined);
  const { result } = renderHook(() => useChargingManager(operator, changed));
  await act(async () => {});
  const form = document.createElement("form");
  for (const [name, value] of Object.entries({
    vehicle: "fleet-1",
    target: "90",
    deadline: "2026-10-25T10:00",
  })) {
    const field = document.createElement("input");
    field.name = name;
    field.value = value;
    form.append(field);
  }
  await act(async () => {
    result.current.createRental({
      preventDefault: vi.fn(),
      currentTarget: form,
    } as unknown as FormEvent<HTMLFormElement>);
  });
  expect(chargingApi.createRental).toHaveBeenCalledWith(
    "hub-1",
    "fleet-1",
    90,
    new Date("2026-10-25T10:00").toISOString(),
    expect.any(String),
  );
  expect(changed).toHaveBeenCalledTimes(1);
});
it("ambiguous network retry reuses the same key to avoid applying fleet completion twice", async () => {
  const { result } = renderHook(() => useChargingManager(operator, vi.fn()));
  await act(async () => {});
  vi.mocked(chargingApi.transition).mockRejectedValueOnce(
    new Error("Connection lost"),
  );
  await act(async () => {
    result.current.action("session-1", "complete", 80);
  });
  await act(async () => {
    result.current.action("session-1", "complete", 80);
  });
  const calls = vi.mocked(chargingApi.transition).mock.calls;
  expect(calls).toHaveLength(2);
  expect(calls[0][3]).toBe(calls[1][3]);
});
it("late rental cancellation does not update another signed-in user's screen", async () => {
  let finish!: () => void;
  vi.mocked(chargingApi.cancelQueued).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = () => resolve(undefined);
      }),
  );
  const { result, rerender } = renderHook(
    ({ user }: { user: User | null }) => useChargingManager(user, vi.fn()),
    { initialProps: { user: operator as User | null } },
  );
  await act(async () => {});
  act(() => result.current.cancelQueued("request-1"));
  rerender({ user: null });
  await act(async () => {
    finish();
  });
  expect(result.current.message).toBe("");
  expect(result.current.data.rentalCandidates).toEqual([]);
});
