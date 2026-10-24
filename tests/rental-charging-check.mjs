import { MobilityRepository } from "../apps/api/dist/mobility/mobility.repository.js";
import { ChargingWorkflowRepository } from "../apps/api/dist/mobility/charging-workflow.repository.js";
import { ChargingWorkflowService } from "../apps/api/dist/mobility/charging-workflow.service.js";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import "reflect-metadata";
import { Database } from "../apps/api/dist/database/database.module.js";
import { RentalRepository } from "../apps/api/dist/rental/rental.repository.js";
import { RentalService } from "../apps/api/dist/rental/rental.service.js";
import { RentalChargingService } from "../apps/api/dist/rental/rental-charging.service.js";
import { ChargingAllocationRepository } from "../apps/api/dist/mobility/charging-allocation.repository.js";
import { ChargingAllocationService } from "../apps/api/dist/mobility/charging-allocation.service.js";
const db = new Database(),
  repo = new RentalRepository(db),
  rental = new RentalChargingService(repo),
  fleet = new RentalService(repo);
const base = `http://127.0.0.1:${process.env.API_PORT}/api`,
  hubs = [],
  cars = [],
  keys = [];
const key = () => {
  const v = randomUUID();
  keys.push(v);
  return v;
};
async function call(path, cookie, body, k) {
  const response = await fetch(base + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: process.env.WEB_ORIGIN,
      ...(cookie ? { Cookie: cookie } : {}),
      ...(k ? { "Idempotency-Key": k } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return {
    status: response.status,
    body: await response.json(),
    cookie: response.headers.get("set-cookie")?.split(";")[0],
  };
}
const login = (role) =>
  call("/auth/login", undefined, {
    email: process.env[`SEED_${role}_EMAIL`],
    password: process.env[`SEED_${role}_PASSWORD`],
  });
let op, student, actor;
async function fixture() {
  const h = (
    await db.query(
      "INSERT INTO hubs(code,name,location) VALUES($1,'Rental charging test','isolated') RETURNING id",
      [randomUUID()],
    )
  ).rows[0].id;
  hubs.push(h);
  const v = (
    await db.query(
      "INSERT INTO vehicles(hub_id,code,type,status,battery_percent) VALUES($1,$2,'electric_bicycle','available',30) RETURNING id",
      [h, randomUUID()],
    )
  ).rows[0].id;
  cars.push(v);
  const p = (
    await db.query(
      "INSERT INTO charging_points(hub_id,code) VALUES($1,'C1') RETURNING id",
      [h],
    )
  ).rows[0].id;
  await db.query(
    "INSERT INTO parking_spaces(hub_id,code,status,vehicle_id) VALUES($1,'P1','occupied',$2)",
    [h, v],
  );
  return { h, v, p };
}
const request = (f, cookie = op, k = key(), target = 80) =>
  call(
    "/mobility/charging/requests",
    cookie,
    {
      hubId: f.h,
      vehicle: { kind: "rental", id: f.v },
      targetBatteryPercent: target,
    },
    k,
  );
const schedule = (f, k = key()) =>
  call("/mobility/charging/schedule", op, { hubId: f.h }, k);
const action = (id, type, body = {}, k = key()) =>
  call(`/mobility/charging/sessions/${id}/${type}`, op, body, k);
const state = async (f) =>
  (
    await db.query("SELECT status,battery_percent FROM vehicles WHERE id=$1", [
      f.v,
    ])
  ).rows[0];
const verify = (res, code) =>
  assert.equal(res.status, code, JSON.stringify(res.body));
try {
  const o = await login("OPERATOR"),
    s = await login("STUDENT");
  verify(o, 201);
  verify(s, 201);
  op = o.cookie;
  student = s.cookie;
  actor = o.body;
  // Existing rental eligibility, actual parking and server-side authorization apply to charging requests.
  const invalid = await fixture();
  verify(await request(invalid, student), 403);
  verify(await request(invalid, op, key(), 30), 400);
  for (const status of [
    "reserved",
    "in_use",
    "charging",
    "maintenance",
    "redistributing",
  ]) {
    await db.query("UPDATE vehicles SET status=$2 WHERE id=$1", [
      invalid.v,
      status,
    ]);
    verify(await request(invalid), 409);
  }
  await db.query("UPDATE vehicles SET status='available' WHERE id=$1", [
    invalid.v,
  ]);
  await db.query(
    "UPDATE parking_spaces SET status='available',vehicle_id=NULL WHERE vehicle_id=$1",
    [invalid.v],
  );
  verify(await request(invalid), 409);
  await db.query(
    "UPDATE parking_spaces SET status='occupied',vehicle_id=$2 WHERE hub_id=$1",
    [invalid.h, invalid.v],
  );
  const reservation = (
    await db.query(
      "INSERT INTO vehicle_reservations(user_id,vehicle_id,source_hub_id,expires_at) VALUES($1,$2,$3,now()+interval '10 minutes') RETURNING id",
      [s.body.id, invalid.v, invalid.h],
    )
  ).rows[0].id;
  verify(await request(invalid), 409);
  await db.query(
    "UPDATE vehicle_reservations SET status='fulfilled',closed_at=now() WHERE id=$1",
    [reservation],
  );
  await db.query(
    "INSERT INTO trips(reservation_id,user_id,vehicle_id,source_hub_id,start_battery_percent) VALUES($1,$2,$3,$4,30)",
    [reservation, s.body.id, invalid.v, invalid.h],
  );
  verify(await request(invalid), 409);

  const f = await fixture(),
    rk = key(),
    queued = await request(f, op, rk);
  verify(queued, 201);
  assert.deepEqual((await request(f, op, rk)).body, queued.body);
  const overview = await call("/mobility/charging/overview", op);
  verify(overview, 200);
  assert.ok(
    overview.body.queue.some(
      (q) => q.id === queued.body.id && q.vehicleKind === "rental",
    ),
  );
  assert.equal((await state(f)).status, "available");
  const sk = key(),
    scheduled = await schedule(f, sk);
  verify(scheduled, 201);
  assert.deepEqual((await schedule(f, sk)).body, scheduled.body);
  const id = scheduled.body.sessions[0].id;
  assert.equal((await state(f)).status, "charging");
  verify(await call("/vehicle-reservations", student, { vehicleId: f.v }), 409);
  await assert.rejects(
    db.transaction((c) => fleet.startRedistributionVehicles(c, [f.v], f.h)),
    (e) => e.getStatus?.() === 409,
  );
  verify(await action(id, "start"), 201);
  const endKey = key(),
    done = await action(id, "complete", { achievedBatteryPercent: 80 }, endKey);
  verify(done, 201);
  assert.equal(done.body.vehicleKind, "rental");
  assert.deepEqual(
    (await action(id, "complete", { achievedBatteryPercent: 80 }, endKey)).body,
    done.body,
  );
  assert.deepEqual(await state(f), {
    status: "available",
    battery_percent: 80,
  });
  const search = await call("/vehicles", student);
  verify(search, 200);
  assert.ok(search.body.vehicles.some((v) => v.id === f.v));

  // Scheduled cancellation retains pin; charging cancellation records observed pin. Low pin still fails rental's configured threshold.
  const cancel = await fixture();
  verify(await request(cancel), 201);
  const cancelId = (await schedule(cancel)).body.sessions[0].id;
  verify(await action(cancelId, "cancel"), 201);
  assert.deepEqual(await state(cancel), {
    status: "available",
    battery_percent: 30,
  });
  verify(await request(cancel), 201);
  const running = (await schedule(cancel)).body.sessions[0].id;
  verify(await action(running, "start"), 201);
  const oldMinimum = (
    await db.query(
      "SELECT value FROM settings WHERE key='minimumRentalBatteryPercent'",
    )
  ).rows[0].value;
  try {
    await db.query(
      "UPDATE settings SET value='60'::jsonb WHERE key='minimumRentalBatteryPercent'",
    );
    verify(
      await action(running, "cancel", { achievedBatteryPercent: 35 }),
      201,
    );
    assert.deepEqual(await state(cancel), {
      status: "available",
      battery_percent: 35,
    });
    verify(
      await call("/vehicle-reservations", student, { vehicleId: cancel.v }),
      409,
    );
  } finally {
    await db.query(
      "UPDATE settings SET value=$1::jsonb WHERE key='minimumRentalBatteryPercent'",
      [JSON.stringify(oldMinimum)],
    );
  }

  // Allocation failure rolls fleet state, request, point and session back together.
  const rollback = await fixture(),
    rr = await request(rollback);
  verify(rr, 201);
  const brokenRepo = new ChargingAllocationRepository();
  brokenRepo.createSession = async () => {
    throw new Error("injected session failure");
  };
  const allocator = new ChargingAllocationService(brokenRepo, rental);
  await assert.rejects(
    db.transaction((c) =>
      allocator.allocateRentalRequest(actor, rr.body.id, rollback.p, c),
    ),
    /injected session failure/,
  );
  assert.equal((await state(rollback)).status, "available");
  assert.equal(
    (
      await db.query("SELECT status FROM charging_points WHERE id=$1", [
        rollback.p,
      ])
    ).rows[0].status,
    "available",
  );
  assert.equal(
    (
      await db.query("SELECT status FROM charging_requests WHERE id=$1", [
        rr.body.id,
      ])
    ).rows[0].status,
    "queued",
  );
  verify(
    await call(
      `/mobility/charging/requests/${rr.body.id}/cancel`,
      op,
      {},
      key(),
    ),
    201,
  );

  // A failure after the rental release also rolls the entire completion back, and its key remains retryable.
  const finishFail = await fixture();
  verify(await request(finishFail), 201);
  const finishId = (await schedule(finishFail)).body.sessions[0].id;
  verify(await action(finishId, "start"), 201);
  const brokenRental = new RentalChargingService(repo);
  brokenRental.release = async (...args) => {
    await rental.release(...args);
    throw new Error("injected release failure");
  };
  const workflow = new ChargingWorkflowService(
    new MobilityRepository(db),
    new ChargingWorkflowRepository(),
    new ChargingAllocationService(new ChargingAllocationRepository(), rental),
    brokenRental,
  );
  const retryKey = key();
  await assert.rejects(
    workflow.transition(actor, finishId, "complete", 80, retryKey),
    /injected release failure/,
  );
  assert.deepEqual(await state(finishFail), {
    status: "charging",
    battery_percent: 30,
  });
  assert.equal(
    (
      await db.query("SELECT status FROM charging_sessions WHERE id=$1", [
        finishId,
      ])
    ).rows[0].status,
    "charging",
  );
  assert.equal(
    (
      await db.query("SELECT status FROM charging_points WHERE id=$1", [
        finishFail.p,
      ])
    ).rows[0].status,
    "occupied",
  );
  verify(
    await action(
      finishId,
      "complete",
      { achievedBatteryPercent: 80 },
      retryKey,
    ),
    201,
  );
  // Holding the same fleet row makes reservation vs charging and redistribution vs charging mutually exclusive.
  for (const type of ["reservation", "redistribution"]) {
    const race = await fixture(),
      q = await request(race);
    verify(q, 201);
    const allocation = new ChargingAllocationService(
      new ChargingAllocationRepository(),
      rental,
    );
    const work =
      type === "reservation"
        ? call("/vehicle-reservations", student, { vehicleId: race.v })
        : db.transaction((c) =>
            fleet.startRedistributionVehicles(c, [race.v], race.h),
          );
    const results = await Promise.allSettled([
      db.transaction((c) =>
        allocation.allocateRentalRequest(actor, q.body.id, race.p, c),
      ),
      work,
    ]);
    const charged = results[0].status === "fulfilled";
    if (type === "reservation") {
      assert.equal(results[1].status, "fulfilled");
      assert.equal(results[1].value.status, charged ? 409 : 201);
    } else assert.equal(results[1].status, charged ? "rejected" : "fulfilled");
    assert.equal(
      (await state(race)).status,
      charged
        ? "charging"
        : type === "reservation"
          ? "reserved"
          : "redistributing",
    );
  }
  // Completing vs cancelling concurrently must not release or update the fleet twice.
  const terminal = await fixture();
  verify(await request(terminal), 201);
  const tid = (await schedule(terminal)).body.sessions[0].id;
  verify(await action(tid, "start"), 201);
  const ends = await Promise.all([
    action(tid, "complete", { achievedBatteryPercent: 80 }),
    action(tid, "cancel", { achievedBatteryPercent: 40 }),
  ]);
  assert.deepEqual(ends.map((v) => v.status).sort(), [201, 409]);
  assert.deepEqual(await state(terminal), {
    status: "available",
    battery_percent: ends[0].status === 201 ? 80 : 40,
  });
  // A queued request can be explicitly cancelled after another workflow changes the vehicle state.
  const stale = await fixture(),
    sq = await request(stale);
  verify(sq, 201);
  verify(
    await call("/vehicle-reservations", student, { vehicleId: stale.v }),
    201,
  );
  const overview2 = await call("/mobility/charging/overview", op);
  assert.ok(overview2.body.rentalPending.some((q) => q.id === sq.body.id));
  assert.ok(!overview2.body.queue.some((q) => q.id === sq.body.id));
  verify(
    await call(
      `/mobility/charging/requests/${sq.body.id}/cancel`,
      op,
      {},
      key(),
    ),
    201,
  );
  assert.equal((await state(stale)).status, "reserved");
  console.log(
    "Rental charging integration: role, location, busy state, queue, sessions, low-pin rental policy, rollback, idempotency and races passed.",
  );
} finally {
  await db.query(
    "DELETE FROM charging_sessions WHERE request_id IN (SELECT id FROM charging_requests WHERE hub_id=ANY($1::uuid[]))",
    [hubs],
  );
  await db.query("DELETE FROM charging_requests WHERE hub_id=ANY($1::uuid[])", [
    hubs,
  ]);
  await db.query("DELETE FROM trips WHERE vehicle_id=ANY($1::uuid[])", [cars]);
  await db.query(
    "DELETE FROM vehicle_reservations WHERE vehicle_id=ANY($1::uuid[])",
    [cars],
  );
  await db.query("DELETE FROM parking_spaces WHERE hub_id=ANY($1::uuid[])", [
    hubs,
  ]);
  await db.query("DELETE FROM charging_points WHERE hub_id=ANY($1::uuid[])", [
    hubs,
  ]);
  await db.query("DELETE FROM vehicles WHERE id=ANY($1::uuid[])", [cars]);
  await db.query("DELETE FROM hubs WHERE id=ANY($1::uuid[])", [hubs]);
  await db.query("DELETE FROM mobility_idempotency WHERE key=ANY($1::text[])", [
    keys,
  ]);
  await db.onModuleDestroy();
}
