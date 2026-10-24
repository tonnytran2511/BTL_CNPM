import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { createServer } from "node:net";
import { spawn } from "node:child_process";
import { once } from "node:events";
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import { root } from "../scripts/env.mjs";
async function freePort() {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = server.address().port;
  await new Promise((r) => server.close(r));
  return port;
}
async function command(file, env) {
  const child = spawn(process.execPath, [file], {
    cwd: root,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let out = "";
  child.stdout.on("data", (c) => (out += c));
  child.stderr.on("data", (c) => (out += c));
  const [code] = await once(child, "exit");
  assert.equal(code, 0, out);
}

// T17: xử lý lỗi thuê xe + Idempotency-Key trên PostgreSQL thật. Cần `npm run build` trước.
async function startStack(name, sweepSeconds) {
  const directory = await mkdtemp(resolve(tmpdir(), `emobility-${name}-`));
  const dbPort = await freePort(),
    apiPort = await freePort();
  const password = randomBytes(24).toString("hex");
  const db = new EmbeddedPostgres({
    databaseDir: directory,
    user: "test_user",
    password,
    port: dbPort,
    persistent: false,
    authMethod: "scram-sha-256",
    postgresFlags: ["-h", "127.0.0.1"],
    initdbFlags: ["--encoding=UTF8"],
    onLog() {},
    onError() {},
  });
  const env = {
    ...process.env,
    DATABASE_URL: `postgresql://test_user:${password}@127.0.0.1:${dbPort}/${name}`,
    API_PORT: String(apiPort),
    WEB_ORIGIN: "http://localhost:5173",
    APP_NAME: "Test",
    POLL_INTERVAL_MS: "3000",
    SESSION_TTL_SECONDS: "3600",
    COOKIE_SECURE: "false",
    LOGIN_WINDOW_MS: "60000",
    LOGIN_MAX_ATTEMPTS: "100",
    SEED_OPERATOR_EMAIL: "operator@example.test",
    SEED_OPERATOR_NAME: "Op",
    SEED_OPERATOR_PASSWORD: randomBytes(18).toString("hex"),
    SEED_STUDENT_EMAIL: "student@example.test",
    SEED_STUDENT_NAME: "St",
    SEED_STUDENT_PASSWORD: randomBytes(18).toString("hex"),
    SEED_DATA_FILE: "database/seed.example.json",
  };
  const base = `http://127.0.0.1:${apiPort}/api`;
  const call = async (method, path, cookie, body, extra = {}) => {
    const headers = {
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...extra,
    };
    if (cookie) {
      headers.Cookie = cookie;
      if (method !== "GET") headers.Origin = env.WEB_ORIGIN;
    }
    const r = await fetch(base + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: r.status, body: await r.json() };
  };
  const stack = { call, env, pool: undefined, server: undefined };
  stack.stop = async () => {
    stack.server?.kill();
    await stack.pool?.end();
    await db.stop().catch(() => {});
    await rm(directory, { recursive: true, force: true });
  };
  try {
    await db.initialise();
    await db.start();
    await db.createDatabase(name);
    await command("scripts/migrate.mjs", env);
    await command("scripts/seed.mjs", env);
    stack.pool = new pg.Pool({ connectionString: env.DATABASE_URL });
    // Scheduler đọc chu kỳ từ settings lúc khởi động: đặt trước khi chạy API.
    await stack.pool.query(
      "UPDATE settings SET value=$1::jsonb WHERE key='reservationExpirySweepSeconds'",
      [JSON.stringify(sweepSeconds)],
    );
    stack.server = spawn(process.execPath, ["apps/api/dist/main.js"], {
      cwd: root,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let serverLog = "";
    stack.server.stdout.on("data", (c) => (serverLog += c));
    stack.server.stderr.on("data", (c) => (serverLog += c));
    let exited = null;
    stack.server.on("exit", (code) => (exited = code));
    let ready = false;
    for (let i = 0; i < 300 && !ready && exited === null; i++) {
      try {
        ready = (await call("GET", "/health")).status === 200;
      } catch {
        /* API chưa lên */
      }
      if (!ready) await new Promise((r) => setTimeout(r, 100));
    }
    assert.ok(ready, `API did not start (exit ${exited}).\n${serverLog}`);
    const login = async (email, pw) => {
      const r = await fetch(base + "/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: env.WEB_ORIGIN,
        },
        body: JSON.stringify({ email, password: pw }),
      });
      return r.headers.get("set-cookie").split(";")[0];
    };
    stack.student = await login(
      env.SEED_STUDENT_EMAIL,
      env.SEED_STUDENT_PASSWORD,
    );
    stack.operator = await login(
      env.SEED_OPERATOR_EMAIL,
      env.SEED_OPERATOR_PASSWORD,
    );
    const { pool } = stack;
    stack.userId = async (email) =>
      (await pool.query("SELECT id FROM users WHERE email=$1", [email])).rows[0]
        .id;
    stack.vehicleId = async (code) =>
      (await pool.query("SELECT id FROM vehicles WHERE code=$1", [code]))
        .rows[0].id;
    stack.vehicleStatus = async (code) =>
      (await pool.query("SELECT status FROM vehicles WHERE code=$1", [code]))
        .rows[0].status;
    stack.activeCount = async (code) =>
      Number(
        (
          await pool.query(
            `SELECT count(*) FROM vehicle_reservations r JOIN vehicles v ON v.id=r.vehicle_id
              WHERE v.code=$1 AND r.status='active'`,
            [code],
          )
        ).rows[0].count,
      );
    stack.reset = async () => {
      await pool.query("DELETE FROM rental_idempotency");
      await pool.query("DELETE FROM incidents");
      await pool.query("DELETE FROM trips");
      await pool.query("DELETE FROM vehicle_reservations");
      await pool.query(
        "UPDATE parking_spaces SET status='available', vehicle_id=NULL, hold_expires_at=NULL",
      );
      await pool.query("UPDATE hubs SET status='active'");
      await pool.query(
        `UPDATE vehicles SET hub_id=(SELECT id FROM hubs WHERE hubs.code=split_part(vehicles.code,'-',1)),
           battery_percent=80,
           status=CASE code WHEN 'METRO-B02' THEN 'charging' WHEN 'DORM-M01' THEN 'maintenance' ELSE 'available' END`,
      );
      await pool.query(
        `UPDATE parking_spaces p SET status='occupied', vehicle_id=v.id
           FROM (SELECT id, hub_id, row_number() OVER (PARTITION BY hub_id ORDER BY code) AS rn FROM vehicles) v
          WHERE p.hub_id=v.hub_id AND p.code='P'||v.rn`,
      );
    };
    const withKey = (key) => (key ? { "Idempotency-Key": key } : {});
    stack.reserve = (cookie, id, key) =>
      call(
        "POST",
        "/vehicle-reservations",
        cookie,
        { vehicleId: id },
        withKey(key),
      );
    stack.pickup = (cookie, id, key) =>
      call(
        "POST",
        `/vehicle-reservations/${id}/pickup`,
        cookie,
        undefined,
        withKey(key),
      );
    stack.cancel = (cookie, id, key) =>
      call(
        "POST",
        `/vehicle-reservations/${id}/cancel`,
        cookie,
        undefined,
        withKey(key),
      );
    stack.giveBack = (cookie, tripId, target, key) =>
      call(
        "POST",
        `/trips/${tripId}/return`,
        cookie,
        { targetHubId: target },
        withKey(key),
      );
    stack.hubId = async (code) =>
      (await pool.query("SELECT id FROM hubs WHERE code=$1", [code])).rows[0]
        .id;
    stack.tripCount = async () =>
      Number((await pool.query("SELECT count(*) FROM trips")).rows[0].count);
    stack.reservationCount = async () =>
      Number(
        (await pool.query("SELECT count(*) FROM vehicle_reservations")).rows[0]
          .count,
      );
    stack.fillHub = (code) =>
      pool.query(
        `UPDATE parking_spaces SET status='held', hold_expires_at=now()+interval '1 hour'
          WHERE status='available' AND hub_id=(SELECT id FROM hubs WHERE code=$1)`,
        [code],
      );
    /** Dựng trạng thái "đã quá hạn nhưng chưa ai xử lý": xe reserved + reservation active quá hạn. */
    stack.plantExpired = async (code, userId) => {
      const row = (
        await pool.query("SELECT id, hub_id FROM vehicles WHERE code=$1", [
          code,
        ])
      ).rows[0];
      await pool.query("UPDATE vehicles SET status='reserved' WHERE id=$1", [
        row.id,
      ]);
      return (
        await pool.query(
          `INSERT INTO vehicle_reservations(user_id, vehicle_id, source_hub_id, created_at, expires_at)
           VALUES ($1,$2,$3, now() - interval '30 minutes', now() - interval '15 minutes')
           RETURNING id`,
          [userId, row.id, row.hub_id],
        )
      ).rows[0].id;
    };
    stack.reservationRow = async (id) =>
      (
        await pool.query(
          "SELECT status, closed_at FROM vehicle_reservations WHERE id=$1",
          [id],
        )
      ).rows[0];
    return stack;
  } catch (error) {
    await stack.stop();
    throw error;
  }
}

test(
  "T17 rental error handling and Idempotency-Key against real PostgreSQL",
  { timeout: 240_000 },
  async (t) => {
    const s = await startStack("t17rental", 3600);
    try {
      const studentId = await s.userId(s.env.SEED_STUDENT_EMAIL);
      const { pool } = s;
      const setBattery = (code, value) =>
        pool.query("UPDATE vehicles SET battery_percent=$2 WHERE code=$1", [
          code,
          value,
        ]);
      const startTrip = async (cookie, code, key) => {
        const r = await s.reserve(cookie, await s.vehicleId(code));
        assert.equal(r.status, 201, JSON.stringify(r.body));
        const p = await s.pickup(cookie, r.body.id, key);
        assert.equal(p.status, 200, JSON.stringify(p.body));
        return { reservation: r.body, trip: p.body };
      };

      await t.test(
        "pickup is refused when the held vehicle's battery fell below the minimum",
        async () => {
          await s.reset();
          const r = await s.reserve(s.student, await s.vehicleId("DORM-B01"));
          assert.equal(r.status, 201);
          await setBattery("DORM-B01", 5);
          const p = await s.pickup(s.student, r.body.id);
          assert.equal(p.status, 409, JSON.stringify(p.body));
          assert.equal(await s.tripCount(), 0);
          assert.equal(await s.vehicleStatus("DORM-B01"), "reserved");
          assert.equal((await s.reservationRow(r.body.id)).status, "active");
          await setBattery("DORM-B01", 80);
          assert.equal((await s.pickup(s.student, r.body.id)).status, 200);
        },
      );

      await t.test(
        "pickup is refused while the vehicle has an open incident, then allowed once resolved",
        async () => {
          await s.reset();
          const r = await s.reserve(s.student, await s.vehicleId("DORM-B01"));
          assert.equal(r.status, 201);
          const incident = (
            await pool.query(
              `INSERT INTO incidents(resource_type, resource_id, description, reported_by)
               VALUES ('vehicle', $1, 'test fault', $2) RETURNING id`,
              [await s.vehicleId("DORM-B01"), studentId],
            )
          ).rows[0].id;
          const p = await s.pickup(s.student, r.body.id);
          assert.equal(p.status, 409, JSON.stringify(p.body));
          assert.equal(await s.tripCount(), 0);
          assert.equal(await s.vehicleStatus("DORM-B01"), "reserved");
          await pool.query(
            "UPDATE incidents SET status='resolved', resolved_at=now() WHERE id=$1",
            [incident],
          );
          assert.equal((await s.pickup(s.student, r.body.id)).status, 200);
        },
      );

      await t.test(
        "pickup is refused when the source hub is inactive",
        async () => {
          await s.reset();
          const r = await s.reserve(s.student, await s.vehicleId("DORM-B01"));
          assert.equal(r.status, 201);
          await pool.query(
            "UPDATE hubs SET status='inactive' WHERE code='DORM'",
          );
          const p = await s.pickup(s.student, r.body.id);
          assert.equal(p.status, 409, JSON.stringify(p.body));
          assert.equal(await s.tripCount(), 0);
          assert.equal(await s.vehicleStatus("DORM-B01"), "reserved");
        },
      );

      await t.test(
        "return to a full hub keeps the trip active and suggests other hubs",
        async () => {
          await s.reset();
          const { trip } = await startTrip(s.student, "DORM-B01");
          await s.fillHub("METRO");
          const back = await s.giveBack(
            s.student,
            trip.id,
            await s.hubId("METRO"),
          );
          assert.equal(back.status, 409, JSON.stringify(back.body));
          assert.ok(Array.isArray(back.body.details?.suggestedHubs));
          assert.equal(await s.vehicleStatus("DORM-B01"), "in_use");
          const row = (
            await pool.query("SELECT status FROM trips WHERE id=$1", [trip.id])
          ).rows[0];
          assert.equal(row.status, "active");
        },
      );

      await t.test("Idempotency-Key validation", async () => {
        await s.reset();
        const id = await s.vehicleId("DORM-B01");
        const tooLong = await s.reserve(s.student, id, "k".repeat(129));
        assert.equal(tooLong.status, 400, JSON.stringify(tooLong.body));
        assert.equal(await s.reservationCount(), 0);
        assert.equal(await s.vehicleStatus("DORM-B01"), "available");
      });

      await t.test(
        "reserve: same key and payload replays, different payload is 409",
        async () => {
          await s.reset();
          const a = await s.vehicleId("DORM-B01");
          const b = await s.vehicleId("METRO-B01");
          const first = await s.reserve(s.student, a, "reserve-key-1");
          const again = await s.reserve(s.student, a, "reserve-key-1");
          assert.equal(first.status, 201, JSON.stringify(first.body));
          assert.equal(again.status, 201, JSON.stringify(again.body));
          assert.equal(again.body.id, first.body.id);
          assert.equal(await s.reservationCount(), 1);
          const other = await s.reserve(s.student, b, "reserve-key-1");
          assert.equal(other.status, 409, JSON.stringify(other.body));
          assert.equal(await s.vehicleStatus("METRO-B01"), "available");
          // Key được giới hạn theo người dùng: người khác dùng cùng chuỗi key không bị ảnh hưởng.
          const foreign = await s.reserve(s.operator, b, "reserve-key-1");
          assert.equal(foreign.status, 201, JSON.stringify(foreign.body));
        },
      );

      await t.test(
        "reserve: 8 concurrent requests with one key create one reservation",
        async () => {
          await s.reset();
          const id = await s.vehicleId("DORM-B01");
          const results = await Promise.all(
            Array.from({ length: 8 }, () =>
              s.reserve(s.student, id, "race-reserve"),
            ),
          );
          assert.deepEqual(
            new Set(results.map((r) => r.status)),
            new Set([201]),
          );
          assert.equal(new Set(results.map((r) => r.body.id)).size, 1);
          assert.equal(await s.reservationCount(), 1);
          assert.equal(await s.activeCount("DORM-B01"), 1);
        },
      );

      await t.test("a failed request does not burn its key", async () => {
        await s.reset();
        const id = await s.vehicleId("DORM-B01");
        await setBattery("DORM-B01", 1);
        const failed = await s.reserve(s.student, id, "retry-key");
        assert.equal(failed.status, 409);
        await setBattery("DORM-B01", 80);
        const ok = await s.reserve(s.student, id, "retry-key");
        assert.equal(ok.status, 201, JSON.stringify(ok.body));
      });

      await t.test(
        "cancel: repeating with the same key returns the same result",
        async () => {
          await s.reset();
          const r = await s.reserve(s.student, await s.vehicleId("DORM-B01"));
          const one = await s.cancel(s.student, r.body.id, "cancel-key");
          const two = await s.cancel(s.student, r.body.id, "cancel-key");
          assert.equal(one.status, 200, JSON.stringify(one.body));
          assert.equal(two.status, 200, JSON.stringify(two.body));
          assert.equal(two.body.status, "cancelled");
          assert.equal(await s.vehicleStatus("DORM-B01"), "available");
          // Không key: lần hủy thứ hai bị từ chối vì sai trạng thái.
          const plain = await s.cancel(s.student, r.body.id);
          assert.equal(plain.status, 409);
        },
      );

      await t.test(
        "pickup: repeated and concurrent requests create exactly one trip",
        async () => {
          await s.reset();
          const r = await s.reserve(s.student, await s.vehicleId("DORM-B01"));
          const results = await Promise.all(
            Array.from({ length: 6 }, (_, i) =>
              s.pickup(s.student, r.body.id, i < 3 ? "pickup-key" : undefined),
            ),
          );
          assert.deepEqual(
            new Set(results.map((x) => x.status)),
            new Set([200]),
          );
          assert.equal(new Set(results.map((x) => x.body.id)).size, 1);
          assert.equal(await s.tripCount(), 1);
          const replay = await s.pickup(s.student, r.body.id, "pickup-key");
          assert.equal(replay.status, 200);
          assert.equal(replay.body.id, results[0].body.id);
          assert.equal(await s.vehicleStatus("DORM-B01"), "in_use");
          // Cùng key cho lượt đặt khác -> payload khác -> 409.
          const r2 = await s.reserve(s.student, await s.vehicleId("METRO-B01"));
          const clash = await s.pickup(s.student, r2.body.id, "pickup-key");
          assert.equal(clash.status, 409, JSON.stringify(clash.body));
          assert.equal(await s.tripCount(), 1);
        },
      );

      await t.test(
        "return: repeated and concurrent requests complete the trip once",
        async () => {
          await s.reset();
          const { trip } = await startTrip(s.student, "DORM-B01");
          const metro = await s.hubId("METRO");
          const dorm = await s.hubId("DORM");
          const results = await Promise.all(
            Array.from({ length: 6 }, (_, i) =>
              s.giveBack(
                s.student,
                trip.id,
                metro,
                i < 3 ? "return-key" : undefined,
              ),
            ),
          );
          assert.deepEqual(
            new Set(results.map((x) => x.status)),
            new Set([200]),
          );
          assert.equal(await s.vehicleStatus("DORM-B01"), "available");
          const spaces = Number(
            (
              await pool.query(
                `SELECT count(*) FROM parking_spaces p JOIN vehicles v ON v.id=p.vehicle_id
                WHERE v.code='DORM-B01'`,
              )
            ).rows[0].count,
          );
          assert.equal(spaces, 1, "xe chỉ được chiếm đúng một chỗ ở Hub đích");
          const replay = await s.giveBack(
            s.student,
            trip.id,
            metro,
            "return-key",
          );
          assert.equal(replay.status, 200);
          assert.equal(replay.body.id, trip.id);
          // Cùng key nhưng đổi Hub đích -> 409; không key mà đổi Hub đích cũng 409 (đã kết thúc ở Hub khác).
          assert.equal(
            (await s.giveBack(s.student, trip.id, dorm, "return-key")).status,
            409,
          );
          assert.equal(
            (await s.giveBack(s.student, trip.id, dorm)).status,
            409,
          );
        },
      );

      await t.test(
        "return blocked by a full hub is retryable with the same key",
        async () => {
          await s.reset();
          const { trip } = await startTrip(s.student, "DORM-B01");
          const metro = await s.hubId("METRO");
          await s.fillHub("METRO");
          const blocked = await s.giveBack(
            s.student,
            trip.id,
            metro,
            "full-key",
          );
          assert.equal(blocked.status, 409);
          await pool.query(
            `UPDATE parking_spaces SET status='available', hold_expires_at=NULL
            WHERE status='held' AND hub_id=$1`,
            [metro],
          );
          const ok = await s.giveBack(s.student, trip.id, metro, "full-key");
          assert.equal(ok.status, 200, JSON.stringify(ok.body));
          assert.equal(ok.body.status, "completed");
        },
      );
    } finally {
      await s.stop();
    }
  },
);
