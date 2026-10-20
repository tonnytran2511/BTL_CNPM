import test from "node:test";
import assert from "node:assert/strict";
import { prioritizeCharging } from "../apps/api/dist/mobility/charging-priority.js";
const now = Date.parse("2026-10-20T03:00:00Z");
const iso = (min) => new Date(now + min * 60000).toISOString();
const policy = {
  maximumWaitMinutes: 120,
  urgencyWindowMinutes: 60,
  lowBatteryPercent: 25,
};
const item = (id, overrides = {}) => ({
  id,
  createdAt: iso(-5),
  requiredBy: null,
  batteryPercent: 50,
  ...overrides,
});
test("BR-07 long waiting requests lead with FIFO, even ahead of urgent/low battery", () => {
  const rows = [
    item("urgent", { requiredBy: iso(1), batteryPercent: 5 }),
    item("old2", { createdAt: iso(-121) }),
    item("old1", { createdAt: iso(-130) }),
  ];
  assert.deepEqual(
    prioritizeCharging(rows, policy, now).map((r) => r.id),
    ["old1", "old2", "urgent"],
  );
});
test("BR-07 urgency, low battery, deadlines and stable IDs break ties", () => {
  const rows = [
    item("normal"),
    item("low", { batteryPercent: 10 }),
    item("urgent", { requiredBy: iso(20) }),
    item("b"),
    item("a"),
  ];
  assert.deepEqual(
    prioritizeCharging(rows, policy, now).map((r) => r.id),
    ["urgent", "low", "a", "b", "normal"],
  );
});
test("Priority is deterministic and does not mutate caller data", () => {
  const input = [item("b"), item("a")];
  const original = structuredClone(input);
  assert.deepEqual(
    prioritizeCharging(input, policy, now),
    prioritizeCharging(input, policy, now),
  );
  assert.deepEqual(input, original);
});
test("Changing configured urgency and waiting thresholds changes order at the boundary", () => {
  const rows = [
    item("low", { batteryPercent: 5 }),
    item("deadline", { requiredBy: iso(30) }),
  ];
  assert.equal(prioritizeCharging(rows, policy, now)[0].id, "deadline");
  assert.equal(
    prioritizeCharging(rows, { ...policy, urgencyWindowMinutes: 0 }, now)[0].id,
    "low",
  );
});
