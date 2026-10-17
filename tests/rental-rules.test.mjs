import "reflect-metadata";
import test from "node:test";
import assert from "node:assert/strict";
import { ValidationPipe } from "@nestjs/common";
const rules = await import("../apps/api/dist/rental/rental.rules.js");
const { VehicleSearchDto } =
  await import("../apps/api/dist/rental/rental.dto.js");

test("reservation: only active can move, final states never return", () => {
  for (const to of ["cancelled", "expired", "fulfilled"])
    assert.equal(rules.canTransitionReservation("active", to), true);
  for (const from of ["cancelled", "expired", "fulfilled"])
    for (const to of rules.RESERVATION_STATUSES)
      assert.equal(rules.canTransitionReservation(from, to), false);
  assert.equal(rules.canTransitionReservation("active", "active"), false);
});

test("trip: active -> completed only", () => {
  assert.equal(rules.canTransitionTrip("active", "completed"), true);
  assert.equal(rules.canTransitionTrip("completed", "active"), false);
  assert.equal(rules.canTransitionTrip("completed", "completed"), false);
});

test("vehicle status changes follow the rental lifecycle", () => {
  const { VEHICLE_STATUS_BY_EVENT: m } = rules;
  assert.deepEqual(m.reserve, { from: "available", to: "reserved" });
  assert.deepEqual(m.pickup, { from: "reserved", to: "in_use" });
  assert.deepEqual(m.return, { from: "in_use", to: "available" });
  assert.equal(rules.RESERVATION_STATUS_BY_EVENT.pickup, "fulfilled");
  for (const e of Object.values(m)) {
    assert.ok(rules.VEHICLE_STATUSES.includes(e.from));
    assert.ok(rules.VEHICLE_STATUSES.includes(e.to));
  }
});

test("isRentable blocks broken, busy, low-battery and inactive-Hub vehicles", () => {
  const ok = { status: "available", batteryPercent: 50 };
  assert.equal(rules.isRentable(ok, "active", 20), true);
  assert.equal(rules.isRentable(ok, "inactive", 20), false);
  assert.equal(
    rules.isRentable({ ...ok, batteryPercent: 19 }, "active", 20),
    false,
  );
  assert.equal(
    rules.isRentable({ ...ok, batteryPercent: 20 }, "active", 20),
    true,
  );
  for (const status of [
    "reserved",
    "in_use",
    "charging",
    "maintenance",
    "redistributing",
  ])
    assert.equal(rules.isRentable({ ...ok, status }, "active", 20), false);
});

test("user filter can only raise the configured minimum battery", () => {
  assert.equal(rules.effectiveMinimumBattery(20), 20);
  assert.equal(rules.effectiveMinimumBattery(20, 5), 20);
  assert.equal(rules.effectiveMinimumBattery(20, 60), 60);
});

const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
});
const validate = (value) =>
  pipe.transform(value, { type: "query", metatype: VehicleSearchDto });
const status = (code) => (e) => e.getStatus() === code;
test("search DTO converts numbers and rejects bad or unknown input", async () => {
  const ok = await validate({
    type: "electric_bicycle",
    minBatteryPercent: "40",
  });
  assert.equal(ok.minBatteryPercent, 40);
  await assert.rejects(validate({ hubId: "not-a-uuid" }), status(400));
  await assert.rejects(validate({ type: "car" }), status(400));
  await assert.rejects(validate({ minBatteryPercent: "101" }), status(400));
  await assert.rejects(validate({ minBatteryPercent: "-1" }), status(400));
  await assert.rejects(validate({ minBatteryPercent: "abc" }), status(400));
  await assert.rejects(validate({ role: "operator" }), status(400));
});
