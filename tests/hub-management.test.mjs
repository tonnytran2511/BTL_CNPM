import "reflect-metadata";
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { ValidationPipe } from "@nestjs/common";

const { CreateChargingPointDto, CreateHubDto, ParkingCapacityDto } =
  await import("../apps/api/dist/hub-management/hub-management.dto.js");
const { HubManagementService } =
  await import("../apps/api/dist/hub-management/hub-management.service.js");
const hubId = randomUUID();
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
});
const validate = (metatype, value) =>
  pipe.transform(value, { type: "body", metatype });
const status = (code) => (error) => error.getStatus() === code;

function fixture(overrides = {}) {
  const calls = [];
  const client = { marker: "transaction client" };
  const repo = {
    transaction: (work) => work(client),
    lockHub: async () => ({ id: hubId, status: "active" }),
    maximumCapacity: async () => 20,
    capacity: async () => ({ total: 3, protected: 1 }),
    removableSpaces: async (_client, _hub, count) =>
      Array.from({ length: count }, (_, i) => ({ id: `space-${i}` })),
    deleteSpaces: async (_client, ids) => calls.push(["deleteSpaces", ids]),
    spaceCodes: async () => ["P1", "P3"],
    addSpace: async (_client, _hub, code) => calls.push(["addSpace", code]),
    hasOpenIncident: async () => false,
    delete: async () => true,
    hasOpenChargingIncident: async () => false,
    deleteChargingPoint: async () => true,
    create: async (_client, input) => input,
    update: async (_client, id, input) => ({ id, ...input }),
    addChargingPoint: async (_client, id, code) => ({ id, code }),
    ...overrides,
  };
  return { calls, repo, service: new HubManagementService(repo) };
}

test("T35 DTOs validate Hub, capacity and charging point input", async () => {
  const hub = await validate(CreateHubDto, {
    code: "HUB-01",
    name: "  Hub A  ",
    location: "  North gate  ",
  });
  assert.equal(hub.name, "Hub A");
  assert.equal(hub.location, "North gate");
  await assert.rejects(
    validate(CreateHubDto, { code: "HUB-01", name: "  ", location: "x" }),
    status(400),
  );
  await assert.rejects(
    validate(ParkingCapacityDto, { capacity: 1.5 }),
    status(400),
  );
  await assert.rejects(
    validate(ParkingCapacityDto, { capacity: 2, unexpected: true }),
    status(400),
  );
  assert.equal(
    (await validate(CreateChargingPointDto, { code: "C-01" })).code,
    "C-01",
  );
});

test("T35 rejects capacity above persisted configuration or occupied/held resources", async () => {
  await assert.rejects(
    fixture({ maximumCapacity: async () => 4 }).service.setCapacity(hubId, 5),
    status(409),
  );
  const { calls, service } = fixture({
    capacity: async () => ({ total: 3, protected: 2 }),
  });
  await assert.rejects(service.setCapacity(hubId, 1), status(409));
  assert.deepEqual(calls, []);
});

test("T35 reduces only removable spaces and creates unique DB-backed space codes", async () => {
  const reduced = fixture();
  assert.deepEqual(await reduced.service.setCapacity(hubId, 1), {
    hubId,
    capacity: 1,
  });
  assert.deepEqual(reduced.calls, [["deleteSpaces", ["space-0", "space-1"]]]);

  const expanded = fixture();
  await expanded.service.setCapacity(hubId, 5);
  assert.deepEqual(expanded.calls, [
    ["addSpace", "P2"],
    ["addSpace", "P4"],
  ]);
});

test("T35 protects Hub and charging point records with open incidents", async () => {
  await assert.rejects(
    fixture({ hasOpenIncident: async () => true }).service.delete(hubId),
    status(409),
  );
  const { calls, service } = fixture({
    hasOpenChargingIncident: async () => true,
  });
  await assert.rejects(
    service.removeChargingPoint(hubId, randomUUID()),
    status(409),
  );
  assert.deepEqual(calls, []);
});
