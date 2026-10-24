import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import "reflect-metadata";
import { Database } from "../apps/api/dist/database/database.module.js";
import { MobilityRepository } from "../apps/api/dist/mobility/mobility.repository.js";
import { ChargingWorkflowRepository } from "../apps/api/dist/mobility/charging-workflow.repository.js";
import { ChargingFailureRepository } from "../apps/api/dist/mobility/charging-failure.repository.js";
import { ChargingFailureService } from "../apps/api/dist/mobility/charging-failure.service.js";
import { RentalRepository } from "../apps/api/dist/rental/rental.repository.js";
import { RentalChargingService } from "../apps/api/dist/rental/rental-charging.service.js";
import { OperationsRepository } from "../apps/api/dist/operations/operations.repository.js";
import { ChargingIncidentService } from "../apps/api/dist/operations/charging-incident.service.js";
const db = new Database(),
  mobility = new MobilityRepository(db),
  workflow = new ChargingWorkflowRepository(),
  failureRepo = new ChargingFailureRepository();
const rental = new RentalChargingService(new RentalRepository(db)),
  records = new ChargingIncidentService(new OperationsRepository(db));
const base = `http://127.0.0.1:${process.env.API_PORT}/api`,
  hubs = [],
  points = [],
  privateCars = [],
  fleet = [],
  keys = [];
const key = () => {
  const k = randomUUID();
  keys.push(k);
  return k;
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
const ok = (r, status = 201) =>
  assert.equal(r.status, status, JSON.stringify(r.body));
let op, student, actor, owner;
const path = (p) => `/mobility/charging/points/${p}`;
const fail = (f, body = {}, k = key()) =>
  call(
    path(f.point) + "/fail",
    op,
    { description: "Test cổng mất điện", ...body },
    k,
  );
const recover = (f, k = key()) => call(path(f.point) + "/recover", op, {}, k);
const schedule = (f) =>
  call("/mobility/charging/schedule", op, { hubId: f.hub }, key());
const action = (session, operation, body = {}) =>
  call(`/mobility/charging/sessions/${session}/${operation}`, op, body, key());
async function fixture(kind = "private", target = 80) {
  const hub = (
    await db.query(
      "INSERT INTO hubs(code,name,location) VALUES($1,'T20 fixture','isolated') RETURNING id",
      [randomUUID()],
    )
  ).rows[0].id;
  hubs.push(hub);
  const point = (
    await db.query(
      "INSERT INTO charging_points(hub_id,code) VALUES($1,'C1') RETURNING id",
      [hub],
    )
  ).rows[0].id;
  points.push(point);
  const vehicle =
    kind === "private"
      ? (
          await db.query(
            "INSERT INTO private_vehicles(owner_id,code,type,battery_percent) VALUES($1,$2,'electric_bicycle',30) RETURNING id",
            [owner, randomUUID()],
          )
        ).rows[0].id
      : (
          await db.query(
            "INSERT INTO vehicles(hub_id,code,type,status,battery_percent) VALUES($1,$2,'electric_bicycle','available',30) RETURNING id",
            [hub, randomUUID()],
          )
        ).rows[0].id;
  (kind === "private" ? privateCars : fleet).push(vehicle);
  await db.query(
    `INSERT INTO parking_spaces(hub_id,code,status,${kind === "private" ? "private_vehicle_id" : "vehicle_id"}) VALUES($1,'P1','occupied',$2)`,
    [hub, vehicle],
  );
  const queued = await call(
    "/mobility/charging/requests",
    kind === "private" ? student : op,
    {
      hubId: hub,
      vehicle: { kind, id: vehicle },
      targetBatteryPercent: target,
    },
    key(),
  );
  ok(queued);
  return { hub, point, vehicle, kind, request: queued.body.id };
}
const scheduled = async (f) => {
  const res = await schedule(f);
  ok(res);
  assert.equal(res.body.sessions.length, 1);
  return res.body.sessions[0].id;
};
const state = async (f) =>
  (
    await db.query(
      `SELECT r.status AS request_status,r.created_at,(SELECT status FROM charging_points WHERE id=$2) AS point_status,
 (SELECT count(*)::integer FROM charging_sessions s WHERE s.request_id=r.id AND s.status IN ('scheduled','charging')) AS active,
 (SELECT battery_percent FROM ${f.kind === "private" ? "private_vehicles" : "vehicles"} WHERE id=$3) AS pin
 FROM charging_requests r WHERE r.id=$1`,
      [f.request, f.point, f.vehicle],
    )
  ).rows[0];
try {
  const o = await call("/auth/login", undefined, {
    email: process.env.SEED_OPERATOR_EMAIL,
    password: process.env.SEED_OPERATOR_PASSWORD,
  });
  ok(o);
  op = o.cookie;
  actor = o.body;
  const u = await call("/auth/login", undefined, {
    email: process.env.SEED_STUDENT_EMAIL,
    password: process.env.SEED_STUDENT_PASSWORD,
  });
  ok(u);
  student = u.cookie;
  owner = u.body.id;
  ok(await call("/mobility/charging/points"), 401);
  ok(await call("/mobility/charging/points", student), 403);
  const idle = await fixture();
  ok(
    await call(
      path(idle.point) + "/fail",
      student,
      { description: "test" },
      key(),
    ),
    403,
  );
  ok(await call(path(idle.point) + "/fail", op, { description: "test" }), 400);
  ok(await fail(idle, { description: "  " }), 400);
  ok(await fail(idle, { achievedBatteryPercent: 101 }), 400);
  const idleKey = key(),
    idleFail = await fail(idle, {}, idleKey);
  ok(idleFail);
  assert.deepEqual((await fail(idle, {}, idleKey)).body, idleFail.body);
  ok(await fail(idle, { description: "Khác nội dung" }, idleKey), 409);
  ok(await fail(idle));
  assert.equal(
    (
      await db.query(
        "SELECT count(*)::integer AS n FROM incidents WHERE resource_id=$1 AND status='open'",
        [idle.point],
      )
    ).rows[0].n,
    1,
  );
  assert.equal((await schedule(idle)).body.sessions.length, 0);
  const repairKey = key(),
    repaired = await recover(idle, repairKey);
  ok(repaired);
  assert.deepEqual((await recover(idle, repairKey)).body, repaired.body);
  ok(await recover(idle), 409);
  assert.equal((await state(idle)).request_status, "queued");

  // Scheduled sessions are interrupted without fabricating battery progress; same request and waiting timestamp survive.
  const waiting = await fixture(),
    sid = await scheduled(waiting),
    before = await state(waiting);
  const stopped = await fail(waiting, { sessionId: sid });
  ok(stopped);
  assert.equal(stopped.body.interruptedSessionId, sid);
  const after = await state(waiting);
  assert.equal(after.pin, 30);
  assert.equal(after.point_status, "failed");
  assert.equal(after.request_status, "queued");
  assert.equal(after.active, 0);
  assert.equal(+after.created_at, +before.created_at);
  assert.equal(
    (await db.query("SELECT status FROM charging_sessions WHERE id=$1", [sid]))
      .rows[0].status,
    "interrupted",
  );
  const spare = (
    await db.query(
      "INSERT INTO charging_points(hub_id,code) VALUES($1,'C2') RETURNING id",
      [waiting.hub],
    )
  ).rows[0].id;
  points.push(spare);
  const next = await schedule(waiting);
  ok(next);
  assert.equal(next.body.sessions[0].requestId, waiting.request);
  assert.equal(next.body.sessions[0].chargingPointId, spare);
  assert.notEqual(next.body.sessions[0].id, sid);
  assert.equal((await state(waiting)).active, 1);
  ok(await action(sid, "start"), 409);

  // Running private/fleet sessions need a matching session and observed pin; generic incidents use the same atomic workflow.
  for (const kind of ["private", "rental"]) {
    const f = await fixture(kind),
      session = await scheduled(f);
    ok(await action(session, "start"));
    ok(await fail(f, { sessionId: session }), 400);
    ok(
      await fail(f, { sessionId: randomUUID(), achievedBatteryPercent: 50 }),
      409,
    );
    ok(await fail(f, { sessionId: session, achievedBatteryPercent: 20 }), 400);
    assert.equal((await state(f)).active, 1);
    const failed = await call(
      "/incidents",
      op,
      {
        resourceType: "charging_point",
        resourceId: f.point,
        description: "Mất điện tại cổng",
        sessionId: session,
        achievedBatteryPercent: 50,
      },
      key(),
    );
    ok(failed);
    const final = await state(f);
    assert.equal(final.pin, 50);
    assert.equal(final.point_status, "failed");
    assert.equal(final.request_status, "queued");
    assert.equal(final.active, 0);
    if (kind === "rental")
      assert.equal(
        (await db.query("SELECT status FROM vehicles WHERE id=$1", [f.vehicle]))
          .rows[0].status,
        "available",
      );
    const resolved = await call(`/incidents/${failed.body.id}/resolve`, op, {});
    ok(resolved);
    assert.equal((await state(f)).point_status, "available");
    ok(await call(`/incidents/${failed.body.id}/resolve`, op, {}), 409);
    const audit = (
      await db.query(
        "SELECT action,actor_id,from_status,to_status FROM operation_logs WHERE command_type='incident' AND command_id=$1 ORDER BY occurred_at,id",
        [failed.body.id],
      )
    ).rows;
    assert.equal(
      audit.length,
      2,
      "create and resolve are logged exactly once, including rejected replay",
    );
    assert.deepEqual(
      audit.find((entry) => entry.action === "resolved"),
      {
        action: "resolved",
        actor_id: actor.id,
        from_status: "open",
        to_status: "resolved",
      },
    );
  }
  const target = await fixture(),
    targetSession = await scheduled(target);
  ok(await action(targetSession, "start"));
  ok(
    await fail(target, {
      sessionId: targetSession,
      achievedBatteryPercent: 80,
    }),
  );
  assert.equal((await state(target)).request_status, "fulfilled");
  assert.equal(
    (
      await db.query("SELECT status FROM charging_sessions WHERE id=$1", [
        targetSession,
      ])
    ).rows[0].status,
    "interrupted",
  );

  // A late failure still rolls back the pin, fleet status, request, session, point, incident and idempotency record.
  const rollback = await fixture("rental"),
    rollbackSession = await scheduled(rollback);
  ok(await action(rollbackSession, "start"));
  const broken = new ChargingIncidentService(new OperationsRepository(db));
  broken.record = async (...args) => {
    await records.record(...args);
    throw new Error("injected incident write failure");
  };
  const service = new ChargingFailureService(
      mobility,
      workflow,
      failureRepo,
      rental,
      broken,
    ),
    rollbackKey = key();
  await assert.rejects(
    service.report(
      actor.id,
      rollback.point,
      {
        description: "rollback",
        sessionId: rollbackSession,
        achievedBatteryPercent: 50,
      },
      rollbackKey,
    ),
    /injected incident write failure/,
  );
  const unchanged = await state(rollback);
  assert.equal(unchanged.pin, 30);
  assert.equal(unchanged.active, 1);
  assert.equal(unchanged.point_status, "occupied");
  assert.equal(unchanged.request_status, "allocated");
  assert.equal(
    (
      await db.query(
        "SELECT count(*)::integer AS n FROM incidents WHERE resource_id=$1",
        [rollback.point],
      )
    ).rows[0].n,
    0,
  );
  assert.equal(
    (
      await db.query("SELECT status FROM vehicles WHERE id=$1", [
        rollback.vehicle,
      ])
    ).rows[0].status,
    "charging",
  );
  ok(
    await fail(
      rollback,
      {
        description: "rollback",
        sessionId: rollbackSession,
        achievedBatteryPercent: 50,
      },
      rollbackKey,
    ),
  );
  const brokenRecovery = new ChargingIncidentService(
    new OperationsRepository(db),
  );
  brokenRecovery.resolve = async (...args) => {
    await records.resolve(...args);
    throw new Error("injected repair failure");
  };
  const recoveryService = new ChargingFailureService(
    mobility,
    workflow,
    failureRepo,
    rental,
    brokenRecovery,
  );
  await assert.rejects(
    recoveryService.recover(actor.id, rollback.point, key()),
    /injected repair failure/,
  );
  assert.equal((await state(rollback)).point_status, "failed");
  assert.equal(
    (
      await db.query("SELECT status FROM incidents WHERE resource_id=$1", [
        rollback.point,
      ])
    ).rows[0].status,
    "open",
  );
  ok(await recover(rollback));

  // Legacy unresolved incident rows also block allocation and start, even if a stale point still says available/occupied.
  const legacy = await fixture();
  await db.query(
    "INSERT INTO incidents(resource_type,resource_id,description,reported_by) VALUES('charging_point',$1,'legacy',$2)",
    [legacy.point, actor.id],
  );
  ok(await schedule(legacy), 409);
  assert.equal((await state(legacy)).active, 0);
  ok(await fail(legacy));
  ok(await recover(legacy));
  const legacySession = await scheduled(legacy);
  await db.query(
    "INSERT INTO incidents(resource_type,resource_id,description,reported_by) VALUES('charging_point',$1,'legacy2',$2)",
    [legacy.point, actor.id],
  );
  ok(await action(legacySession, "start"), 409);
  ok(await fail(legacy, { sessionId: legacySession }));
  ok(await recover(legacy));

  // Allocation vs failure is serialized; no active session remains on a failed point in either ordering.
  for (let i = 0; i < 5; i++) {
    const f = await fixture(i % 2 ? "rental" : "private");
    const race = await Promise.all([schedule(f), fail(f)]);
    race.forEach((res) => ok(res));
    const end = await state(f);
    assert.equal(end.point_status, "failed");
    assert.equal(end.active, 0);
    assert.equal(end.request_status, "queued");
  }
  // If completion wins, a stale failure snapshot is refused; retry without a session still fails the idle point, never overwriting completed pin.
  for (let i = 0; i < 3; i++) {
    const f = await fixture(i % 2 ? "rental" : "private"),
      session = await scheduled(f);
    ok(await action(session, "start"));
    const race = await Promise.all([
      fail(f, { sessionId: session, achievedBatteryPercent: 50 }),
      action(session, "complete", { achievedBatteryPercent: 80 }),
    ]);
    assert.deepEqual(race.map((v) => v.status).sort(), [201, 409]);
    const end = await state(f);
    assert.equal(end.pin, race[0].status === 201 ? 50 : 80);
    assert.equal(end.active, 0);
    if (race[1].status === 201) {
      ok(await fail(f));
      assert.equal((await state(f)).pin, 80);
    }
  }
  const deletion = await fixture();
  const deletionRace = await Promise.all([
    fail(deletion),
    fetch(base + `/hubs/${deletion.hub}/charging-points/${deletion.point}`, {
      method: "DELETE",
      headers: { Cookie: op, Origin: process.env.WEB_ORIGIN },
    }).then(async (res) => ({ status: res.status, body: await res.json() })),
  ]);
  assert.equal(
    deletionRace.filter((v) => v.status >= 200 && v.status < 300).length,
    1,
  );
  assert.ok(
    deletionRace.every((v) => [200, 201, 404, 409].includes(v.status)),
    JSON.stringify(deletionRace),
  );
  console.log(
    "T20: authorization, pin/session validation, legacy APIs, replay, preserved waiting time, reallocation, reached target, complete/fail/delete races and full rollback passed.",
  );
} finally {
  await db.query(
    "DELETE FROM charging_sessions WHERE request_id IN (SELECT id FROM charging_requests WHERE hub_id=ANY($1::uuid[]))",
    [hubs],
  );
  await db.query("DELETE FROM charging_requests WHERE hub_id=ANY($1::uuid[])", [
    hubs,
  ]);
  await db.query(
    "DELETE FROM incidents WHERE resource_type='charging_point' AND resource_id=ANY($1::uuid[])",
    [points],
  );
  await db.query("DELETE FROM parking_spaces WHERE hub_id=ANY($1::uuid[])", [
    hubs,
  ]);
  await db.query("DELETE FROM charging_points WHERE hub_id=ANY($1::uuid[])", [
    hubs,
  ]);
  await db.query("DELETE FROM private_vehicles WHERE id=ANY($1::uuid[])", [
    privateCars,
  ]);
  await db.query("DELETE FROM vehicles WHERE id=ANY($1::uuid[])", [fleet]);
  await db.query("DELETE FROM hubs WHERE id=ANY($1::uuid[])", [hubs]);
  await db.query("DELETE FROM mobility_idempotency WHERE key=ANY($1::text[])", [
    keys,
  ]);
  await db.onModuleDestroy();
}
