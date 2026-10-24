import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { FormEvent } from "react";
import { createElement } from "react";
import { ChargingFailurePanel } from "../components/ChargingFailurePanel";
import type { ChargingPointFailureView, User } from "@emobility/contracts";
import { chargingFailureApi } from "../api/chargingFailure";
import { useChargingFailures } from "./useChargingFailures";
vi.mock("../api/chargingFailure", () => ({
  chargingFailureApi: { points: vi.fn(), report: vi.fn(), recover: vi.fn() },
}));
const operator: User = {
  id: "operator",
  email: "operator@example.test",
  name: "Operator",
  role: "operator",
};
const point: ChargingPointFailureView = {
  id: "point-1",
  code: "C1",
  hubId: "hub-1",
  hubName: "Hub 1",
  status: "occupied",
  sessionId: "session-1",
  sessionStatus: "charging",
  vehicleCode: "CAR1",
  vehicleKind: "private",
  batteryPercent: 30,
  targetBatteryPercent: 80,
  openIncidentId: null,
  openIncidentDescription: null,
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(chargingFailureApi.points).mockResolvedValue([point]);
});
afterEach(cleanup);
function form(description = "Mất điện", battery = "50") {
  const element = document.createElement("form");
  for (const [name, value] of Object.entries({ description, battery })) {
    const input = document.createElement("input");
    input.name = name;
    input.value = value;
    element.append(input);
  }
  element.dataset.pointId = point.id;
  element.dataset.sessionId = point.sessionId ?? "";
  return {
    preventDefault: vi.fn(),
    currentTarget: element,
  } as unknown as FormEvent<HTMLFormElement>;
}
it("students never load or mutate operator failure resources", async () => {
  const { result } = renderHook(() =>
    useChargingFailures({ ...operator, role: "student" }, vi.fn()),
  );
  await act(async () => {});
  act(() => result.current.setSelectedId(point.id));
  await act(async () => {
    result.current.report(form());
    result.current.recover();
  });
  expect(chargingFailureApi.points).not.toHaveBeenCalled();
  expect(chargingFailureApi.report).not.toHaveBeenCalled();
  expect(chargingFailureApi.recover).not.toHaveBeenCalled();
});
it("report sends actual pin and the exact session snapshot, then refreshes other panels", async () => {
  const changed = vi.fn().mockResolvedValue(undefined);
  const { result } = renderHook(() => useChargingFailures(operator, changed));
  await act(async () => {});
  act(() => result.current.setSelectedId(point.id));
  await act(async () => {
    result.current.report(form("  Mất điện  ", "50"));
  });
  expect(chargingFailureApi.report).toHaveBeenCalledWith(
    point.id,
    {
      description: "Mất điện",
      sessionId: "session-1",
      achievedBatteryPercent: 50,
    },
    expect.any(String),
  );
  expect(changed).toHaveBeenCalledOnce();
});
it("an ambiguous report retry keeps its original key", async () => {
  const { result } = renderHook(() => useChargingFailures(operator, vi.fn()));
  await act(async () => {});
  act(() => result.current.setSelectedId(point.id));
  vi.mocked(chargingFailureApi.report).mockRejectedValueOnce(
    new Error("Connection lost"),
  );
  await act(async () => {
    result.current.report(form());
  });
  await act(async () => {
    result.current.report(form());
  });
  const calls = vi.mocked(chargingFailureApi.report).mock.calls;
  expect(calls).toHaveLength(2);
  expect(calls[0][2]).toBe(calls[1][2]);
});
it("repair uses the selected failed point and not a previous session id", async () => {
  vi.mocked(chargingFailureApi.points).mockResolvedValue([
    { ...point, status: "failed", sessionId: null, sessionStatus: null },
  ]);
  const { result } = renderHook(() => useChargingFailures(operator, vi.fn()));
  await act(async () => {});
  act(() => result.current.setSelectedId(point.id));
  await act(async () => {
    result.current.recover();
  });
  expect(chargingFailureApi.recover).toHaveBeenCalledWith(
    point.id,
    expect.any(String),
  );
});
it("a late report response cannot restore data or success text after logout", async () => {
  let finish!: () => void;
  vi.mocked(chargingFailureApi.report).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = () => resolve({} as never);
      }),
  );
  const { result, rerender } = renderHook(
    ({ user }: { user: User | null }) => useChargingFailures(user, vi.fn()),
    { initialProps: { user: operator as User | null } },
  );
  await act(async () => {});
  act(() => result.current.setSelectedId(point.id));
  act(() => result.current.report(form()));
  rerender({ user: null });
  await act(async () => {
    finish();
  });
  expect(result.current.points).toEqual([]);
  expect(result.current.message).toBe("");
  expect(result.current.busy).toBe(false);
});

it("switching charging points clears the observed battery before reporting", async () => {
  const other = {
    ...point,
    id: "point-2",
    code: "C2",
    sessionId: "session-2",
    vehicleCode: "CAR2",
  };
  vi.mocked(chargingFailureApi.points).mockResolvedValue([point, other]);
  function Panel() {
    const model = useChargingFailures(operator, vi.fn());
    return createElement(ChargingFailurePanel, { model });
  }
  render(createElement(Panel));
  await act(async () => {});
  const select = screen.getByLabelText("Chọn cổng sạc");
  fireEvent.change(select, { target: { value: point.id } });
  const battery = screen.getByRole("spinbutton", {
    name: /Pin thực tế đã đạt/,
  }) as HTMLInputElement;
  fireEvent.change(battery, { target: { value: "70" } });
  expect(battery.value).toBe("70");
  fireEvent.change(select, { target: { value: other.id } });
  const nextBattery = screen.getByRole("spinbutton", {
    name: /Pin thực tế đã đạt/,
  }) as HTMLInputElement;
  expect(nextBattery.value).toBe("");
  expect(nextBattery).not.toBe(battery);
  fireEvent.change(screen.getByLabelText("Mô tả sự cố"), {
    target: { value: "Mất điện" },
  });
  fireEvent.submit(nextBattery.closest("form")!);
  expect(chargingFailureApi.report).not.toHaveBeenCalled();
  fireEvent.change(nextBattery, { target: { value: "45" } });
  await act(async () => fireEvent.submit(nextBattery.closest("form")!));
  expect(chargingFailureApi.report).toHaveBeenCalledWith(
    other.id,
    expect.objectContaining({
      sessionId: other.sessionId,
      achievedBatteryPercent: 45,
    }),
    expect.any(String),
  );
});

it("rejects a stale point/session form even when submitted after selection changed", async () => {
  const other = { ...point, id: "point-2", sessionId: "session-2" };
  vi.mocked(chargingFailureApi.points).mockResolvedValue([point, other]);
  const { result } = renderHook(() => useChargingFailures(operator, vi.fn()));
  await act(async () => {});
  act(() => result.current.setSelectedId(point.id));
  const stale = form("Mất điện", "70");
  act(() => result.current.setSelectedId(other.id));
  await act(async () => result.current.report(stale));
  expect(chargingFailureApi.report).not.toHaveBeenCalled();
  expect(result.current.error).toMatch(/đã thay đổi/);
});

it("switching sessions on the same port clears the previous vehicle battery", async () => {
  const nextSession = { ...point, sessionId: "session-3", vehicleCode: "CAR3" };
  vi.mocked(chargingFailureApi.points)
    .mockResolvedValueOnce([point])
    .mockResolvedValueOnce([nextSession]);
  function Panel({ refreshKey }: { refreshKey: string }) {
    const model = useChargingFailures(operator, vi.fn(), refreshKey);
    return createElement(ChargingFailurePanel, { model });
  }
  const view = render(createElement(Panel, { refreshKey: "old" }));
  await act(async () => {});
  fireEvent.change(screen.getByLabelText("Chọn cổng sạc"), {
    target: { value: point.id },
  });
  const before = screen.getByRole("spinbutton", {
    name: /Pin thực tế đã đạt/,
  }) as HTMLInputElement;
  fireEvent.change(before, { target: { value: "70" } });
  await act(async () =>
    view.rerender(createElement(Panel, { refreshKey: "new" })),
  );
  const after = screen.getByRole("spinbutton", {
    name: /Pin thực tế đã đạt/,
  }) as HTMLInputElement;
  expect(after).not.toBe(before);
  expect(after.value).toBe("");
  fireEvent.change(screen.getByLabelText("Mô tả sự cố"), {
    target: { value: "Mất điện" },
  });
  fireEvent.submit(after.closest("form")!);
  expect(chargingFailureApi.report).not.toHaveBeenCalled();
});
