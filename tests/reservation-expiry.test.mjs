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

// T16: chống đặt trùng + hết hạn đặt xe trên PostgreSQL thật. Cần `npm run build` trước.
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
  const call = async (method, path, cookie, body) => {
    const headers =
      body === undefined ? {} : { "Content-Type": "application/json" };
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
  let stopping = false;
  let unexpectedPoolError;
  stack.stop = async () => {
    stopping = true;
    if (
      stack.server &&
      stack.server.exitCode === null &&
      stack.server.signalCode === null
    ) {
      const exited = once(stack.server, "exit");
      stack.server.kill("SIGTERM");
      await exited;
    }
    await stack.pool?.end();
    await db.stop().catch(() => {});
    // Windows can briefly retain a PostgreSQL file handle after process exit.
    await rm(directory, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 100,
    });
    assert.ifError(unexpectedPoolError);
  };
  try {
    await db.initialise();
    await db.start();
    await db.createDatabase(name);
    await command("scripts/migrate.mjs", env);
    await command("scripts/seed.mjs", env);
    stack.pool = new pg.Pool({ connectionString: env.DATABASE_URL });
    // pg emits idle-client disconnects outside query promises. PostgreSQL fast
    // shutdown may deliver 57P01 while cleanup is in flight; every other idle
    // error, including 57P01 before shutdown, must still fail this fixture.
    stack.pool.on("error", (error) => {
      if (!stopping || error.code !== "57P01") unexpectedPoolError ??= error;
    });
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
      await pool.query("DELETE FROM trips");
      await pool.query("DELETE FROM vehicle_reservations");
      await pool.query(
        "UPDATE vehicles SET status='available' WHERE code IN ('METRO-B01','DORM-B01')",
      );
      await pool.query("UPDATE hubs SET status='active'");
    };
    stack.reserve = (cookie, id) =>
      call("POST", "/vehicle-reservations", cookie, { vehicleId: id });
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
  "T16 anti double booking and lazy expiry against real PostgreSQL",
  { timeout: 180_000 },
  async (t) => {
    // Chu kỳ scheduler rất lớn: các bài dưới chỉ kiểm tra đường "quét khi có request".
    const s = await startStack("t16lazy", 3600);
    try {
      const studentId = await s.userId(s.env.SEED_STUDENT_EMAIL);
      const operatorId = await s.userId(s.env.SEED_OPERATOR_EMAIL);

      await t.test(
        "10 simultaneous requests for one vehicle: exactly one reservation",
        async () => {
          await s.reset();
          const id = await s.vehicleId("DORM-B01");
          const results = await Promise.all(
            Array.from({ length: 10 }, (_, i) =>
              s.reserve(i % 2 ? s.operator : s.student, id),
            ),
          );
          const codes = results.map((r) => r.status);
          assert.equal(codes.filter((c) => c === 201).length, 1, `${codes}`);
          assert.equal(codes.filter((c) => c === 409).length, 9, `${codes}`);
          assert.equal(await s.activeCount("DORM-B01"), 1);
          assert.equal(await s.vehicleStatus("DORM-B01"), "reserved");
        },
      );

      await t.test(
        "simultaneous requests on two different vehicles do not block each other",
        async () => {
          await s.reset();
          const a = await s.vehicleId("DORM-B01");
          const b = await s.vehicleId("METRO-B01");
          const results = await Promise.all([
            s.reserve(s.student, a),
            s.reserve(s.operator, b),
          ]);
          assert.deepEqual(
            results.map((r) => r.status),
            [201, 201],
          );
        },
      );

      await t.test(
        "listing my reservations expires overdue ones and releases the vehicle",
        async () => {
          await s.reset();
          const id = await s.plantExpired("METRO-B01", studentId);
          const list = await s.call("GET", "/vehicle-reservations", s.student);
          assert.equal(list.status, 200);
          const item = list.body.find((r) => r.id === id);
          assert.equal(item.status, "expired");
          assert.ok(item.closedAt);
          assert.equal(await s.vehicleStatus("METRO-B01"), "available");
          assert.equal(await s.activeCount("METRO-B01"), 0);
        },
      );

      await t.test("a not-yet-due reservation is left alone", async () => {
        await s.reset();
        const held = await s.reserve(s.student, await s.vehicleId("DORM-B01"));
        assert.equal(held.status, 201);
        const list = await s.call("GET", "/vehicle-reservations", s.student);
        assert.equal(list.body[0].status, "active");
        assert.equal(await s.vehicleStatus("DORM-B01"), "reserved");
      });

      await t.test(
        "vehicle search shows an expired-held vehicle again",
        async () => {
          await s.reset();
          await s.plantExpired("METRO-B01", studentId);
          const search = await s.call("GET", "/vehicles", s.operator);
          assert.equal(search.status, 200);
          assert.ok(
            search.body.vehicles.some((v) => v.code === "METRO-B01"),
            "xe quá hạn phải tìm thấy lại",
          );
        },
      );

      await t.test(
        "another user can reserve a vehicle whose hold expired",
        async () => {
          await s.reset();
          const id = await s.vehicleId("METRO-B01");
          await s.plantExpired("METRO-B01", studentId);
          const r = await s.reserve(s.operator, id);
          assert.equal(r.status, 201, JSON.stringify(r.body));
          assert.equal(await s.activeCount("METRO-B01"), 1);
          assert.equal(
            (
              await s.pool.query(
                "SELECT count(*) FROM vehicle_reservations WHERE vehicle_id=$1 AND status='expired'",
                [id],
              )
            ).rows[0].count,
            "1",
          );
        },
      );

      await t.test(
        "cancelling an overdue reservation returns 409 but still releases the vehicle",
        async () => {
          await s.reset();
          const id = await s.plantExpired("DORM-B01", studentId);
          const r = await s.call(
            "POST",
            `/vehicle-reservations/${id}/cancel`,
            s.student,
          );
          assert.equal(r.status, 409);
          const row = await s.reservationRow(id);
          assert.equal(row.status, "expired"); // không phải cancelled, và đã commit dù trả 409
          assert.ok(row.closed_at);
          assert.equal(await s.vehicleStatus("DORM-B01"), "available");
        },
      );

      await t.test("only the owner can trigger cancel on overdue", async () => {
        await s.reset();
        const id = await s.plantExpired("DORM-B01", studentId);
        const r = await s.call(
          "POST",
          `/vehicle-reservations/${id}/cancel`,
          s.operator,
        );
        assert.equal(r.status, 403);
      });

      await t.test(
        "expiry never overwrites a vehicle moved to another state",
        async () => {
          await s.reset();
          const id = await s.plantExpired("METRO-B01", studentId);
          await s.pool.query(
            "UPDATE vehicles SET status='maintenance' WHERE code='METRO-B01'",
          );
          await s.call("GET", "/vehicle-reservations", s.student);
          assert.equal((await s.reservationRow(id)).status, "expired");
          assert.equal(await s.vehicleStatus("METRO-B01"), "maintenance");
        },
      );

      await t.test(
        "expiry racing with cancel, list and reserve keeps data consistent",
        async () => {
          for (let round = 0; round < 5; round++) {
            await s.reset();
            const id = await s.plantExpired("DORM-B01", studentId);
            const vehicle = await s.vehicleId("DORM-B01");
            const results = await Promise.all([
              s.call("POST", `/vehicle-reservations/${id}/cancel`, s.student),
              s.call("GET", "/vehicle-reservations", s.student),
              s.call("GET", "/vehicles", s.operator),
              s.reserve(s.operator, vehicle),
              s.reserve(s.student, vehicle),
            ]);
            assert.ok(
              results.every((r) => r.status < 500),
              `500 khi đua: ${results.map((r) => r.status)}`,
            );
            assert.equal((await s.reservationRow(id)).status, "expired");
            // Bất biến: tối đa một reservation active; xe reserved khi và chỉ khi có reservation active.
            const active = await s.activeCount("DORM-B01");
            assert.ok(active <= 1);
            assert.equal(
              await s.vehicleStatus("DORM-B01"),
              active === 1 ? "reserved" : "available",
            );
          }
        },
      );
    } finally {
      await s.stop();
    }
  },
);

test(
  "T16 background scheduler releases overdue reservations without any request",
  { timeout: 120_000 },
  async () => {
    const s = await startStack("t16sched", 1);
    try {
      const studentId = await s.userId(s.env.SEED_STUDENT_EMAIL);
      await s.reset();
      const id = await s.plantExpired("METRO-B01", studentId);
      // Không gọi API nào: chỉ scheduler (chu kỳ 1 giây) được phép nhả xe.
      let row;
      for (let i = 0; i < 100; i++) {
        row = await s.reservationRow(id);
        if (row.status === "expired") break;
        await new Promise((r) => setTimeout(r, 100));
      }
      assert.equal(row.status, "expired");
      assert.ok(row.closed_at);
      assert.equal(await s.vehicleStatus("METRO-B01"), "available");
    } finally {
      await s.stop();
    }
  },
);
