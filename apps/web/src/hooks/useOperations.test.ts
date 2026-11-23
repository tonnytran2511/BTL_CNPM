import { act, cleanup, renderHook } from "@testing-library/react";
import type { User } from "@emobility/contracts";
import { afterEach, expect, it, vi } from "vitest";
import { api, RequestError } from "../api/client";
import { useOperations } from "./useOperations";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

it("T38 keeps an action conflict visible across polling until the operator refreshes", async () => {
  vi.useFakeTimers();
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  const operator: User = {
    id: "operator",
    name: "Operator",
    email: "operator@example.test",
    role: "operator",
  };
  vi.spyOn(api, "me").mockResolvedValue(operator);
  const hubs = vi.spyOn(api, "hubs").mockResolvedValue([]);
  vi.spyOn(api, "incidents").mockResolvedValue([]);
  vi.spyOn(api, "redistributions").mockResolvedValue([]);
  vi.spyOn(api, "operationLog").mockResolvedValue([]);
  const completion = vi.spyOn(api, "completeRedistribution");
  completion.mockRejectedValue(
    new RequestError("Hub đích không còn chỗ đỗ.", 409),
  );
  const onSessionExpired = vi.fn();
  const onAccessRevoked = vi.fn();
  const { result } = renderHook(() =>
    useOperations(operator, true, 3000, onSessionExpired, onAccessRevoked),
  );
  await act(async () => {});
  await act(async () => result.current.completeRedistribution("order"));
  expect(result.current.error).toBe("Hub đích không còn chỗ đỗ.");

  await act(async () => vi.advanceTimersByTimeAsync(3000));
  expect(hubs).toHaveBeenCalledTimes(2);
  expect(result.current.error).toBe("Hub đích không còn chỗ đỗ.");
  expect(completion).toHaveBeenCalledTimes(1);

  await act(async () => result.current.refresh());
  expect(result.current.error).toBe("");
});
