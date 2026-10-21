import { act, cleanup, renderHook } from "@testing-library/react";
import type { HubDetail, User } from "@emobility/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, RequestError } from "../api/client";
import { useHubManagement } from "./useHubManagement";

vi.mock("../api/client", async (original) => ({
  ...(await original<typeof import("../api/client")>()),
  api: {
    me: vi.fn(),
    hubs: vi.fn(),
    detail: vi.fn(),
    createHub: vi.fn(),
    updateHub: vi.fn(),
    setParkingCapacity: vi.fn(),
    addChargingPoint: vi.fn(),
    deleteHub: vi.fn(),
    removeChargingPoint: vi.fn(),
  },
}));

const operator: User = {
  id: "operator-1",
  email: "operator@example.test",
  name: "Operator",
  role: "operator",
};
const hub: HubDetail = {
  id: "hub-1",
  name: "Central Hub",
  location: "North",
  status: "active",
  parking: { capacity: 4, occupied: 1, held: 0, available: 3 },
  vehicles: { total: 0, available: 0, lowBattery: 0 },
  charging: { total: 0, available: 0, occupied: 0, failed: 0 },
  utilizationPercent: 25,
  vehicleList: [],
  chargingPoints: [],
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function settle() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function setup(session: User | null = operator) {
  const onSessionExpired = vi.fn();
  const onAccessRevoked = vi.fn();
  const hook = renderHook(
    ({ user, enabled }) =>
      useHubManagement(user, enabled, onSessionExpired, onAccessRevoked),
    { initialProps: { user: session, enabled: true } },
  );
  return { ...hook, onSessionExpired, onAccessRevoked };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.me).mockResolvedValue(operator);
  vi.mocked(api.hubs).mockResolvedValue([hub]);
  vi.mocked(api.detail).mockResolvedValue(hub);
  vi.mocked(api.createHub).mockResolvedValue({} as never);
  vi.mocked(api.updateHub).mockResolvedValue({} as never);
  vi.mocked(api.setParkingCapacity).mockResolvedValue({} as never);
  vi.mocked(api.addChargingPoint).mockResolvedValue({} as never);
  vi.mocked(api.deleteHub).mockResolvedValue({} as never);
  vi.mocked(api.removeChargingPoint).mockResolvedValue({} as never);
});
afterEach(cleanup);

describe("Hub management session and edit state", () => {
  it("refreshes clean fields and capacity while preserving fields being edited", async () => {
    const { result } = setup();
    await settle();
    act(() => {
      result.current.changeHubField(hub.id, "name", "My draft name");
      result.current.changeHubField(hub.id, "capacity", "9");
      result.current.changeHubField(hub.id, "chargingPointCode", "CP-9");
    });

    const latest: HubDetail = {
      ...hub,
      name: "Operator B name",
      location: "South",
      status: "inactive",
      parking: { ...hub.parking, capacity: 6 },
    };
    vi.mocked(api.hubs).mockResolvedValueOnce([latest]);
    vi.mocked(api.detail).mockResolvedValueOnce(latest);
    await act(async () => result.current.refresh());

    expect(result.current.editForms[hub.id]).toEqual({
      name: "My draft name",
      location: "South",
      status: "inactive",
      capacity: "9",
      chargingPointCode: "CP-9",
    });
    expect(result.current.hubs[0]).toEqual(latest);
  });

  it("submits only edited Hub fields after another operator changes status", async () => {
    const { result } = setup();
    await settle();
    act(() => result.current.changeHubField(hub.id, "name", "Renamed"));

    const disabledHub: HubDetail = { ...hub, status: "inactive" };
    vi.mocked(api.hubs).mockResolvedValueOnce([disabledHub]);
    vi.mocked(api.detail).mockResolvedValueOnce(disabledHub);
    await act(async () => result.current.refresh());
    expect(result.current.editForms[hub.id].status).toBe("inactive");

    await act(async () =>
      result.current.submitUpdate(hub.id, {
        preventDefault: vi.fn(),
      } as never),
    );

    expect(api.updateHub).toHaveBeenCalledWith(hub.id, { name: "Renamed" });
    expect(result.current.editForms[hub.id].status).toBe("inactive");
  });

  it("updates a clean capacity field when refreshed from the API", async () => {
    const { result } = setup();
    await settle();
    const latest: HubDetail = {
      ...hub,
      parking: { ...hub.parking, capacity: 7 },
    };
    vi.mocked(api.hubs).mockResolvedValueOnce([latest]);
    vi.mocked(api.detail).mockResolvedValueOnce(latest);
    await act(async () => result.current.refresh());
    expect(result.current.editForms[hub.id].capacity).toBe("7");
  });

  it("refreshes after leaving and returning while preserving a dirty capacity", async () => {
    const { result, rerender } = setup();
    await settle();
    act(() => result.current.changeHubField(hub.id, "capacity", "9"));
    rerender({ user: operator, enabled: false });
    const latest: HubDetail = {
      ...hub,
      location: "Updated while away",
      parking: { ...hub.parking, capacity: 6 },
    };
    vi.mocked(api.hubs).mockResolvedValueOnce([latest]);
    vi.mocked(api.detail).mockResolvedValueOnce(latest);
    rerender({ user: operator, enabled: true });
    await settle();

    expect(result.current.editForms[hub.id].capacity).toBe("9");
    expect(result.current.editForms[hub.id].location).toBe(
      "Updated while away",
    );
  });

  it.each([
    [401, "onSessionExpired"],
    [403, "onAccessRevoked"],
  ] as const)(
    "clears data and drafts when the API returns %s",
    async (status, callback) => {
      const hook = setup();
      await settle();
      act(() => {
        hook.result.current.changeHubField(hub.id, "name", "Unsaved draft");
        hook.result.current.changeCreateField("name", "New Hub draft");
      });
      vi.mocked(api.hubs).mockRejectedValueOnce(
        new RequestError("Access denied", status),
      );

      await act(async () => hook.result.current.refresh());

      expect(hook.result.current.hubs).toEqual([]);
      expect(hook.result.current.editForms).toEqual({});
      expect(hook.result.current.createForm).toEqual({
        code: "",
        name: "",
        location: "",
      });
      if (callback === "onSessionExpired")
        expect(hook.onSessionExpired).toHaveBeenCalledOnce();
      else expect(hook.onAccessRevoked).toHaveBeenCalledOnce();
    },
  );

  it("clears drafts on logout and when a new session logs in as the same operator", async () => {
    const { result, rerender } = setup();
    await settle();
    act(() => {
      result.current.changeHubField(hub.id, "name", "Old session draft");
      result.current.changeCreateField("name", "Old create draft");
    });
    rerender({ user: null, enabled: false });
    expect(result.current.hubs).toEqual([]);
    expect(result.current.editForms).toEqual({});
    expect(result.current.createForm.name).toBe("");

    rerender({ user: { ...operator }, enabled: true });
    await settle();
    expect(result.current.editForms[hub.id].name).toBe(hub.name);
    expect(result.current.createForm.name).toBe("");
  });

  it("invalidates old operator data when T15 session validation finds another account", async () => {
    const hook = setup();
    await settle();
    vi.mocked(api.me).mockResolvedValueOnce({
      ...operator,
      id: "operator-2",
    });

    await act(async () => hook.result.current.refresh());

    expect(hook.result.current.hubs).toEqual([]);
    expect(hook.result.current.editForms).toEqual({});
    expect(hook.onAccessRevoked).toHaveBeenCalledOnce();
  });

  it("ignores a late response from the prior session, even for the same account", async () => {
    const oldResponse = deferred<HubDetail>();
    vi.mocked(api.detail).mockReturnValueOnce(oldResponse.promise);
    const { result, rerender } = setup();
    await settle();
    const oldSignal = vi.mocked(api.detail).mock.calls[0][1];

    const nextSession = { ...operator };
    const latest = { ...hub, name: "Current session Hub" };
    vi.mocked(api.detail).mockResolvedValueOnce(latest);
    rerender({ user: nextSession, enabled: true });
    await settle();
    await act(async () =>
      oldResponse.resolve({ ...hub, name: "Old response" }),
    );

    expect(oldSignal?.aborted).toBe(true);
    expect(result.current.hubs[0].name).toBe("Current session Hub");
    expect(result.current.editForms[hub.id].name).toBe("Current session Hub");
  });

  it("keeps current data and drafts on a temporary network failure", async () => {
    const { result } = setup();
    await settle();
    act(() => result.current.changeHubField(hub.id, "name", "Local draft"));
    vi.mocked(api.me).mockRejectedValueOnce(new RequestError("Offline", 0));

    await act(async () => result.current.refresh());

    expect(result.current.hubs).toEqual([hub]);
    expect(result.current.editForms[hub.id].name).toBe("Local draft");
    expect(result.current.error).toBe("Offline");
    expect(result.current.createForm).toEqual({
      code: "",
      name: "",
      location: "",
    });
  });

  it("does not refresh or clear the next session when an old mutation finishes late", async () => {
    const mutation = deferred<unknown>();
    vi.mocked(api.addChargingPoint).mockReturnValueOnce(mutation.promise);
    const { result, rerender } = setup();
    await settle();
    act(() =>
      result.current.changeHubField(hub.id, "chargingPointCode", "CP-2"),
    );
    let oldSubmit!: Promise<void>;
    act(() => {
      oldSubmit = result.current.submitChargingPoint(hub.id, {
        preventDefault: vi.fn(),
      } as never);
    });
    await settle();

    rerender({ user: null, enabled: false });
    rerender({ user: { ...operator }, enabled: true });
    await settle();
    const readsBeforeOldMutationFinishes = vi.mocked(api.hubs).mock.calls
      .length;
    await act(async () => {
      mutation.resolve({});
      await oldSubmit;
    });

    expect(result.current.hubs).toEqual([hub]);
    expect(result.current.editForms[hub.id].chargingPointCode).toBe("");
    expect(api.hubs).toHaveBeenCalledTimes(readsBeforeOldMutationFinishes);
  });
});
