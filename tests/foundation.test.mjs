import test from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { createServer } from "node:net";
import { spawn } from "node:child_process";
import { once } from "node:events";
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import { root } from "../scripts/env.mjs";
import { checkDashboard } from "./dashboard-check.mjs";
import { checkScenarios } from "./scenarios-check.mjs";
import { checkRelease } from "./release-check.mjs";
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
      initdbFlags: ["--encoding=UTF8", "--locale=C"],
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
      {
        cookie,
        body,
        method = "GET",
        origin = env.WEB_ORIGIN,
        headers = {},
      } = {},
    ) => {
      const response = await fetch(base + path, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...headers,
          ...(cookie ? { Cookie: cookie } : {}),
          ...(method !== "GET" ? { Origin: origin } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      return {
        status: response.status,
        body: await response.json(),
        cookie: response.headers.get("set-cookie")?.split(";")[0],
        headers: response.headers,
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
      let lastHealthCheck = "no response";
      for (let i = 0; i < 100; i++) {
        if (server.exitCode !== null) throw new Error(startupOutput);
        try {
          const health = await request("/health");
          lastHealthCheck = `HTTP ${health.status}`;
          if (health.status === 200) {
            ready = true;
            break;
          }
        } catch (error) {
          lastHealthCheck =
            error instanceof Error
              ? `${error.name}: ${error.message}`
              : String(error);
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      assert.ok(
        ready,
        `${startupOutput}\nAPI readiness failed at ${base}/health: ${lastHealthCheck}; child exit code: ${server.exitCode}`,
      );
      await t.test(
        "T20 charging failure, recovery and incident integration",
        async () => {
          await command("tests/charging-failure-check.mjs", env);
        },
      );
      await t.test(
        "T19 rental charging lifecycle and cross-module races",
        async () => {
          await command("tests/rental-charging-check.mjs", env);
        },
      );
      await t.test("T19 private charging workflow", async () => {
        await command("tests/charging-workflow-check.mjs", env);
      });
      await t.test("Mai Anh parking and charging integration", async () => {
        await command("tests/mobility-check.mjs", env);
      });
      await t.test(
        "T18 concurrent parking and charging allocation safety",
        async () => {
          await command("tests/allocation-safety-check.mjs", env);
        },
      );
      await t.test(
        "T14/T35 Hub management integration and incident race",
        async () => {
          await command("tests/hub-management-check.mjs", env);
        },
      );
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
      await checkDashboard({ t, request, operator, student });
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
        "T13 operator simulation validates requests and leaves operational tables unchanged",
        async () => {
          const body = {
            hubId: hubs[0].id,
            horizonMinutes: 60,
            stepMinutes: 5,
            seed: 42,
            baselineArrivalsPerStep: 0.5,
            scenarioArrivalsPerStep: 4,
          };
          const run = (changes = {}, cookie = operator.cookie) =>
            request("/simulations/demand-surge", {
              method: "POST",
              cookie,
              body: { ...body, ...changes },
            });
          assert.equal((await request("/simulations/config")).status, 401);
          assert.equal(
            (await request("/simulations/config", { cookie: student.cookie }))
              .status,
            403,
          );
          assert.equal((await run({}, student.cookie)).status, 403);
          const config = await request("/simulations/config", {
            cookie: operator.cookie,
          });
          assert.equal(config.status, 200);
          const capture = async () => {
            const result = {};
            for (const table of [
              "hubs",
              "vehicles",
              "parking_spaces",
              "charging_points",
              "parking_bookings",
              "charging_requests",
              "vehicle_reservations",
              "trips",
            ])
              result[table] = (
                await pool.query(`SELECT * FROM ${table} ORDER BY id`)
              ).rows;
            return result;
          };
          const before = await capture();
          const first = await run();
          assert.equal(first.status, 201, JSON.stringify(first.body));
          assert.equal(first.body.modelVersion, "departures-v1");
          const second = await run();
          assert.deepEqual(second.body.baseline, first.body.baseline);
          assert.deepEqual(second.body.scenario, first.body.scenario);
          assert.deepEqual(await capture(), before);
          for (const changes of [
            { stepMinutes: 7 },
            { seed: -1 },
            { scenarioArrivalsPerStep: 0 },
            { scenarioArrivalsPerStep: config.body.maximumArrivalsPerStep + 1 },
            { horizonMinutes: (config.body.maximumSteps + 1) * 5 },
            { hubId: "bad" },
            { role: "operator" },
            { seed: "42" },
            { hubId: "00000000-0000-4000-8000-000000000000" },
          ])
            assert.equal(
              (await run(changes)).status,
              400,
              JSON.stringify(changes),
            );
          await pool.query(
            "UPDATE settings SET value='1' WHERE key='simulationMaximumSteps'",
          );
          assert.equal((await run()).status, 400);
          await pool.query(
            "UPDATE settings SET value=$1 WHERE key='simulationMaximumSteps'",
            [JSON.stringify(config.body.maximumSteps)],
          );
        },
      );
      await t.test(
        "T22 scenarios, persisted history, permissions, retries and operational isolation",
        async () => {
          await checkScenarios({ request, pool, operator, student, hubs });
        },
      );
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
      await checkRelease({ t, request, pool, operator, student });
      await t.test(
        "current account role and activation take effect on an existing session",
        async () => {
          try {
            await pool.query("UPDATE users SET role='student' WHERE id=$1", [
              operator.body.id,
            ]);
            const denied = await request("/network/overview", {
              cookie: operator.cookie,
            });
            assert.equal(denied.status, 403);
            assert.equal(denied.body.statusCode, 403);
            assert.equal(denied.body.code, "HTTP_403");
            assert.equal(typeof denied.body.message, "string");
            assert.equal(
              (await request("/auth/me", { cookie: operator.cookie })).body
                .role,
              "student",
            );
            await pool.query("UPDATE users SET active=false WHERE id=$1", [
              operator.body.id,
            ]);
            assert.equal(
              (await request("/auth/me", { cookie: operator.cookie })).status,
              401,
            );
            assert.equal(
              (await request("/hubs", { cookie: operator.cookie })).status,
              401,
            );
            assert.equal(
              (
                await request("/auth/login", {
                  method: "POST",
                  body: {
                    email: env.SEED_OPERATOR_EMAIL,
                    password: env.SEED_OPERATOR_PASSWORD,
                  },
                })
              ).status,
              401,
            );
          } finally {
            await pool.query(
              "UPDATE users SET role='operator', active=true WHERE id=$1",
              [operator.body.id],
            );
          }
          assert.equal(
            (await request("/network/overview", { cookie: operator.cookie }))
              .status,
            200,
          );
        },
      );
      await t.test(
        "login rotates the current session and stores only a token hash",
        async () => {
          const body = {
            email: env.SEED_STUDENT_EMAIL,
            password: env.SEED_STUDENT_PASSWORD,
          };
          const first = await request("/auth/login", { method: "POST", body });
          const second = await request("/auth/login", {
            method: "POST",
            body,
            cookie: first.cookie,
          });
          assert.equal(first.status, 201);
          assert.equal(second.status, 201);
          assert.notEqual(first.cookie, second.cookie);
          assert.equal(
            (await request("/auth/me", { cookie: first.cookie })).status,
            401,
          );
          assert.equal(
            (await request("/auth/me", { cookie: second.cookie })).status,
            200,
          );
          const rawToken = second.cookie.slice("session=".length);
          const hashes = (
            await pool.query(
              "SELECT token_hash FROM sessions WHERE user_id=$1",
              [second.body.id],
            )
          ).rows.map((row) => row.token_hash);
          assert.ok(
            hashes.includes(
              createHash("sha256").update(rawToken).digest("hex"),
            ),
          );
          assert.ok(!hashes.includes(rawToken));
          const cookieHeader = second.headers.get("set-cookie");
          assert.match(cookieHeader, /HttpOnly/i);
          assert.match(cookieHeader, /SameSite=Strict/i);
          assert.match(cookieHeader, /Path=\/api/i);
          assert.match(
            cookieHeader,
            new RegExp(`Max-Age=${env.SESSION_TTL_SECONDS}(?:;|$)`, "i"),
          );
          const logout = await request("/auth/logout", {
            method: "POST",
            cookie: second.cookie,
          });
          assert.match(logout.headers.get("set-cookie"), /Path=\/api/i);
          assert.equal(
            (await request("/auth/me", { cookie: second.cookie })).status,
            401,
          );
        },
      );
      await t.test(
        "login rate limit and Secure cookie config enforced on an isolated API instance",
        async () => {
          const isolatedPort = await freePort();
          const isolatedBase = `http://127.0.0.1:${isolatedPort}/api`;
          const limited = spawn(process.execPath, ["apps/api/dist/main.js"], {
            cwd: root,
            env: {
              ...env,
              API_PORT: String(isolatedPort),
              COOKIE_SECURE: "true",
              LOGIN_MAX_ATTEMPTS: "2",
            },
            stdio: ["ignore", "pipe", "pipe"],
          });
          let output = "";
          limited.stdout.on("data", (chunk) => {
            output += chunk;
          });
          limited.stderr.on("data", (chunk) => {
            output += chunk;
          });
          try {
            let ready = false;
            for (let attempt = 0; attempt < 100; attempt++) {
              if (limited.exitCode !== null) throw new Error(output);
              try {
                if ((await fetch(isolatedBase + "/health")).ok) {
                  ready = true;
                  break;
                }
              } catch {}
              await new Promise((resolve) => setTimeout(resolve, 100));
            }
            assert.ok(ready, "Isolated API should start");
            const login = (password) =>
              fetch(isolatedBase + "/auth/login", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Origin: env.WEB_ORIGIN,
                },
                body: JSON.stringify({
                  email: env.SEED_OPERATOR_EMAIL,
                  password,
                }),
              });
            const valid = await login(env.SEED_OPERATOR_PASSWORD);
            assert.equal(valid.status, 201);
            const cookie = valid.headers.get("set-cookie");
            assert.match(cookie, /; Secure(?:;|$)/i);
            assert.match(cookie, /HttpOnly/i);
            assert.match(cookie, /SameSite=Strict/i);
            await valid.json();
            const count = Number(
              (await pool.query("SELECT count(*) FROM sessions")).rows[0].count,
            );
            const invalid = await login("wrong");
            assert.equal(invalid.status, 401);
            await invalid.json();
            const blocked = await login(env.SEED_OPERATOR_PASSWORD);
            assert.equal(blocked.status, 429);
            assert.equal((await blocked.json()).code, "HTTP_429");
            assert.ok(Number(blocked.headers.get("retry-after")) > 0);
            assert.equal(blocked.headers.get("set-cookie"), null);
            assert.equal(
              Number(
                (await pool.query("SELECT count(*) FROM sessions")).rows[0]
                  .count,
              ),
              count,
            );
          } finally {
            if (limited.exitCode === null) {
              limited.kill("SIGTERM");
              await once(limited, "exit");
            }
          }
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
