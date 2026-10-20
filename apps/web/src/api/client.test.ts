import { afterEach, expect, it, vi } from "vitest";
import { api, RequestError } from "./client";

afterEach(() => vi.unstubAllGlobals());
it("keeps structured trip-return suggestions alongside the error code", async () => {
  const details = {
    suggestedHubs: [
      { id: "test-hub", name: "Test", location: "Test", freeSpaces: 1 },
    ],
  };
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          statusCode: 409,
          code: "HTTP_409",
          message: "Full Hub",
          details,
        }),
        { status: 409 },
      ),
    ),
  );
  await expect(api.returnTrip("test-trip", "test-hub")).rejects.toMatchObject({
    status: 409,
    code: "HTTP_409",
    details,
  });
});
it("preserves the backend error code and includes credentials", async () => {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        message: "Denied",
        code: "ACCESS_DENIED",
        statusCode: 403,
      }),
      { status: 403 },
    ),
  );
  vi.stubGlobal("fetch", fetchMock);
  await expect(api.hubs()).rejects.toMatchObject({
    status: 403,
    code: "ACCESS_DENIED",
    message: "Denied",
  });
  expect(fetchMock).toHaveBeenCalledWith(
    "/api/hubs",
    expect.objectContaining({ credentials: "include" }),
  );
});
it("normalizes network and non-JSON failures without losing HTTP status", async () => {
  const fetchMock = vi
    .fn()
    .mockRejectedValueOnce(new TypeError("Failed to fetch"))
    .mockResolvedValueOnce(new Response("Proxy unavailable", { status: 503 }));
  vi.stubGlobal("fetch", fetchMock);
  await expect(api.hubs()).rejects.toBeInstanceOf(RequestError);
  await expect(api.hubs()).rejects.toMatchObject({ status: 503 });
});
it("preserves cancellation instead of presenting an offline error", async () => {
  const aborted = new DOMException("Aborted", "AbortError");
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(aborted));
  await expect(api.hubs()).rejects.toBe(aborted);
});

it("aborts a hung mutation at the configured deadline without automatically replaying it", async () => {
  vi.useFakeTimers();
  const fetchMock = vi.fn(
    (_path, options: RequestInit) =>
      new Promise((_resolve, reject) => {
        options.signal?.addEventListener(
          "abort",
          () => reject(new DOMException("Aborted", "AbortError")),
          { once: true },
        );
      }),
  );
  vi.stubGlobal("fetch", fetchMock);
  const pending = expect(api.logout()).rejects.toMatchObject({
    status: 0,
    code: "REQUEST_TIMEOUT",
  });
  await vi.advanceTimersByTimeAsync(1000);
  await pending;
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
  vi.useRealTimers();
});

it("applies the same deadline while reading a stalled response body", async () => {
  vi.useFakeTimers();
  vi.stubGlobal(
    "fetch",
    vi.fn((_path, options: RequestInit) =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          new Promise((_resolve, reject) => {
            options.signal?.addEventListener(
              "abort",
              () => reject(new DOMException("Aborted", "AbortError")),
              { once: true },
            );
          }),
      }),
    ),
  );
  const pending = expect(api.hubs()).rejects.toMatchObject({
    code: "REQUEST_TIMEOUT",
  });
  await vi.advanceTimersByTimeAsync(1000);
  await pending;
  vi.useRealTimers();
});

it("forwards caller cancellation and clears its deadline", async () => {
  vi.useFakeTimers();
  const controller = new AbortController();
  vi.stubGlobal(
    "fetch",
    vi.fn(
      (_path, options: RequestInit) =>
        new Promise((_resolve, reject) => {
          options.signal?.addEventListener(
            "abort",
            () => reject(options.signal?.reason),
            { once: true },
          );
        }),
    ),
  );
  const reason = new DOMException("Selection changed", "AbortError");
  const pending = expect(api.hubs(controller.signal)).rejects.toBe(reason);
  controller.abort(reason);
  await pending;
  expect(vi.getTimerCount()).toBe(0);
  vi.useRealTimers();
});
