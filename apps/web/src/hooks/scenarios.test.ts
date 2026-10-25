import {
  act,
  cleanup,
  render,
  renderHook,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createElement, type FormEvent } from "react";
import type {
  SavedSimulation,
  ScenarioLimits,
  User,
} from "@emobility/contracts";
import { scenariosApi } from "../api/scenarios";
import { api } from "../api/client";
import { useScenarios } from "./useScenarios";
import { initialScenarioForm, scenarioRequest } from "../models/scenarios";
import { ScenarioResults } from "../components/ScenarioResults";
import { formatScenarioReport } from "../utils/scenarioReport";

vi.mock("../api/scenarios", () => ({
  scenariosApi: {
    config: vi.fn(),
    run: vi.fn(),
    history: vi.fn(),
    detail: vi.fn(),
  },
}));
vi.mock("../api/client", () => ({ api: { detail: vi.fn() } }));
const user: User = {
  id: "operator",
  name: "Operator",
  email: "operator@example.test",
  role: "operator",
};
const limits: ScenarioLimits = {
  maximumSteps: 288,
  maximumArrivalsPerStep: 1000,
  minimumBatteryPercent: 20,
  maximumGeneratedRequests: 100000,
  historyPageSize: 20,
  maximumHorizonMinutes: 10080,
};
const metrics = {
  demand: 6,
  served: 1,
  unserved: 5,
  queued: 0,
  completed: 0,
  initialResources: 1,
  remainingResources: 0,
  peakParking: null,
  chargingUtilizationPercent: null,
  meanWaitMinutes: null,
  waitingAtEndMinutes: null,
  timeline: [],
};
const saved: SavedSimulation = {
  id: "saved-run",
  createdAt: "2026-10-25T00:00:00.000Z",
  createdBy: user.id,
  result: {
    modelVersion: "resource-flow-v1",
    snapshotCapturedAt: "2026-10-25T00:00:00.000Z",
    hub: { id: "old-hub", name: "Saved Hub" },
    parameters: scenarioRequest({ ...initialScenarioForm, hubId: "old-hub" }),
    limits,
    baseline: metrics,
    scenario: { ...metrics, demand: 27, unserved: 26 },
    impact: { served: 0, unserved: 21, queued: 0, meanWaitMinutes: null },
    recommendations: [],
  },
};
const submit = {
  preventDefault: vi.fn(),
} as unknown as FormEvent<HTMLFormElement>;
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(scenariosApi.config).mockResolvedValue(limits);
  vi.mocked(scenariosApi.history).mockResolvedValue({
    items: [],
    nextBefore: null,
  });
  vi.mocked(scenariosApi.run).mockResolvedValue(saved);
  vi.mocked(scenariosApi.detail).mockResolvedValue(saved);
  vi.mocked(api.detail).mockResolvedValue({
    id: "a",
    name: "Live Hub",
    location: "Location",
    status: "active",
    vehicleList: [],
    chargingPoints: [],
    parking: { capacity: 0, available: 0, occupied: 0, held: 0 },
    vehicles: { total: 0, available: 0, lowBattery: 0 },
    charging: { total: 0, available: 0, occupied: 0, failed: 0 },
    utilizationPercent: 0,
  });
});
afterEach(cleanup);
it("T22 student does not load scenario configuration or history", async () => {
  renderHook(() => useScenarios({ ...user, role: "student" }));
  await act(async () => {});
  expect(scenariosApi.config).not.toHaveBeenCalled();
  expect(scenariosApi.history).not.toHaveBeenCalled();
});
it("T22 ambiguous retry reuses its key, explicit new run gets a new key; clear preserves inputs and saved history", async () => {
  const { result } = renderHook(() => useScenarios(user));
  await act(async () => {});
  act(() => result.current.change("hubId", "a"));
  vi.mocked(scenariosApi.run).mockRejectedValueOnce(
    new Error("Connection lost"),
  );
  await act(async () => {
    await result.current.run(submit);
  });
  expect(result.current.error).toBe("Connection lost");
  await act(async () => {
    await result.current.run(submit);
  });
  const calls = vi.mocked(scenariosApi.run).mock.calls;
  expect(calls[0][1]).toBe(calls[1][1]);
  expect(result.current.saved?.id).toBe("saved-run");
  act(() => result.current.clear());
  expect(result.current.saved).toBeNull();
  expect(result.current.form.hubId).toBe("a");
  expect(result.current.form.horizonMinutes).toBe("60");
  await act(async () => {
    await result.current.run(submit);
  });
  expect(calls[2][1]).not.toBe(calls[0][1]);
});
it("T22 stale run from an old session cannot replace a new session or unlock its mutation", async () => {
  let finish!: (value: SavedSimulation) => void;
  vi.mocked(scenariosApi.run).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const { result, rerender } = renderHook(
    ({ current }: { current: User | null }) => useScenarios(current),
    { initialProps: { current: user as User | null } },
  );
  await act(async () => {});
  act(() => {
    void result.current.run(submit);
  });
  rerender({ current: { ...user, id: "second" } });
  await act(async () => {});
  await act(async () => {
    finish(saved);
  });
  expect(result.current.saved).toBeNull();
  expect(result.current.error).toBe("");
  expect(result.current.form.hubId).toBe("");
  expect(result.current.busy).toBe(false);
});
it("T22 saved run view and report keep their original Hub and parameters after form edits", async () => {
  const { result } = renderHook(() => useScenarios(user));
  await act(async () => {});
  await act(async () => {
    await result.current.open(saved.id);
  });
  act(() => {
    result.current.change("hubId", "new-hub");
    result.current.change("horizonMinutes", "120");
  });
  render(
    createElement(ScenarioResults, {
      saved: result.current.saved!,
      onDownload: vi.fn(),
    }),
  );
  expect(screen.getByRole("heading", { name: /Saved Hub/ })).toBeTruthy();
  expect(screen.getByText(/Thời gian mô phỏng 60 phút/)).toBeTruthy();
  expect(screen.queryByText(/Thời gian mô phỏng 120 phút/)).toBeNull();
  const report = formatScenarioReport(result.current.saved!);
  expect(report).toContain("Hub: Saved Hub");
  expect(report).toContain("Mã Hub: old-hub");
  expect(report).toContain("Thời gian mô phỏng: 60 phút");
  expect(report).not.toContain("horizonMinutes");
  expect(report).not.toContain("T22");
  expect(report).not.toContain("new-hub");
  const precise = structuredClone(saved);
  precise.result.parameters.baselineArrivalsPerStep = 0.0001;
  expect(formatScenarioReport(precise)).toContain("0,0001 yêu cầu");
});
it("T22 parking and charging forms send only parameters for the selected scenario", () => {
  const parking = scenarioRequest({
    ...initialScenarioForm,
    kind: "parking_full",
    hubId: "a",
    baselineArrivalsPerStep: "2",
    scenarioArrivalsPerStep: "999",
    failedChargingPointIds: ["old-point"],
  });
  expect(parking.scenarioArrivalsPerStep).toBe(2);
  expect(parking.failedChargingPointIds).toEqual([]);
  expect(parking.additionalOccupiedSpaces).toBe(1);
  const charging = scenarioRequest({
    ...initialScenarioForm,
    kind: "charging_failure",
    failedChargingPointIds: ["c2", "c1"],
  });
  expect(charging.additionalOccupiedSpaces).toBe(0);
  expect(charging.failedChargingPointIds).toEqual(["c1", "c2"]);
});

it("T36 a slow initial history response cannot overwrite the refreshed list after a saved run", async () => {
  let finish!: (value: { items: []; nextBefore: null }) => void;
  vi.mocked(scenariosApi.history).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const { result } = renderHook(() => useScenarios(user));
  await act(async () => {});
  vi.mocked(scenariosApi.history).mockResolvedValue({
    items: [
      {
        id: saved.id,
        createdAt: saved.createdAt,
        kind: "demand_surge",
        hubName: "Saved Hub",
        modelVersion: "resource-flow-v1",
      },
    ],
    nextBefore: null,
  });
  await act(async () => {
    await result.current.run(submit);
  });
  expect(result.current.history.items[0].id).toBe(saved.id);
  await act(async () => {
    finish({ items: [], nextBefore: null });
  });
  expect(result.current.history.items[0].id).toBe(saved.id);
});
