import "reflect-metadata";
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { ValidationPipe } from "@nestjs/common";
const { CreateChargingDto, RegisterVehicleDto, ReserveParkingDto } =
  await import("../apps/api/dist/mobility/mobility.dto.js");
const { MobilityService } =
  await import("../apps/api/dist/mobility/mobility.service.js");
const user = {
  id: randomUUID(),
  email: "owner@example.test",
  name: "Owner",
  role: "student",
};
const hubId = randomUUID(),
  privateVehicleId = randomUUID();
const window = {
  hubId,
  privateVehicleId,
  startsAt: new Date(Date.now() + 3600000).toISOString(),
  endsAt: new Date(Date.now() + 7200000).toISOString(),
};
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
});
const validate = (metatype, value) =>
  pipe.transform(value, { type: "body", metatype });
const status = (code) => (e) => e.getStatus() === code;
test("Mobility DTO rejects missing nested vehicle, spoofed owner, invalid pin and time without timezone", async () => {
  await assert.rejects(
    validate(CreateChargingDto, { hubId, targetBatteryPercent: 80 }),
    status(400),
  );
  await assert.rejects(
    validate(CreateChargingDto, {
      hubId,
      vehicle: null,
      targetBatteryPercent: 80,
    }),
    status(400),
  );
  await assert.rejects(
    validate(CreateChargingDto, {
      hubId,
      vehicle: { kind: "private", id: privateVehicleId, ownerId: user.id },
      targetBatteryPercent: 80,
    }),
    status(400),
  );
  await assert.rejects(
    validate(RegisterVehicleDto, {
      code: "XE-01",
      type: "electric_bicycle",
      batteryPercent: 101,
    }),
    status(400),
  );
  await assert.rejects(
    validate(RegisterVehicleDto, {
      code: "   ",
      type: "electric_bicycle",
      batteryPercent: 30,
    }),
    status(400),
  );
  await assert.rejects(
    validate(ReserveParkingDto, {
      ...window,
      startsAt: window.startsAt.replace("Z", ""),
    }),
    status(400),
  );
  assert.equal((await validate(ReserveParkingDto, window)).hubId, hubId);
});
function fixture(overrides = {}) {
  const client = { marker: "transaction client" };
  const repo = {
    transaction: (work) => work(client),
    idempotent: async (c, a, o, k, p, work) => ({
      conflict: false,
      result: await work(),
    }),
    activeHub: async () => ({ id: hubId, status: "active" }),
    setting: async () => 1440,
    privateVehicle: async () => ({
      id: privateVehicleId,
      owner_id: user.id,
      battery_percent: 20,
    }),
    privateLocation: async () => 1,
    available: async () => [{ id: randomUUID() }],
    reserve: async () => ({ status: "reserved" }),
    charge: async () => ({ status: "queued" }),
    ...overrides,
  };
  return { repo, client, service: new MobilityService(repo) };
}
test("Parking service enforces ownership, configured duration, active Hub and capacity", async () => {
  await assert.rejects(fixture().service.reserve(user, window), status(400));
  await assert.rejects(
    fixture({
      privateVehicle: async () => ({ owner_id: randomUUID() }),
    }).service.reserve(user, window, "key"),
    status(403),
  );
  await assert.rejects(
    fixture({ setting: async () => null }).service.reserve(user, window, "key"),
    status(500),
  );
  await assert.rejects(
    fixture({ setting: async () => 30 }).service.reserve(user, window, "key"),
    status(400),
  );
  await assert.rejects(
    fixture({
      activeHub: async () => ({ status: "inactive" }),
    }).service.reserve(user, window, "key"),
    status(409),
  );
  await assert.rejects(
    fixture({ available: async () => [] }).service.reserve(user, window, "key"),
    status(409),
  );
  assert.equal(
    (await fixture().service.reserve(user, window, "key")).status,
    "reserved",
  );
});
test("Charging requires ownership, physical presence and a higher target; students cannot charge rental vehicles", async () => {
  const body = {
    hubId,
    vehicle: { kind: "private", id: privateVehicleId },
    targetBatteryPercent: 80,
  };
  await assert.rejects(
    fixture({ privateLocation: async () => 0 }).service.charge(
      user,
      body,
      "key",
    ),
    status(409),
  );
  await assert.rejects(
    fixture({
      privateVehicle: async () => ({ owner_id: randomUUID() }),
    }).service.charge(user, body, "key"),
    status(403),
  );
  await assert.rejects(
    fixture().service.charge(
      user,
      { ...body, targetBatteryPercent: 20 },
      "key",
    ),
    status(400),
  );
  await assert.rejects(
    fixture({
      privateVehicle: async () => ({
        id: privateVehicleId,
        owner_id: user.id,
        battery_percent: null,
      }),
    }).service.charge(user, body, "key"),
    status(409),
  );
  await assert.rejects(
    fixture().service.charge(
      user,
      { ...body, vehicle: { kind: "rental", id: randomUUID() } },
      "key",
    ),
    status(403),
  );
  assert.equal(
    (await fixture().service.charge(user, body, "key")).status,
    "queued",
  );
});
test("Allocation reuses the caller transaction and rejects missing source or full target", async () => {
  const { service, client } = fixture({
    releaseRental: async (c) => {
      assert.equal(c, client);
      return 1;
    },
    claimRental: async (c) => {
      assert.equal(c, client);
      return "space";
    },
  });
  await service.releaseRentalVehicleSpace("vehicle", hubId, client);
  assert.deepEqual(
    await service.claimRentalVehicleSpace("vehicle", hubId, client),
    { parkingSpaceId: "space" },
  );
  await assert.rejects(
    fixture({ releaseRental: async () => 0 }).service.releaseRentalVehicleSpace(
      "vehicle",
      hubId,
      client,
    ),
    status(409),
  );
  await assert.rejects(
    fixture({ claimRental: async () => null }).service.claimRentalVehicleSpace(
      "vehicle",
      hubId,
      client,
    ),
    status(409),
  );
});
