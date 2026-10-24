import { useCallback, useState } from "react";
import type { FormEvent } from "react";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type {
  ChargingOverview,
  ChargingQueueEntry,
  User,
} from "@emobility/contracts";
import { chargingApi } from "../api/charging";
import { mobilityApi } from "../api/mobility";
import { useChargingManager } from "./useChargingManager";
import { useMobility } from "./useMobility";
vi.mock("../api/charging", () => ({
  chargingApi: {
    overview: vi.fn(),
    createRental: vi.fn(),
    cancelQueued: vi.fn(),
    transition: vi.fn(),
    schedule: vi.fn(),
  },
}));
vi.mock("../api/mobility", () => ({
  mobilityApi: {
    vehicles: vi.fn(),
    bookings: vi.fn(),
    queue: vi.fn(),
    charge: vi.fn(),
  },
}));
const user: User = {
  id: "operator",
  email: "op@example.test",
  name: "Operator",
  role: "operator",
};
let entries: ChargingQueueEntry[];
const entry: ChargingQueueEntry = {
  id: "request-1",
  hubId: "hub-1",
  hubName: "Hub 1",
  vehicleCode: "Fleet 1",
  targetBatteryPercent: 80,
  requiredBy: null,
  createdAt: "2026-10-20T00:00:00Z",
  status: "queued",
};
const overview = (): ChargingOverview => ({
  queue: entries.map((e) => ({
    ...e,
    vehicleKind: "rental",
    batteryPercent: 30,
  })),
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
  rentalPending: entries.map((e) => ({
    id: e.id,
    vehicleCode: e.vehicleCode,
    hubName: e.hubName,
  })),
});
beforeEach(() => {
  vi.resetAllMocks();
  entries = [];
  vi.mocked(mobilityApi.vehicles).mockResolvedValue([
    {
      id: "private-1",
      code: "My car",
      type: "electric_bicycle",
      batteryPercent: 30,
    },
  ] as never);
  vi.mocked(mobilityApi.bookings).mockResolvedValue([]);
  vi.mocked(mobilityApi.queue).mockImplementation(async () =>
    entries.map((e) => ({ ...e })),
  );
  vi.mocked(chargingApi.overview).mockImplementation(async () => overview());
});
afterEach(cleanup);
function useViews() {
  const [revision, setRevision] = useState(0);
  const changed = useCallback(async () => {
    setRevision((v) => v + 1);
  }, []);
  return {
    mobility: useMobility(user, changed, String(revision)),
    charging: useChargingManager(user, changed, String(revision)),
  };
}
function form(values: Record<string, string>) {
  const element = document.createElement("form");
  for (const [name, value] of Object.entries(values)) {
    const field = document.createElement("input");
    field.name = name;
    field.value = value;
    element.append(field);
  }
  return {
    preventDefault: vi.fn(),
    currentTarget: element,
  } as unknown as FormEvent<HTMLFormElement>;
}
it("a fleet request sent in the operator panel immediately appears in the other charging request list", async () => {
  vi.mocked(chargingApi.createRental).mockImplementation(async () => {
    entries = [entry];
    return { id: entry.id, status: "queued" };
  });
  const { result } = renderHook(useViews);
  await act(async () => {});
  act(() => result.current.mobility.selectStep("charging"));
  await act(async () => {
    result.current.charging.createRental(
      form({ vehicle: "fleet-1", target: "80" }),
    );
  });
  expect(result.current.mobility.queue).toEqual([entry]);
  expect(result.current.mobility.step).toBe("charging");
});
it("a private request sent above appears in the operator queue without reloading the page", async () => {
  vi.mocked(mobilityApi.charge).mockImplementation(async () => {
    entries = [entry];
    return { id: entry.id, status: "queued" };
  });
  const { result } = renderHook(useViews);
  await act(async () => {});
  await act(async () => {
    result.current.mobility.charge(
      form({ vehicle: "private-1", hub: "hub-1", target: "80" }),
    );
  });
  expect(result.current.charging.data.queue.map((e) => e.id)).toEqual([
    entry.id,
  ]);
});
it("a status change in the operator panel also refreshes the request history above", async () => {
  entries = [entry];
  vi.mocked(chargingApi.transition).mockImplementation(async () => {
    entries = [{ ...entry, status: "fulfilled" }];
    return {} as never;
  });
  const { result } = renderHook(useViews);
  await act(async () => {});
  await act(async () => {
    result.current.charging.action("session-1", "complete", 80);
  });
  expect(result.current.mobility.queue[0].status).toBe("fulfilled");
});
it("a slow older overview response cannot overwrite a newer shared refresh", async () => {
  let oldResolve!: (data: ChargingOverview) => void;
  vi.mocked(chargingApi.overview).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        oldResolve = resolve;
      }),
  );
  const { result, rerender } = renderHook(
    ({ revision }) => useChargingManager(user, vi.fn(), revision),
    { initialProps: { revision: null as string | null } },
  );
  await act(async () => {});
  entries = [entry];
  rerender({ revision: "new" });
  await act(async () => {});
  expect(result.current.data.queue.map((e) => e.id)).toEqual([entry.id]);
  await act(async () => {
    oldResolve({
      queue: [],
      sessions: [],
      rentalCandidates: [],
      rentalPending: [],
    });
  });
  expect(result.current.data.queue.map((e) => e.id)).toEqual([entry.id]);
});
