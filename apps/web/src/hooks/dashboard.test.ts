import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HubDetail, User } from "@emobility/contracts";
import { api, RequestError } from "../api/client";
import { useFoundation } from "./useFoundation";
import { useHubDetail } from "./useHubDetail";

vi.mock("../api/client", async (original) => ({
  ...(await original<typeof import("../api/client")>()),
  api: {
    config: vi.fn(),
    me: vi.fn(),
    hubs: vi.fn(),
    overview: vi.fn(),
    detail: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
  },
}));
const user: User = {
  id: "student-test",
  email: "student@example.test",
  name: "Test student",
  role: "student",
};
const hub: HubDetail = {
  id: "hub-test",
  name: "Test Hub",
  location: "Test location",
  status: "active",
  parking: { capacity: 2, occupied: 0, held: 0, available: 2 },
  vehicles: { total: 0, available: 0, lowBattery: 0 },
  charging: { total: 0, available: 0, occupied: 0, failed: 0 },
  utilizationPercent: 0,
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
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  vi.mocked(api.config).mockResolvedValue({
    appName: "Test network",
    pollIntervalMs: 3000,
  });
  vi.mocked(api.me).mockResolvedValue(user);
  vi.mocked(api.hubs).mockResolvedValue([hub]);
  vi.mocked(api.detail).mockResolvedValue(hub);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("dashboard lifecycle", () => {
  it("polls changed resource counts and refreshes immediately when the connection returns", async () => {
    const { result, unmount } = renderHook(useFoundation);
    await settle();
    const changed = {
      ...hub,
      parking: { ...hub.parking, occupied: 1, available: 1 },
    };
    vi.mocked(api.hubs).mockResolvedValue([changed]);
    await act(async () => {
      vi.advanceTimersByTime(3000);
    });
    expect(result.current.hubs).toEqual([changed]);
    vi.mocked(api.hubs).mockRejectedValueOnce(new RequestError("Offline", 0));
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.error).toBe("Offline");
    await act(async () => {
      window.dispatchEvent(new Event("online"));
    });
    expect(result.current.error).toBe("");
    expect(result.current.hubs).toEqual([changed]);
    const calls = vi.mocked(api.hubs).mock.calls.length;
    unmount();
    window.dispatchEvent(new Event("online"));
    expect(api.hubs).toHaveBeenCalledTimes(calls);
  });
  it.each(["role", "account"])(
    "removes protected data when the session %s changes before polling",
    async (change) => {
      const { result } = renderHook(useFoundation);
      await settle();
      vi.mocked(api.me).mockResolvedValueOnce(
        change === "role"
          ? { ...user, role: "operator" }
          : { ...user, id: "other" },
      );
      await act(async () => {
        await result.current.refresh();
      });
      expect(result.current.user).toBeNull();
      expect(result.current.hubs).toEqual([]);
      expect(result.current.updatedAt).toBeNull();
      expect(result.current.stats.every((stat) => stat.value === 0)).toBe(true);
      expect(result.current.error).toContain("quyền truy cập đã thay đổi");
      expect(api.hubs).toHaveBeenCalledTimes(1);
      expect(api.overview).not.toHaveBeenCalled();
    },
  );
  it("clears operator totals if permission is revoked after the session check", async () => {
    vi.mocked(api.me).mockResolvedValue({ ...user, role: "operator" });
    vi.mocked(api.overview).mockResolvedValue({
      hubs: [hub],
      updatedAt: "2026-10-20T00:00:00Z",
      totals: {
        hubs: 1,
        vehicles: 10,
        availableVehicles: 8,
        availableParking: 2,
        availableCharging: 1,
        failedCharging: 0,
      },
    });
    const { result } = renderHook(useFoundation);
    await settle();
    expect(result.current.stats.some((stat) => stat.value > 0)).toBe(true);
    vi.mocked(api.overview).mockRejectedValueOnce(
      new RequestError("Denied", 403),
    );
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.user).toBeNull();
    expect(result.current.hubs).toEqual([]);
    expect(result.current.stats.every((stat) => stat.value === 0)).toBe(true);
    expect(result.current.refreshing).toBe(false);
    expect(result.current.error).toContain("Quyền truy cập đã thay đổi");
  });
  it("does not start a resource read after logout while session validation is pending", async () => {
    const { result } = renderHook(useFoundation);
    await settle();
    const pending = deferred<User>();
    vi.mocked(api.me).mockReturnValueOnce(pending.promise);
    vi.mocked(api.logout).mockResolvedValue({ success: true });
    let refreshing!: Promise<void>;
    act(() => {
      refreshing = result.current.refresh();
    });
    await act(async () => {
      window.dispatchEvent(new Event("online"));
      await result.current.logout();
      pending.resolve(user);
      await refreshing;
    });
    expect(api.hubs).toHaveBeenCalledTimes(1);
    expect(result.current.user).toBeNull();
    expect(result.current.refreshing).toBe(false);
  });
  it("does not overlap slow requests or manual refresh with polling; resumes on visibility", async () => {
    const pending = deferred<HubDetail[]>();
    vi.mocked(api.hubs).mockReturnValueOnce(pending.promise);
    const { result, unmount } = renderHook(useFoundation);
    await settle();
    expect(api.hubs).toHaveBeenCalledTimes(1);
    await act(async () => {
      vi.advanceTimersByTime(9000);
      void result.current.refresh();
    });
    expect(api.hubs).toHaveBeenCalledTimes(1);
    await act(async () => {
      pending.resolve([hub]);
    });
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    await act(async () => {
      vi.advanceTimersByTime(3000);
    });
    expect(api.hubs).toHaveBeenCalledTimes(1);
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(api.hubs).toHaveBeenCalledTimes(2);
    unmount();
    await act(async () => {
      vi.advanceTimersByTime(9000);
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(api.hubs).toHaveBeenCalledTimes(2);
  });
  it("keeps last successful data/timestamp on server failure and recovers on retry", async () => {
    const { result } = renderHook(useFoundation);
    await settle();
    const timestamp = result.current.updatedAt;
    vi.mocked(api.hubs).mockRejectedValueOnce(
      new RequestError("Unavailable", 503),
    );
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.hubs).toEqual([hub]);
    expect(result.current.updatedAt).toBe(timestamp);
    expect(result.current.error).toBe("Unavailable");
    expect(result.current.user).toEqual(user);
    expect(result.current.refreshing).toBe(false);
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.error).toBe("");
  });
  it("clears protected state on expiry and unlocks refresh after next login", async () => {
    const { result } = renderHook(useFoundation);
    await settle();
    vi.mocked(api.hubs).mockRejectedValueOnce(new RequestError("Expired", 401));
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.user).toBeNull();
    expect(result.current.hubs).toEqual([]);
    expect(result.current.updatedAt).toBeNull();
    expect(result.current.error).toContain("Phiên đăng nhập đã hết hạn");
    expect(result.current.refreshing).toBe(false);
    vi.mocked(api.login).mockResolvedValue(user);
    await act(async () => {
      await result.current.login({
        preventDefault() {},
      } as React.FormEvent<HTMLFormElement>);
    });
    await settle();
    expect(result.current.hubs).toEqual([hub]);
    expect(result.current.refreshing).toBe(false);
  });
  it("aborts a pending request on logout and ignores late data", async () => {
    const pending = deferred<HubDetail[]>();
    vi.mocked(api.hubs).mockReturnValueOnce(pending.promise);
    vi.mocked(api.logout).mockResolvedValue({ success: true });
    const { result } = renderHook(useFoundation);
    await settle();
    const signal = vi.mocked(api.hubs).mock.calls[0][0];
    await act(async () => {
      await result.current.logout();
      pending.resolve([hub]);
    });
    expect(signal?.aborted).toBe(true);
    expect(result.current.user).toBeNull();
    expect(result.current.hubs).toEqual([]);
    expect(result.current.refreshing).toBe(false);
  });
});

describe("Hub detail lifecycle", () => {
  it("lets slow detail finish across polls, keeps data on transient failure, supports retry", async () => {
    const pending = deferred<HubDetail>();
    vi.mocked(api.detail).mockReturnValueOnce(pending.promise);
    const { result, rerender } = renderHook(
      ({ tick }) => useHubDetail(user.id, tick),
      { initialProps: { tick: "first" } },
    );
    act(() => result.current.open(hub.id));
    rerender({ tick: "second" });
    rerender({ tick: "third" });
    expect(api.detail).toHaveBeenCalledTimes(1);
    expect(vi.mocked(api.detail).mock.calls[0][1]?.aborted).toBe(false);
    await act(async () => {
      pending.resolve(hub);
    });
    vi.mocked(api.detail).mockRejectedValueOnce(new RequestError("Offline", 0));
    rerender({ tick: "fourth" });
    await settle();
    expect(result.current.detail).toEqual(hub);
    expect(result.current.error).toBe("Offline");
    await act(async () => result.current.retry());
    expect(result.current.error).toBe("");
    expect(result.current.detail).toEqual(hub);
  });
  it("ignores an old Hub response after selection changes and clears loading on close", async () => {
    const old = deferred<HubDetail>();
    vi.mocked(api.detail).mockReturnValueOnce(old.promise);
    const { result } = renderHook(() => useHubDetail(user.id));
    act(() => result.current.open("old"));
    const signal = vi.mocked(api.detail).mock.calls[0][1];
    act(() => result.current.open(hub.id));
    await settle();
    await act(async () => old.resolve({ ...hub, id: "old" }));
    expect(signal?.aborted).toBe(true);
    expect(result.current.detail?.id).toBe(hub.id);
    act(() => result.current.close());
    expect(result.current.loading).toBe(false);
    expect(result.current.detail).toBeNull();
  });
  it.each([403, 404])(
    "clears stale detail when access is revoked or Hub removed (%s)",
    async (status) => {
      const { result } = renderHook(() => useHubDetail(user.id));
      act(() => result.current.open(hub.id));
      await settle();
      vi.mocked(api.detail).mockRejectedValueOnce(
        new RequestError("Not available", status),
      );
      await act(async () => result.current.retry());
      expect(result.current.detail).toBeNull();
      expect(result.current.error).toBe("Not available");
    },
  );
  it("notifies the session owner on detail 401 and removes stale data", async () => {
    const expire = vi.fn();
    const { result } = renderHook(() => useHubDetail(user.id, null, expire));
    act(() => result.current.open(hub.id));
    await settle();
    vi.mocked(api.detail).mockRejectedValueOnce(
      new RequestError("Expired", 401),
    );
    await act(async () => result.current.retry());
    expect(expire).toHaveBeenCalledOnce();
    expect(result.current.detail).toBeNull();
  });
});
