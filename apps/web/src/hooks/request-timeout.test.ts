import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useFoundation } from "./useFoundation";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
it("releases the dashboard after a real API-client timeout and recovers on manual refresh", async () => {
  vi.useFakeTimers();
  let hubRequests = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn((path: string, options: RequestInit) => {
      if (path === "/api/hubs" && ++hubRequests === 1)
        return new Promise((_resolve, reject) =>
          options.signal?.addEventListener(
            "abort",
            () => reject(options.signal?.reason),
            { once: true },
          ),
        );
      const body =
        path === "/api/config"
          ? { appName: "Test Network", pollIntervalMs: 3000 }
          : path === "/api/auth/me"
            ? {
                id: "test-user",
                name: "Test user",
                email: "user@example.test",
                role: "student",
              }
            : [];
      return Promise.resolve(
        new Response(JSON.stringify(body), { status: 200 }),
      );
    }),
  );
  const { result } = renderHook(useFoundation);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
  expect(result.current.refreshing).toBe(true);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000);
  });
  expect(result.current.refreshing).toBe(false);
  expect(result.current.error).toContain("phản hồi quá lâu");
  expect(result.current.user?.id).toBe("test-user");
  await act(async () => {
    await result.current.refresh();
  });
  expect(result.current.error).toBe("");
  expect(result.current.updatedAt).not.toBeNull();
  expect(hubRequests).toBe(2);
});
