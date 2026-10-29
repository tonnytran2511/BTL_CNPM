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
test(
  "T06 schema constraints and GET /vehicles against real PostgreSQL",
  { timeout: 90_000 },
  async (t) => {
    const directory = await mkdtemp(resolve(tmpdir(), "emobility-rental-"));
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
      DATABASE_URL: `postgresql://test_user:${password}@127.0.0.1:${dbPort}/rental`,
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
    const get = async (path, cookie) => {
      const r = await fetch(base + path, {
        headers: cookie ? { Cookie: cookie } : {},
      });
      return { status: r.status, body: await r.json() };
    };
    let server, pool;
    let stopping = false;
    let unexpectedPoolError;
    try {
      await db.initialise();
      await db.start();
      await db.createDatabase("rental");
      await command("scripts/migrate.mjs", env);
      await command("scripts/migrate.mjs", env);
      await command("scripts/seed.mjs", env);
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
      let ready = false;
      for (let i = 0; i < 100 && !ready; i++) {
        try {
          ready = (await get("/health")).status === 200;
        } catch {}
        if (!ready) await new Promise((r) => setTimeout(r, 100));
      }
      assert.ok(ready, "API did not start");
      const login = async (email, password) => {
        const r = await fetch(base + "/auth/login", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Origin: env.WEB_ORIGIN,
          },
          body: JSON.stringify({ email, password }),
        });
        return r.headers.get("set-cookie").split(";")[0];
      };
      const student = await login(
        env.SEED_STUDENT_EMAIL,
        env.SEED_STUDENT_PASSWORD,
      );

      await t.test("anonymous request is rejected", async () =>
        assert.equal((await get("/vehicles")).status, 401),
      );
      await t.test(
        "only available, sufficiently charged vehicles in active Hubs are listed",
        async () => {
          const r = await get("/vehicles", student);
          assert.equal(r.status, 200);
          assert.equal(r.body.minimumBatteryPercent, 20);
          assert.deepEqual(r.body.vehicles.map((v) => v.code).sort(), [
            "DORM-B01",
            "METRO-B01",
          ]);
          assert.ok(
            r.body.vehicles.every(
              (v) => v.status === "available" && v.batteryPercent >= 20,
            ),
          );
        },
      );
      await t.test(
        "filters by Hub, type and battery; user filter cannot go below the configured minimum",
        async () => {
          const hubs = (await pool.query("SELECT id, code FROM hubs")).rows;
          const dorm = hubs.find((h) => h.code === "DORM").id;
          assert.deepEqual(
            (await get(`/vehicles?hubId=${dorm}`, student)).body.vehicles.map(
              (v) => v.code,
            ),
            ["DORM-B01"],
          );
          assert.equal(
            (await get("/vehicles?type=electric_motorcycle", student)).body
              .vehicles.length,
            0,
          );
          assert.deepEqual(
            (
              await get("/vehicles?minBatteryPercent=85", student)
            ).body.vehicles.map((v) => v.code),
            ["DORM-B01"],
          );
          assert.equal(
            (await get("/vehicles?minBatteryPercent=0", student)).body.vehicles
              .length,
            2,
          );
          assert.equal(
            (await get("/vehicles?minBatteryPercent=abc", student)).status,
            400,
          );
          assert.equal((await get("/vehicles?type=car", student)).status, 400);
        },
      );
      await t.test(
        "inactive Hub, reserved or low-battery vehicles disappear",
        async () => {
          await pool.query(
            "UPDATE vehicles SET status='reserved' WHERE code='METRO-B01'",
          );
          assert.deepEqual(
            (await get("/vehicles", student)).body.vehicles.map((v) => v.code),
            ["DORM-B01"],
          );
          await pool.query(
            "UPDATE hubs SET status='inactive' WHERE code='DORM'",
          );
          assert.equal(
            (await get("/vehicles", student)).body.vehicles.length,
            0,
          );
        },
      );
      await t.test(
        "schema: one active reservation per vehicle, one trip per reservation, state checks",
        async () => {
          const user = (await pool.query("SELECT id FROM users LIMIT 1"))
            .rows[0].id;
          const v = (
            await pool.query(
              "SELECT id, hub_id FROM vehicles WHERE code='METRO-M01'",
            )
          ).rows[0];
          const reserve = () =>
            pool.query(
              "INSERT INTO vehicle_reservations(user_id,vehicle_id,source_hub_id,expires_at) VALUES($1,$2,$3,now()+interval '15 minutes') RETURNING id",
              [user, v.id, v.hub_id],
            );
          const first = (await reserve()).rows[0].id;
          await assert.rejects(reserve(), (e) => e.code === "23505"); // concurrent duplicate hold
          await assert.rejects(
            pool.query(
              "UPDATE vehicle_reservations SET status='cancelled' WHERE id=$1",
              [first],
            ),
            (e) => e.code === "23514",
          ); // closed_at must be set with a final status
          await pool.query(
            "UPDATE vehicle_reservations SET status='fulfilled', closed_at=now() WHERE id=$1",
            [first],
          );
          await reserve(); // a final reservation frees the vehicle for a new hold
          const trip = () =>
            pool.query(
              "INSERT INTO trips(reservation_id,user_id,vehicle_id,source_hub_id,start_battery_percent) VALUES($1,$2,$3,$4,65)",
              [first, user, v.id, v.hub_id],
            );
          await trip();
          await assert.rejects(trip(), (e) => e.code === "23505"); // repeated pickup must not duplicate the trip
          await assert.rejects(
            pool.query(
              "UPDATE trips SET status='completed' WHERE reservation_id=$1",
              [first],
            ),
            (e) => e.code === "23514",
          ); // completed trip needs end time, target Hub and end battery
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
