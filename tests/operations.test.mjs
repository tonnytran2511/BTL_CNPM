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
  "T12 operations and rental integration against real PostgreSQL",
  { timeout: 120_000 },
  async (t) => {
    const directory = await mkdtemp(resolve(tmpdir(), "emobility-operations-"));
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
      DATABASE_URL: `postgresql://test_user:${password}@127.0.0.1:${dbPort}/operations`,
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
    try {
      await db.initialise();
      await db.start();
      await db.createDatabase("operations");
      await command("scripts/migrate.mjs", env);
      await command("scripts/seed.mjs", env);
      pool = new pg.Pool({ connectionString: env.DATABASE_URL });
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
      const { randomUUID } = await import("node:crypto");
      const post = (path, body, cookie = operator) =>
        call("POST", path, cookie, body);
      const fleet = async () => {
        const source = (
          await pool.query(
            "INSERT INTO hubs(code,name,location) VALUES($1,'Source','Test') RETURNING id",
            [randomUUID()],
          )
        ).rows[0].id;
        const target = (
          await pool.query(
            "INSERT INTO hubs(code,name,location) VALUES($1,'Target','Test') RETURNING id",
            [randomUUID()],
          )
        ).rows[0].id;
        const ids = [];
        for (let i = 0; i < 2; i++) {
          const id = (
            await pool.query(
              "INSERT INTO vehicles(code,hub_id,type,battery_percent,status) VALUES($1,$2,'electric_bicycle',80,'available') RETURNING id",
              [randomUUID(), source],
            )
          ).rows[0].id;
          ids.push(id);
          await pool.query(
            "INSERT INTO parking_spaces(hub_id,code,status,vehicle_id) VALUES($1,$2,'occupied',$3)",
            [source, String(i), id],
          );
        }
        return { sourceHubId: source, targetHubId: target, vehicleIds: ids };
      };
      const states = async (ids) =>
        (
          await pool.query(
            "SELECT id,status,hub_id FROM vehicles WHERE id=ANY($1::uuid[]) ORDER BY id",
            [ids],
          )
        ).rows;
      const order = async (body) => {
        const r = await post("/redistributions", body);
        assert.equal(r.status, 201, JSON.stringify(r));
        return r.body;
      };
      await t.test(
        "operators only; invalid/blank/spoofed payloads rejected before writes",
        async () => {
          const f = await fleet();
          assert.equal(
            (await call("POST", "/redistributions", undefined, f)).status,
            401,
          );
          assert.equal(
            (await post("/redistributions", f, student)).status,
            403,
          );
          assert.equal(
            (
              await post(
                "/incidents",
                {
                  resourceType: "vehicle",
                  resourceId: f.vehicleIds[0],
                  description: "fault",
                },
                student,
              )
            ).status,
            403,
          );
          assert.equal(
            (await post("/redistributions", { ...f, createdBy: randomUUID() }))
              .status,
            400,
          );
          assert.equal(
            (await post("/redistributions", { ...f, vehicleIds: [] })).status,
            400,
          );
          assert.equal(
            (await post("/redistributions", { ...f, vehicleIds: ["bad"] }))
              .status,
            400,
          );
          assert.equal(
            (
              await post("/incidents", {
                resourceType: "vehicle",
                resourceId: f.vehicleIds[0],
                description: "   ",
              })
            ).status,
            400,
          );
          assert.equal(
            (
              await post("/incidents", {
                resourceType: "vehicle",
                resourceId: randomUUID(),
                description: "missing",
              })
            ).status,
            404,
          );
        },
      );
      await t.test(
        "incident actor/time, revalidation at start, resolve and terminal-state guards",
        async () => {
          const f = await fleet(),
            pending = await order(f);
          const incident = await post("/incidents", {
            resourceType: "vehicle",
            resourceId: f.vehicleIds[0],
            description: "  Check brake  ",
          });
          assert.equal(incident.status, 201);
          assert.equal(incident.body.description, "Check brake");
          const actor = (
            await pool.query("SELECT id FROM users WHERE role='operator'")
          ).rows[0].id;
          assert.equal(incident.body.reportedBy, actor);
          assert.equal(incident.body.status, "open");
          assert.ok(Date.parse(incident.body.createdAt));
          assert.equal(
            (await post(`/redistributions/${pending.id}/start`)).status,
            409,
          );
          assert.ok(
            (await states(f.vehicleIds)).every((v) => v.status === "available"),
          );
          const resolved = await post(`/incidents/${incident.body.id}/resolve`);
          assert.equal(resolved.status, 201);
          assert.equal(resolved.body.status, "resolved");
          assert.ok(Date.parse(resolved.body.resolvedAt));
          assert.equal(
            (await post(`/incidents/${incident.body.id}/resolve`)).status,
            409,
          );
          assert.equal(
            (await post(`/incidents/${randomUUID()}/resolve`)).status,
            404,
          );
          assert.equal(
            (await post(`/redistributions/${pending.id}/start`)).status,
            201,
          );
          assert.equal(
            (await post(`/redistributions/${pending.id}/start`)).status,
            409,
          );
          assert.equal(
            (await post(`/redistributions/${pending.id}/cancel`)).status,
            409,
          );
        },
      );
      await t.test(
        "pending/cancel does not move vehicles; active Hub/source/duplicate checks",
        async () => {
          const f = await fleet(),
            before = await states(f.vehicleIds);
          const pending = await order(f);
          assert.deepEqual(await states(f.vehicleIds), before);
          const cancelled = await post(`/redistributions/${pending.id}/cancel`);
          assert.equal(cancelled.status, 201);
          assert.equal(cancelled.body.status, "cancelled");
          assert.deepEqual(await states(f.vehicleIds), before);
          assert.equal(
            (await post(`/redistributions/${pending.id}/cancel`)).status,
            409,
          );
          assert.equal(
            (await post(`/redistributions/${pending.id}/start`)).status,
            409,
          );
          assert.equal(
            (
              await post("/redistributions", {
                ...f,
                targetHubId: f.sourceHubId,
              })
            ).status,
            422,
          );
          assert.equal(
            (
              await post("/redistributions", {
                ...f,
                vehicleIds: [f.vehicleIds[0], f.vehicleIds[0]],
              })
            ).status,
            422,
          );
          assert.equal(
            (
              await post("/redistributions", {
                ...f,
                sourceHubId: f.targetHubId,
                targetHubId: f.sourceHubId,
              })
            ).status,
            409,
          );
          await pool.query("UPDATE hubs SET status='inactive' WHERE id=$1", [
            f.targetHubId,
          ]);
          assert.equal((await post("/redistributions", f)).status, 409);
          assert.equal(
            (await post(`/redistributions/${randomUUID()}/start`)).status,
            404,
          );
        },
      );
      await t.test(
        "start rejects changed Hub or one busy vehicle without partial writes",
        async () => {
          const f = await fleet(),
            p = await order(f);
          await pool.query("UPDATE hubs SET status='inactive' WHERE id=$1", [
            f.targetHubId,
          ]);
          assert.equal(
            (await post(`/redistributions/${p.id}/start`)).status,
            409,
          );
          await pool.query("UPDATE hubs SET status='active' WHERE id=$1", [
            f.targetHubId,
          ]);
          await pool.query(
            "UPDATE vehicles SET status='maintenance' WHERE id=$1",
            [f.vehicleIds[1]],
          );
          const before = await states(f.vehicleIds);
          assert.equal(
            (await post(`/redistributions/${p.id}/start`)).status,
            409,
          );
          assert.deepEqual(await states(f.vehicleIds), before);
          assert.equal(
            (
              await pool.query(
                "SELECT status FROM redistributions WHERE id=$1",
                [p.id],
              )
            ).rows[0].status,
            "pending",
          );
        },
      );
      await t.test(
        "two orders race for the same fleet: one start succeeds",
        async () => {
          const f = await fleet(),
            a = await order(f),
            b = await order(f);
          const results = await Promise.all([
            post(`/redistributions/${a.id}/start`),
            post(`/redistributions/${b.id}/start`),
          ]);
          assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
          assert.ok(
            (await states(f.vehicleIds)).every(
              (v) =>
                v.status === "redistributing" && v.hub_id === f.sourceHubId,
            ),
          );
        },
      );
      await t.test(
        "rental reservation and redistribution start cannot both claim a vehicle",
        async () => {
          const f = await fleet(),
            p = await order(f);
          const results = await Promise.all([
            post(`/redistributions/${p.id}/start`),
            post(
              "/vehicle-reservations",
              { vehicleId: f.vehicleIds[0] },
              student,
            ),
          ]);
          assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
          const rows = await states(f.vehicleIds);
          assert.ok(
            rows.some((v) => ["reserved", "redistributing"].includes(v.status)),
          );
        },
      );
      await t.test(
        "failure after claiming vehicles rolls back the complete start",
        async () => {
          const f = await fleet(),
            p = await order(f),
            before = await states(f.vehicleIds);
          await pool.query(`CREATE FUNCTION reject_operations_start() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test rollback'; END $$;
          CREATE TRIGGER reject_operations_start BEFORE UPDATE ON redistributions FOR EACH ROW WHEN (NEW.status='in_progress') EXECUTE FUNCTION reject_operations_start()`);
          try {
            assert.equal(
              (await post(`/redistributions/${p.id}/start`)).status,
              500,
            );
            assert.deepEqual(await states(f.vehicleIds), before);
            assert.equal(
              (
                await pool.query(
                  "SELECT status FROM redistributions WHERE id=$1",
                  [p.id],
                )
              ).rows[0].status,
              "pending",
            );
          } finally {
            await pool.query(
              "DROP TRIGGER reject_operations_start ON redistributions; DROP FUNCTION reject_operations_start()",
            );
          }
        },
      );
    } finally {
      server?.kill();
      await pool?.end();
      await db.stop().catch(() => {});
      await rm(directory, { recursive: true, force: true });
    }
  },
);
