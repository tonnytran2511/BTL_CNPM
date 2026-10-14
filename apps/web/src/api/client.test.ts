import { afterEach, expect, it, vi } from "vitest";
import { api, RequestError } from "./client";

afterEach(() => vi.unstubAllGlobals());
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
