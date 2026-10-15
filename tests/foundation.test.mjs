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
  await new Promise((resolve) => server.close(resolve));
  return port;
}
async function command(file, env) {
  const child = spawn(process.execPath, [file], {
    cwd: root,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (chunk) => {
    output += chunk;
  });
  child.stderr.on("data", (chunk) => {
    output += chunk;
  });
  const [code] = await once(child, "exit");
  assert.equal(code, 0, output);
}
test(
  "Foundation against isolated PostgreSQL and real HTTP server",
  { timeout: 90_000 },
  async (t) => {
    const directory = await mkdtemp(resolve(tmpdir(), "emobility-test-"));
    const dbPort = await freePort();
    const apiPort = await freePort();
    const password = randomBytes(24).toString("hex");
    const db = new EmbeddedPostgres({
      databaseDir: directory,
      user: "test_user",
      password,
      port: dbPort,
      persistent: false,
      authMethod: "scram-sha-256",
      initdbFlags: ["--encoding=UTF8"],
      postgresFlags: ["-h", "127.0.0.1"],
      onLog: () => {},
      onError: () => {},
    });
    let server;
    let pool;
    const env = {
      ...process.env,
      DATABASE_URL: `postgresql://test_user:${password}@127.0.0.1:${dbPort}/foundation`,
      API_PORT: String(apiPort),
      WEB_ORIGIN: "http://localhost:5173",
      APP_NAME: "Test Mobility Network",
      POLL_INTERVAL_MS: "3000",
      SESSION_TTL_SECONDS: "3600",
      COOKIE_SECURE: "false",
      LOGIN_WINDOW_MS: "60000",
      LOGIN_MAX_ATTEMPTS: "100",
      SEED_OPERATOR_EMAIL: "operator@example.test",
      SEED_OPERATOR_NAME: "Test operator",
      SEED_OPERATOR_PASSWORD: randomBytes(18).toString("hex"),
      SEED_STUDENT_EMAIL: "student@example.test",
      SEED_STUDENT_NAME: "Test student",
      SEED_STUDENT_PASSWORD: randomBytes(18).toString("hex"),
      SEED_DATA_FILE: "database/seed.example.json",
    };
    const base = `http://127.0.0.1:${apiPort}/api`;
    const request = async (
      path,
      { cookie, body, method = "GET", origin = env.WEB_ORIGIN } = {},
    ) => {
      const response = await fetch(base + path, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(cookie ? { Cookie: cookie } : {}),
          ...(method !== "GET" ? { Origin: origin } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      return {
        status: response.status,
        body: await response.json(),
        cookie: response.headers.get("set-cookie")?.split(";")[0],
      };
    };
    try {
      await db.initialise();
      await db.start();
      await db.createDatabase("foundation");
      await command("scripts/migrate.mjs", env);
      await command("scripts/migrate.mjs", env); // Migration is repeatable.
      await command("scripts/seed.mjs", env);
      await command("scripts/seed.mjs", env); // Seed must not duplicate/overwrite state.
      pool = new pg.Pool({ connectionString: env.DATABASE_URL });
      server = spawn(process.execPath, ["apps/api/dist/main.js"], {
        cwd: root,
        env,
        stdio: ["ignore", "pipe", "pipe"],
      });
      let startupOutput = "";
      server.stdout.on("data", (chunk) => {
        startupOutput += chunk;
      });
      server.stderr.on("data", (chunk) => {
        startupOutput += chunk;
      });
      let ready = false;
      for (let i = 0; i < 100; i++) {
        if (server.exitCode !== null) throw new Error(startupOutput);
        try {
          if ((await request("/health")).status === 200) {
            ready = true;
            break;
          }
        } catch {}
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      assert.ok(ready, startupOutput);
      await t.test("Mai Anh parking and charging integration", async () => {
        await command("tests/mobility-check.mjs", env);
      });
      await t.test(
        "shared transaction commits, rolls back and enforces read-only snapshots",
        async () => {
          await command("tests/transaction-check.mjs", env);
        },
      );
      await t.test(
        "config uses environment and unauthenticated routes are protected",
        async () => {
          const config = await request("/config");
          assert.equal(config.body.appName, env.APP_NAME);
          assert.equal(config.body.pollIntervalMs, 3000);
          assert.equal((await request("/hubs")).status, 401);
          assert.equal((await request("/network/overview")).status, 401);
        },
      );
      await t.test(
        "invalid credentials, role injection and invalid DTO rejected",
        async () => {
          assert.equal(
            (
              await request("/auth/login", {
                method: "POST",
                body: { email: env.SEED_OPERATOR_EMAIL, password: "wrong" },
              })
            ).status,
            401,
          );
          assert.equal(
            (
              await request("/auth/login", {
                method: "POST",
                body: { email: "invalid", password: "" },
              })
            ).status,
            400,
          );
          assert.equal(
            (
              await request("/auth/login", {
                method: "POST",
                body: {
                  email: env.SEED_STUDENT_EMAIL,
                  password: env.SEED_STUDENT_PASSWORD,
                  role: "operator",
                },
              })
            ).status,
            400,
          );
        },
      );
      const operator = await request("/auth/login", {
        method: "POST",
        body: {
          email: env.SEED_OPERATOR_EMAIL,
          password: env.SEED_OPERATOR_PASSWORD,
        },
      });
      const student = await request("/auth/login", {
        method: "POST",
        body: {
          email: env.SEED_STUDENT_EMAIL,
          password: env.SEED_STUDENT_PASSWORD,
        },
      });
      assert.equal(operator.status, 201);
      assert.equal(student.status, 201);
      await t.test(
        "sessions do not expose credentials; authorization is server-side",
        async () => {
          assert.equal(operator.body.role, "operator");
          assert.equal("passwordHash" in operator.body, false);
          assert.equal("token" in operator.body, false);
          assert.equal(
            (await request("/auth/me", { cookie: student.cookie })).body.role,
            "student",
          );
          assert.equal(
            (await request("/network/overview", { cookie: student.cookie }))
              .status,
            403,
          );
          assert.equal(
            (await request("/simulation/snapshot", { cookie: student.cookie }))
              .status,
            403,
          );
        },
      );
      const hubs = (await request("/hubs", { cookie: operator.cookie })).body;
      await t.test(
        "seed is idempotent; Hub counts match actual database resources",
        async () => {
          assert.equal(hubs.length, 2);
          const hub = hubs.find((h) => h.name === "Hub ga Metro");
          assert.equal(hub.parking.capacity, 12);
          assert.equal(hub.parking.occupied, 3);
          assert.equal(hub.parking.available, 9);
          const detail = await request(`/hubs/${hub.id}`, {
            cookie: student.cookie,
          });
          assert.equal(detail.body.vehicleList.length, hub.vehicles.total);
          assert.equal(
            (await request("/hubs/not-a-uuid", { cookie: student.cookie }))
              .status,
            400,
          );
          assert.equal(
            (
              await request("/hubs/00000000-0000-4000-8000-000000000000", {
                cookie: student.cookie,
              })
            ).status,
            404,
          );
        },
      );
      await t.test(
        "resource mutations and configured threshold affect dashboard dynamically",
        async () => {
          const before = await request("/network/overview", {
            cookie: operator.cookie,
          });
          await pool.query(
            "UPDATE vehicles SET status='maintenance' WHERE code=$1",
            ["METRO-B01"],
          );
          const after = await request("/network/overview", {
            cookie: operator.cookie,
          });
          assert.equal(
            after.body.totals.availableVehicles,
            before.body.totals.availableVehicles - 1,
          );
          await pool.query("UPDATE settings SET value=$1 WHERE key=$2", [
            "100",
            "lowBatteryThreshold",
          ]);
          const changed = await request("/hubs", { cookie: operator.cookie });
          assert.equal(
            changed.body.reduce((n, h) => n + h.vehicles.lowBattery, 0),
            5,
          );
        },
      );
      await t.test(
        "inactive Hub excluded for students; expired holds free capacity; empty Hub supported",
        async () => {
          await pool.query("UPDATE hubs SET status='inactive' WHERE id=$1", [
            hubs[0].id,
          ]);
          assert.equal(
            (await request("/hubs", { cookie: student.cookie })).body.length,
            1,
          );
          assert.equal(
            (await request(`/hubs/${hubs[0].id}`, { cookie: student.cookie }))
              .status,
            404,
          );
          const id = hubs[1].id;
          await pool.query(
            "UPDATE parking_spaces SET status='held',hold_expires_at=now()-interval '1 minute' WHERE id=(SELECT id FROM parking_spaces WHERE hub_id=$1 AND status='available' LIMIT 1)",
            [id],
          );
          const detail = await request(`/hubs/${id}`, {
            cookie: operator.cookie,
          });
          assert.equal(detail.body.parking.held, 0);
          await pool.query(
            "INSERT INTO hubs(code,name,location) VALUES('EMPTY','Empty Hub','Test location')",
          );
          const empty = (
            await request("/hubs", { cookie: operator.cookie })
          ).body.find((h) => h.name === "Empty Hub");
          assert.equal(empty.parking.capacity, 0);
          assert.equal(empty.utilizationPercent, 0);
        },
      );
      await t.test(
        "snapshot is consistent and read-only; database constraints enforce valid core data",
        async () => {
          const before = (
            await pool.query("SELECT * FROM vehicles ORDER BY id")
          ).rows;
          const snapshot = await request("/simulation/snapshot", {
            cookie: operator.cookie,
          });
          assert.equal(snapshot.status, 200);
          assert.equal(snapshot.body.hubs.length, 3);
          assert.deepEqual(
            (await pool.query("SELECT * FROM vehicles ORDER BY id")).rows,
            before,
          );
          await assert.rejects(
            pool.query("UPDATE vehicles SET battery_percent=101"),
            { code: "23514" },
          );
        },
      );
      await t.test(
        "cross-origin mutations rejected; logout revokes existing token immediately",
        async () => {
          assert.equal(
            (
              await request("/auth/logout", {
                cookie: operator.cookie,
                method: "POST",
                origin: "https://other.example",
              })
            ).status,
            403,
          );
          assert.equal(
            (await request("/auth/me", { cookie: operator.cookie })).status,
            200,
          );
          assert.equal(
            (
              await request("/auth/logout", {
                cookie: operator.cookie,
                method: "POST",
              })
            ).status,
            201,
          );
          assert.equal(
            (await request("/auth/me", { cookie: operator.cookie })).status,
            401,
          );
          await pool.query(
            "UPDATE sessions SET expires_at=now()-interval '1 second'",
          );
          assert.equal(
            (await request("/auth/me", { cookie: student.cookie })).status,
            401,
          );
        },
      );
      await t.test(
        "API survives closed idle connections and reconnects",
        async () => {
          await request("/health");
          const killed = await pool.query(
            "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE application_name=$1 AND pid<>pg_backend_pid()",
            [env.APP_NAME],
          );
          assert.ok(killed.rowCount > 0);
          let recovered = false;
          for (let i = 0; i < 20; i++) {
            assert.equal(server.exitCode, null, startupOutput);
            try {
              if ((await request("/health")).status === 200) {
                recovered = true;
                break;
              }
            } catch {}
            await new Promise((resolve) => setTimeout(resolve, 100));
          }
          assert.ok(
            recovered,
            "API should reconnect after its idle connection is terminated",
          );
        },
      );
    } finally {
      if (server && server.exitCode === null) {
        server.kill("SIGTERM");
        await once(server, "exit");
      }
      if (pool) await pool.end();
      await db.stop();
      await rm(directory, {
        recursive: true,
        force: true,
        maxRetries: 20,
        retryDelay: 100,
      });
    }
  },
);
