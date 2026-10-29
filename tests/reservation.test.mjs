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
// T07: đặt/hủy xe trên PostgreSQL thật. Cần `npm run build` trước (test chạy apps/api/dist).
test(
  "T07 reserve / cancel vehicle against real PostgreSQL",
  { timeout: 120_000 },
  async (t) => {
    const directory = await mkdtemp(
      resolve(tmpdir(), "emobility-reservation-"),
    );
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
      DATABASE_URL: `postgresql://test_user:${password}@127.0.0.1:${dbPort}/reservation`,
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
    let server, pool;
    let stopping = false;
    let unexpectedPoolError;
    try {
      await db.initialise();
      await db.start();
      await db.createDatabase("reservation");
      await command("scripts/migrate.mjs", env);
      await command("scripts/seed.mjs", env);
      pool = new pg.Pool({ connectionString: env.DATABASE_URL });
      pool.on("error", (error) => {
        if (!stopping || error.code !== "57P01") unexpectedPoolError ??= error;
      });
      server = spawn(process.execPath, ["apps/api/dist/main.js"], {
        cwd: root,
        env,
        stdio: ["ignore", "pipe", "pipe"],
      });
      let serverLog = "";
      server.stdout.on("data", (c) => (serverLog += c));
      server.stderr.on("data", (c) => (serverLog += c));
      let exited = null;
      server.on("exit", (code) => (exited = code));
      let ready = false;
      let lastProbe = "chưa gọi được /health";
      for (let i = 0; i < 300 && !ready && exited === null; i++) {
        try {
          const probe = await call("GET", "/health");
          lastProbe = `/health trả ${probe.status}`;
          ready = probe.status === 200;
        } catch (error) {
          lastProbe = `gọi /health lỗi: ${error?.cause?.code ?? error?.message}`;
        }
        if (!ready) await new Promise((r) => setTimeout(r, 100));
      }
      assert.ok(
        ready,
        `API did not start (exit code: ${exited}; ${lastProbe}; port ${apiPort}).\n${serverLog}`,
      );
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
      const student = await login(
        env.SEED_STUDENT_EMAIL,
        env.SEED_STUDENT_PASSWORD,
      );
      const operator = await login(
        env.SEED_OPERATOR_EMAIL,
        env.SEED_OPERATOR_PASSWORD,
      );
      const vehicleId = async (code) =>
        (await pool.query("SELECT id FROM vehicles WHERE code=$1", [code]))
          .rows[0].id;
      const vehicleStatus = async (code) =>
        (await pool.query("SELECT status FROM vehicles WHERE code=$1", [code]))
          .rows[0].status;
      const activeCount = async (code) =>
        Number(
          (
            await pool.query(
              `SELECT count(*) FROM vehicle_reservations r JOIN vehicles v ON v.id=r.vehicle_id
                WHERE v.code=$1 AND r.status='active'`,
              [code],
            )
          ).rows[0].count,
        );
      const reset = async () => {
        await pool.query("DELETE FROM trips");
        await pool.query("DELETE FROM vehicle_reservations");
        await pool.query(
          "UPDATE vehicles SET status='available' WHERE code IN ('METRO-B01','DORM-B01')",
        );
        await pool.query("UPDATE hubs SET status='active'");
      };
      const reserve = (cookie, id) =>
        call("POST", "/vehicle-reservations", cookie, { vehicleId: id });

      await t.test("anonymous requests are rejected", async () => {
        assert.equal((await call("GET", "/vehicle-reservations")).status, 401);
        assert.equal(
          (
            await call("POST", "/vehicle-reservations", undefined, {
              vehicleId: "00000000-0000-4000-8000-000000000000",
            })
          ).status,
          401,
        );
      });

      await t.test("request validation and unknown vehicle", async () => {
        assert.equal((await reserve(student, undefined)).status, 400);
        assert.equal((await reserve(student, "not-a-uuid")).status, 400);
        assert.equal(
          (
            await call("POST", "/vehicle-reservations", student, {
              vehicleId: await vehicleId("METRO-B01"),
              userId: "ignored",
            })
          ).status,
          400,
        ); // field ngoài DTO bị từ chối: user lấy từ session
        assert.equal(
          (await reserve(student, "00000000-0000-4000-8000-000000000000"))
            .status,
          404,
        );
      });

      await t.test(
        "reserving saves the hold, marks the vehicle reserved and uses the configured hold time",
        async () => {
          await reset();
          const r = await reserve(student, await vehicleId("METRO-B01"));
          assert.equal(r.status, 201);
          assert.equal(r.body.status, "active");
          assert.equal(r.body.closedAt, null);
          assert.equal(r.body.vehicle.code, "METRO-B01");
          assert.equal(r.body.hub.name, "Hub ga Metro");
          assert.equal(await vehicleStatus("METRO-B01"), "reserved");
          const row = (
            await pool.query(
              `SELECT extract(epoch FROM r.expires_at - r.created_at) AS seconds, u.email
                 FROM vehicle_reservations r JOIN users u ON u.id=r.user_id`,
            )
          ).rows;
          assert.equal(row.length, 1);
          assert.equal(row[0].email, env.SEED_STUDENT_EMAIL);
          const minutes = Number(
            (
              await pool.query(
                "SELECT value FROM settings WHERE key='reservationHoldMinutes'",
              )
            ).rows[0].value,
          );
          assert.equal(Number(row[0].seconds), minutes * 60);
          const mine = await call("GET", "/vehicle-reservations", student);
          assert.deepEqual(
            mine.body.map((x) => x.id),
            [r.body.id],
          );
          assert.deepEqual(
            (await call("GET", "/vehicles", student)).body.vehicles.map(
              (v) => v.code,
            ),
            ["DORM-B01"],
          );
        },
      );

      await t.test("a held vehicle cannot be reserved again", async () => {
        const r = await reserve(operator, await vehicleId("METRO-B01"));
        assert.equal(r.status, 409);
        assert.equal(await activeCount("METRO-B01"), 1);
      });

      await t.test("my list only contains my own reservations", async () => {
        assert.equal(
          (await call("GET", "/vehicle-reservations", operator)).body.length,
          0,
        );
      });

      await t.test(
        "low battery, maintenance and inactive-Hub vehicles are refused",
        async () => {
          assert.equal(
            (await reserve(student, await vehicleId("METRO-B02"))).status,
            409,
          );
          assert.equal(
            (await reserve(student, await vehicleId("DORM-M01"))).status,
            409,
          );
          await pool.query(
            "UPDATE hubs SET status='inactive' WHERE code='DORM'",
          );
          assert.equal(
            (await reserve(student, await vehicleId("DORM-B01"))).status,
            409,
          );
          assert.equal(await vehicleStatus("DORM-B01"), "available");
          await pool.query("UPDATE hubs SET status='active' WHERE code='DORM'");
        },
      );

      await t.test(
        "two users reserving the same vehicle at once: exactly one succeeds",
        async () => {
          await reset();
          const id = await vehicleId("DORM-B01");
          const results = await Promise.all([
            reserve(student, id),
            reserve(operator, id),
          ]);
          assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
          assert.equal(await activeCount("DORM-B01"), 1);
          assert.equal(await vehicleStatus("DORM-B01"), "reserved");
        },
      );

      await t.test(
        "a failed reservation rolls the vehicle status back",
        async () => {
          await reset();
          // Trạng thái bất thường: xe available nhưng đã có reservation active → insert vi phạm unique.
          const id = await vehicleId("METRO-B01");
          const user = (await pool.query("SELECT id FROM users LIMIT 1"))
            .rows[0].id;
          const hub = (
            await pool.query("SELECT hub_id FROM vehicles WHERE id=$1", [id])
          ).rows[0].hub_id;
          await pool.query(
            "INSERT INTO vehicle_reservations(user_id,vehicle_id,source_hub_id,expires_at) VALUES($1,$2,$3,now()+interval '5 minutes')",
            [user, id, hub],
          );
          assert.equal((await reserve(student, id)).status, 409);
          assert.equal(await vehicleStatus("METRO-B01"), "available"); // rollback, không để xe kẹt reserved
          assert.equal(await activeCount("METRO-B01"), 1);
        },
      );

      await t.test("cancel: ownership, state, vehicle release", async () => {
        await reset();
        const held = await reserve(student, await vehicleId("METRO-B01"));
        const id = held.body.id;
        const other = await call(
          "POST",
          `/vehicle-reservations/${id}/cancel`,
          operator,
        );
        assert.equal(other.status, 403);
        assert.equal(await vehicleStatus("METRO-B01"), "reserved");
        assert.equal(await activeCount("METRO-B01"), 1);

        const ok = await call(
          "POST",
          `/vehicle-reservations/${id}/cancel`,
          student,
        );
        assert.equal(ok.status, 200);
        assert.equal(ok.body.status, "cancelled");
        assert.ok(ok.body.closedAt);
        assert.equal(await vehicleStatus("METRO-B01"), "available");
        assert.ok(
          (await call("GET", "/vehicles", student)).body.vehicles.some(
            (v) => v.code === "METRO-B01",
          ),
        );

        const again = await call(
          "POST",
          `/vehicle-reservations/${id}/cancel`,
          student,
        );
        assert.equal(again.status, 409);
        assert.equal(await vehicleStatus("METRO-B01"), "available");

        assert.equal(
          (
            await call(
              "POST",
              "/vehicle-reservations/00000000-0000-4000-8000-000000000000/cancel",
              student,
            )
          ).status,
          404,
        );
        assert.equal(
          (await call("POST", "/vehicle-reservations/abc/cancel", student))
            .status,
          400,
        );

        // Sau khi hủy xe được đặt lại; lịch sử vẫn còn cả hai lượt.
        assert.equal(
          (await reserve(operator, await vehicleId("METRO-B01"))).status,
          201,
        );
        assert.deepEqual(
          (await call("GET", "/vehicle-reservations", student)).body.map(
            (x) => x.status,
          ),
          ["cancelled"],
        );
      });

      await t.test(
        "cancel never overwrites a vehicle that was moved to another state",
        async () => {
          await reset();
          const held = await reserve(student, await vehicleId("DORM-B01"));
          await pool.query(
            "UPDATE vehicles SET status='maintenance' WHERE code='DORM-B01'",
          );
          const r = await call(
            "POST",
            `/vehicle-reservations/${held.body.id}/cancel`,
            student,
          );
          assert.equal(r.status, 200);
          assert.equal(r.body.status, "cancelled");
          assert.equal(await vehicleStatus("DORM-B01"), "maintenance");
        },
      );
    } finally {
      stopping = true;
      if (server && server.exitCode === null && server.signalCode === null) {
        const exited = once(server, "exit");
        server.kill("SIGTERM");
        await exited;
      }
      await pool?.end();
      await db.stop().catch(() => {});
      await rm(directory, { recursive: true, force: true });
      assert.ifError(unexpectedPoolError);
    }
  },
);
