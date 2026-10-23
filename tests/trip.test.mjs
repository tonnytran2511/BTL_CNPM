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
// T08: nhận/trả xe và chuyến thuê trên PostgreSQL thật. Cần `npm run build` trước (test chạy apps/api/dist).
test(
  "T08 pickup / return trip against real PostgreSQL",
  { timeout: 120_000 },
  async (t) => {
    const directory = await mkdtemp(resolve(tmpdir(), "emobility-trip-"));
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
      DATABASE_URL: `postgresql://test_user:${password}@127.0.0.1:${dbPort}/trip`,
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
      const headers = { "Content-Type": "application/json" };
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
      await db.createDatabase("trip");
      await command("scripts/migrate.mjs", env);
      await command("scripts/seed.mjs", env);
      pool = new pg.Pool({ connectionString: env.DATABASE_URL });
      server = spawn(process.execPath, ["apps/api/dist/main.js"], {
        cwd: root,
        env,
        stdio: ["ignore", "pipe", "pipe"],
      });
      let ready = false;
      for (let i = 0; i < 100 && !ready; i++) {
        try {
          ready = (await call("GET", "/health")).status === 200;
        } catch {}
        if (!ready) await new Promise((r) => setTimeout(r, 100));
      }
      assert.ok(ready, "API did not start");
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
      const hubId = async (code) =>
        (await pool.query("SELECT id FROM hubs WHERE code=$1", [code])).rows[0]
          .id;
      const row = async (sql, args = []) =>
        (await pool.query(sql, args)).rows[0];
      const vehicleRow = (code) =>
        row(
          "SELECT status, hub_id, battery_percent FROM vehicles WHERE code=$1",
          [code],
        );
      const spaceOf = (code) =>
        row(
          `SELECT p.status, h.code AS hub FROM parking_spaces p
             JOIN vehicles v ON v.id=p.vehicle_id JOIN hubs h ON h.id=p.hub_id WHERE v.code=$1`,
          [code],
        );
      const count = async (sql, args = []) =>
        Number((await row(sql, args)).count);
      const tripCount = () => count("SELECT count(*) FROM trips");
      // Đưa dữ liệu về trạng thái ban đầu của seed (METRO-M01 được mở lại để đặt được).
      const reset = async () => {
        await pool.query("DELETE FROM trips");
        await pool.query("DELETE FROM vehicle_reservations");
        await pool.query(
          "UPDATE parking_spaces SET status='available', vehicle_id=NULL, hold_expires_at=NULL",
        );
        await pool.query("UPDATE hubs SET status='active'");
        await pool.query(
          `UPDATE vehicles SET hub_id=(SELECT id FROM hubs WHERE hubs.code=split_part(vehicles.code,'-',1)),
             status=CASE code WHEN 'METRO-B02' THEN 'charging' WHEN 'DORM-M01' THEN 'maintenance' ELSE 'available' END`,
        );
        await pool.query(
          `UPDATE parking_spaces p SET status='occupied', vehicle_id=v.id
             FROM (SELECT id, hub_id, row_number() OVER (PARTITION BY hub_id ORDER BY code) AS rn FROM vehicles) v
            WHERE p.hub_id=v.hub_id AND p.code='P'||v.rn`,
        );
      };
      const reserve = (cookie, id) =>
        call("POST", "/vehicle-reservations", cookie, { vehicleId: id });
      const pickup = (cookie, id) =>
        call("POST", `/vehicle-reservations/${id}/pickup`, cookie);
      const giveBack = (cookie, tripId, target) =>
        call("POST", `/trips/${tripId}/return`, cookie, {
          targetHubId: target,
        });
      const startTrip = async (cookie, code) => {
        const r = await reserve(cookie, await vehicleId(code));
        assert.equal(r.status, 201, JSON.stringify(r.body));
        const p = await pickup(cookie, r.body.id);
        assert.equal(p.status, 200, JSON.stringify(p.body));
        return { reservationId: r.body.id, trip: p.body };
      };
      const fillHub = (code) =>
        pool.query(
          `UPDATE parking_spaces SET status='held', hold_expires_at=now()+interval '1 hour'
            WHERE status='available' AND hub_id=(SELECT id FROM hubs WHERE code=$1)`,
          [code],
        );

      await t.test("anonymous requests are rejected", async () => {
        const id = "00000000-0000-4000-8000-000000000000";
        assert.equal((await call("GET", "/trips")).status, 401);
        assert.equal(
          (await call("POST", `/vehicle-reservations/${id}/pickup`)).status,
          401,
        );
        assert.equal(
          (
            await call("POST", `/trips/${id}/return`, undefined, {
              targetHubId: id,
            })
          ).status,
          401,
        );
      });

      await t.test(
        "validation: bad ids, unknown ids, missing or extra fields",
        async () => {
          await reset();
          const id = "00000000-0000-4000-8000-000000000000";
          assert.equal((await pickup(student, "abc")).status, 400);
          assert.equal((await pickup(student, id)).status, 404);
          assert.equal(
            (
              await call("POST", "/trips/abc/return", student, {
                targetHubId: id,
              })
            ).status,
            400,
          );
          assert.equal(
            (await call("POST", `/trips/${id}/return`, student, {})).status,
            400,
          );
          assert.equal(
            (
              await call("POST", `/trips/${id}/return`, student, {
                targetHubId: "x",
              })
            ).status,
            400,
          );
          assert.equal((await giveBack(student, id, id)).status, 404);
          const { trip } = await startTrip(student, "METRO-B01");
          assert.equal(
            (
              await call("POST", `/trips/${trip.id}/return`, student, {
                targetHubId: await hubId("DORM"),
                userId: "x",
              })
            ).status,
            400,
          );
          assert.equal((await giveBack(student, trip.id, id)).status, 404); // Hub đích không tồn tại
          assert.equal(
            (await row("SELECT status FROM trips WHERE id=$1", [trip.id]))
              .status,
            "active",
          );
        },
      );

      await t.test(
        "pickup: one transaction fulfils the reservation, starts the trip, frees the source space",
        async () => {
          await reset();
          const before = await vehicleRow("METRO-B01");
          assert.equal((await spaceOf("METRO-B01")).hub, "METRO");
          const { reservationId, trip } = await startTrip(student, "METRO-B01");
          assert.equal(trip.status, "active");
          assert.equal(trip.endedAt, null);
          assert.equal(trip.targetHub, null);
          assert.equal(trip.endBatteryPercent, null);
          assert.equal(trip.startBatteryPercent, before.battery_percent);
          assert.equal(trip.vehicle.code, "METRO-B01");
          assert.equal(trip.sourceHub.name, "Hub ga Metro");
          assert.equal(trip.reservationId, reservationId);
          const reservation = await row(
            "SELECT status, closed_at FROM vehicle_reservations WHERE id=$1",
            [reservationId],
          );
          assert.equal(reservation.status, "fulfilled");
          assert.ok(reservation.closed_at);
          const vehicle = await vehicleRow("METRO-B01");
          assert.equal(vehicle.status, "in_use");
          assert.equal(vehicle.hub_id, null); // xe đang đi, không còn tính vào Hub
          assert.equal(await spaceOf("METRO-B01"), undefined);
          assert.equal(
            await count(
              "SELECT count(*) FROM parking_spaces WHERE status='occupied' AND hub_id=$1",
              [await hubId("METRO")],
            ),
            2, // METRO-B02 và METRO-M01 còn đỗ
          );
          const mine = await call("GET", "/trips", student);
          assert.deepEqual(
            mine.body.map((x) => [x.id, x.status]),
            [[trip.id, "active"]],
          );
          assert.deepEqual((await call("GET", "/trips", operator)).body, []);
          const history = await call("GET", "/vehicle-reservations", student);
          assert.equal(history.body[0].status, "fulfilled");
          // Xe đang đi không xuất hiện khi tìm xe.
          const found = await call("GET", "/vehicles", student);
          assert.ok(!found.body.vehicles.some((v) => v.code === "METRO-B01"));
        },
      );

      await t.test(
        "return: claims a target space, completes the trip and moves the vehicle",
        async () => {
          await reset();
          const { trip } = await startTrip(student, "METRO-B01");
          const dorm = await hubId("DORM");
          const r = await giveBack(student, trip.id, dorm);
          assert.equal(r.status, 200, JSON.stringify(r.body));
          assert.equal(r.body.status, "completed");
          assert.equal(r.body.targetHub.name, "Hub ký túc xá");
          assert.ok(r.body.endedAt);
          assert.equal(r.body.endBatteryPercent, 82);
          const vehicle = await vehicleRow("METRO-B01");
          assert.equal(vehicle.status, "available");
          assert.equal(vehicle.hub_id, dorm);
          assert.deepEqual(await spaceOf("METRO-B01"), {
            status: "occupied",
            hub: "DORM",
          });
          const found = await call("GET", `/vehicles?hubId=${dorm}`, student);
          assert.ok(found.body.vehicles.some((v) => v.code === "METRO-B01"));
          assert.equal(
            (await call("GET", "/trips", student)).body[0].status,
            "completed",
          );
        },
      );

      await t.test(
        "repeated pickup and return do not duplicate or corrupt data",
        async () => {
          await reset();
          const { reservationId, trip } = await startTrip(student, "METRO-B01");
          const again = await pickup(student, reservationId);
          assert.equal(again.status, 200);
          assert.equal(again.body.id, trip.id);
          assert.equal(await tripCount(), 1);
          const dorm = await hubId("DORM");
          const first = await giveBack(student, trip.id, dorm);
          const second = await giveBack(student, trip.id, dorm);
          assert.equal(second.status, 200);
          assert.equal(second.body.endedAt, first.body.endedAt);
          assert.equal(
            await count(
              "SELECT count(*) FROM parking_spaces WHERE vehicle_id=(SELECT id FROM vehicles WHERE code='METRO-B01')",
            ),
            1,
          );
          const other = await giveBack(student, trip.id, await hubId("METRO"));
          assert.equal(other.status, 409);
          assert.equal((await spaceOf("METRO-B01")).hub, "DORM");
        },
      );

      await t.test(
        "two parallel pickups of the same reservation create exactly one trip",
        async () => {
          await reset();
          const r = await reserve(student, await vehicleId("METRO-B01"));
          const results = await Promise.all([
            pickup(student, r.body.id),
            pickup(student, r.body.id),
          ]);
          assert.deepEqual(
            results.map((x) => x.status),
            [200, 200],
          );
          assert.equal(results[0].body.id, results[1].body.id);
          assert.equal(await tripCount(), 1);
        },
      );

      await t.test("only the owner may pick up or return", async () => {
        await reset();
        const r = await reserve(student, await vehicleId("METRO-B01"));
        assert.equal((await pickup(operator, r.body.id)).status, 403);
        assert.equal((await vehicleRow("METRO-B01")).status, "reserved");
        const p = await pickup(student, r.body.id);
        assert.equal(
          (await giveBack(operator, p.body.id, await hubId("DORM"))).status,
          403,
        );
        assert.equal(
          (await row("SELECT status FROM trips WHERE id=$1", [p.body.id]))
            .status,
          "active",
        );
        assert.equal((await vehicleRow("METRO-B01")).status, "in_use");
      });

      await t.test(
        "pickup refused for cancelled, expired or broken reservations; nothing changes",
        async () => {
          await reset();
          const cancelled = await reserve(
            student,
            await vehicleId("METRO-B01"),
          );
          await call(
            "POST",
            `/vehicle-reservations/${cancelled.body.id}/cancel`,
            student,
          );
          assert.equal((await pickup(student, cancelled.body.id)).status, 409);

          const expired = await reserve(student, await vehicleId("DORM-B01"));
          await pool.query(
            "UPDATE vehicle_reservations SET created_at=now()-interval '30 minutes', expires_at=now()-interval '1 minute' WHERE id=$1",
            [expired.body.id],
          );
          const late = await pickup(student, expired.body.id);
          assert.equal(late.status, 409);
          assert.match(late.body.message, /thời hạn/);
          assert.equal((await vehicleRow("DORM-B01")).status, "reserved");
          assert.deepEqual(await spaceOf("DORM-B01"), {
            status: "occupied",
            hub: "DORM",
          });

          await reset();
          const broken = await reserve(student, await vehicleId("METRO-B01"));
          await pool.query(
            "UPDATE vehicles SET status='maintenance' WHERE code='METRO-B01'",
          );
          assert.equal((await pickup(student, broken.body.id)).status, 409);
          assert.equal(
            (
              await row("SELECT status FROM vehicle_reservations WHERE id=$1", [
                broken.body.id,
              ])
            ).status,
            "active",
          );
          assert.equal((await spaceOf("METRO-B01")).status, "occupied");
          assert.equal(await tripCount(), 0);
        },
      );

      await t.test(
        "pickup rolls everything back when the vehicle does not occupy its source space",
        async () => {
          await reset();
          const r = await reserve(student, await vehicleId("METRO-B01"));
          await pool.query(
            "UPDATE parking_spaces SET status='available', vehicle_id=NULL WHERE vehicle_id=(SELECT id FROM vehicles WHERE code='METRO-B01')",
          );
          const p = await pickup(student, r.body.id);
          assert.equal(p.status, 409);
          assert.equal(
            (
              await row("SELECT status FROM vehicle_reservations WHERE id=$1", [
                r.body.id,
              ])
            ).status,
            "active",
          );
          assert.equal((await vehicleRow("METRO-B01")).status, "reserved");
          assert.equal(await tripCount(), 0);
        },
      );

      await t.test(
        "return to a full Hub keeps the trip active and suggests other Hubs",
        async () => {
          await reset();
          const { trip } = await startTrip(student, "METRO-B01");
          await fillHub("DORM");
          const r = await giveBack(student, trip.id, await hubId("DORM"));
          assert.equal(r.status, 409);
          assert.match(r.body.message, /chỗ/);
          assert.deepEqual(
            r.body.details.suggestedHubs.map((h) => h.id),
            [await hubId("METRO")],
          );
          assert.ok(r.body.details.suggestedHubs[0].freeSpaces >= 1);
          assert.equal(
            (await row("SELECT status FROM trips WHERE id=$1", [trip.id]))
              .status,
            "active",
          );
          const vehicle = await vehicleRow("METRO-B01");
          assert.equal(vehicle.status, "in_use");
          assert.equal(vehicle.hub_id, null);
          assert.equal(await spaceOf("METRO-B01"), undefined);
          // Trả ở Hub được gợi ý thì thành công.
          const ok = await giveBack(
            student,
            trip.id,
            r.body.details.suggestedHubs[0].id,
          );
          assert.equal(ok.status, 200);
          assert.equal(ok.body.targetHub.name, "Hub ga Metro");
        },
      );

      await t.test(
        "return to an inactive Hub is refused and the trip stays active",
        async () => {
          await reset();
          const { trip } = await startTrip(student, "METRO-B01");
          await pool.query(
            "UPDATE hubs SET status='inactive' WHERE code='DORM'",
          );
          const r = await giveBack(student, trip.id, await hubId("DORM"));
          assert.equal(r.status, 409);
          assert.equal(
            (await row("SELECT status FROM trips WHERE id=$1", [trip.id]))
              .status,
            "active",
          );
          assert.deepEqual(
            r.body.details.suggestedHubs.map((h) => h.id),
            [await hubId("METRO")],
          );
        },
      );

      await t.test(
        "a space promised to a future parking booking is not given to a returning rental",
        async () => {
          await reset();
          const { trip } = await startTrip(student, "METRO-B01");
          const dorm = await hubId("DORM");
          await fillHub("DORM");
          // Mở đúng một chỗ nhưng đã có lịch đặt đỗ còn hiệu lực: không được chiếm.
          const space = await row(
            "SELECT id FROM parking_spaces WHERE hub_id=$1 AND status='held' ORDER BY code LIMIT 1",
            [dorm],
          );
          await pool.query(
            "UPDATE parking_spaces SET status='available', hold_expires_at=NULL WHERE id=$1",
            [space.id],
          );
          const owner = await row("SELECT id FROM users WHERE email=$1", [
            env.SEED_STUDENT_EMAIL,
          ]);
          const privateVehicle = await row(
            "INSERT INTO private_vehicles(owner_id, code, type) VALUES($1,'PV-1','electric_bicycle') RETURNING id",
            [owner.id],
          );
          await pool.query(
            `INSERT INTO parking_bookings(user_id, private_vehicle_id, parking_space_id, starts_at, ends_at)
           VALUES($1,$2,$3, now()+interval '1 hour', now()+interval '3 hours')`,
            [owner.id, privateVehicle.id, space.id],
          );
          const r = await giveBack(student, trip.id, dorm);
          assert.equal(r.status, 409);
          await pool.query("DELETE FROM parking_bookings");
          await pool.query("DELETE FROM private_vehicles");
        },
      );

      await t.test(
        "two vehicles racing for the last space: exactly one return succeeds",
        async () => {
          await reset();
          const a = await startTrip(student, "METRO-B01");
          const b = await startTrip(operator, "DORM-B01");
          const dorm = await hubId("DORM");
          await fillHub("DORM");
          const free = await row(
            "SELECT id FROM parking_spaces WHERE hub_id=$1 AND status='held' ORDER BY code LIMIT 1",
            [dorm],
          );
          await pool.query(
            "UPDATE parking_spaces SET status='available', hold_expires_at=NULL WHERE id=$1",
            [free.id],
          );
          const results = await Promise.all([
            giveBack(student, a.trip.id, dorm),
            giveBack(operator, b.trip.id, dorm),
          ]);
          assert.deepEqual(results.map((x) => x.status).sort(), [200, 409]);
          assert.equal(
            await count("SELECT count(*) FROM trips WHERE status='completed'"),
            1,
          );
          assert.equal(
            await count("SELECT count(*) FROM trips WHERE status='active'"),
            1,
          );
          assert.equal(
            await count(
              "SELECT count(*) FROM parking_spaces WHERE status='occupied' AND hub_id=$1 AND vehicle_id IS NOT NULL",
              [dorm],
            ),
            1 + 1, // DORM-M01 đã đỗ sẵn + xe vừa trả
          );
          const loser = results.find((x) => x.status === 409);
          assert.ok(Array.isArray(loser.body.details.suggestedHubs));
        },
      );

      await t.test(
        "return refused when the vehicle was taken out of in_use (incident)",
        async () => {
          await reset();
          const { trip } = await startTrip(student, "METRO-B01");
          await pool.query(
            "UPDATE vehicles SET status='maintenance' WHERE code='METRO-B01'",
          );
          const r = await giveBack(student, trip.id, await hubId("DORM"));
          assert.equal(r.status, 409);
          assert.equal(
            (await row("SELECT status FROM trips WHERE id=$1", [trip.id]))
              .status,
            "active",
          );
          assert.equal((await vehicleRow("METRO-B01")).status, "maintenance");
          assert.equal(await spaceOf("METRO-B01"), undefined);
        },
      );
      await t.test(
        "all active trips remain listed even when older than the history window",
        async () => {
          await reset();
          const first = await startTrip(student, "METRO-B01");
          const second = await startTrip(student, "DORM-B01");
          // An old unreturned trip must not disappear behind completed history.
          await pool.query(
            "UPDATE trips SET started_at=now()-interval '1 year' WHERE id=$1",
            [first.trip.id],
          );
          await pool.query(
            `WITH history AS (
            INSERT INTO vehicle_reservations(user_id,vehicle_id,source_hub_id,status,created_at,expires_at,closed_at)
            SELECT t.user_id,t.vehicle_id,t.source_hub_id,'fulfilled',now()-interval '2 days',now()-interval '1 day',now()-interval '1 day'
              FROM trips t CROSS JOIN generate_series(1,101) WHERE t.id=$1 RETURNING *
          ) INSERT INTO trips(reservation_id,user_id,vehicle_id,source_hub_id,target_hub_id,status,started_at,ended_at,start_battery_percent,end_battery_percent)
            SELECT id,user_id,vehicle_id,source_hub_id,source_hub_id,'completed',now()-interval '1 day',now(),80,80 FROM history`,
            [first.trip.id],
          );
          const list = await call("GET", "/trips", student);
          assert.equal(list.status, 200);
          assert.equal(
            list.body.filter((trip) => trip.status === "completed").length,
            100,
          );
          assert.deepEqual(
            list.body
              .filter((trip) => trip.status === "active")
              .map((trip) => trip.id)
              .sort(),
            [first.trip.id, second.trip.id].sort(),
          );
          const before = await call("GET", "/network/overview", operator);
          assert.equal(
            (await giveBack(student, first.trip.id, await hubId("METRO")))
              .status,
            200,
          );
          assert.equal(
            (await giveBack(student, second.trip.id, await hubId("DORM")))
              .status,
            200,
          );
          const after = await call("GET", "/network/overview", operator);
          assert.equal(
            after.body.totals.availableVehicles,
            before.body.totals.availableVehicles + 2,
          );
          assert.equal(
            after.body.totals.availableParking,
            before.body.totals.availableParking - 2,
          );
        },
      );
      await t.test(
        "return suggestions use validated operational configuration",
        async () => {
          await reset();
          const { trip } = await startTrip(student, "METRO-B01");
          const target = await hubId("DORM");
          await fillHub("DORM");
          const extra = await row(
            "INSERT INTO hubs(code,name,location) VALUES('SUGGEST','Suggestion Hub','Test') RETURNING id",
          );
          await pool.query(
            "INSERT INTO parking_spaces(hub_id,code) VALUES($1,'P1')",
            [extra.id],
          );
          try {
            for (const limit of [1, 2]) {
              await pool.query(
                "UPDATE settings SET value=$1 WHERE key='returnHubSuggestionLimit'",
                [JSON.stringify(limit)],
              );
              const result = await giveBack(student, trip.id, target);
              assert.equal(result.status, 409);
              assert.equal(result.body.details.suggestedHubs.length, limit);
            }
            await pool.query(
              "UPDATE settings SET value='0' WHERE key='returnHubSuggestionLimit'",
            );
            const invalid = await giveBack(student, trip.id, target);
            assert.equal(invalid.status, 500);
            assert.equal(invalid.body.details, undefined);
            assert.equal(
              (await row("SELECT status FROM trips WHERE id=$1", [trip.id]))
                .status,
              "active",
            );
          } finally {
            await pool.query(
              "UPDATE settings SET value='5' WHERE key='returnHubSuggestionLimit'",
            );
            await pool.query("DELETE FROM parking_spaces WHERE hub_id=$1", [
              extra.id,
            ]);
            await pool.query("DELETE FROM hubs WHERE id=$1", [extra.id]);
          }
        },
      );
      await t.test(
        "pickup and return wait for a Hub without holding the vehicle lock",
        async () => {
          await reset();
          const reservation = await reserve(
            student,
            await vehicleId("METRO-B01"),
          );
          const id = await vehicleId("METRO-B01");
          for (const action of ["pickup", "return"]) {
            const hub = await hubId(action === "pickup" ? "METRO" : "DORM");
            const blocker = await pool.connect();
            let pending;
            try {
              await blocker.query("BEGIN");
              await blocker.query(
                "SELECT id FROM hubs WHERE id=$1 FOR UPDATE",
                [hub],
              );
              pending =
                action === "pickup"
                  ? pickup(student, reservation.body.id)
                  : giveBack(
                      student,
                      (await row("SELECT id FROM trips WHERE status='active'"))
                        .id,
                      hub,
                    );
              let waiting = false;
              for (let i = 0; i < 100; i++) {
                const lock = await pool.query(
                  "SELECT pid FROM pg_stat_activity WHERE application_name=$1 AND wait_event_type='Lock' AND cardinality(pg_blocking_pids(pid))>0",
                  [env.APP_NAME],
                );
                if (lock.rowCount) {
                  waiting = true;
                  break;
                }
                await new Promise((resolve) => setTimeout(resolve, 10));
              }
              assert.ok(
                waiting,
                `${action} should be waiting for the locked Hub`,
              );
              // A Hub-first caller can still lock the vehicle: no inverted lock cycle.
              await blocker.query(
                "SELECT id FROM vehicles WHERE id=$1 FOR UPDATE NOWAIT",
                [id],
              );
            } finally {
              await blocker.query("ROLLBACK");
              blocker.release();
              if (pending) assert.equal((await pending).status, 200);
            }
          }
        },
      );
      await t.test(
        "pickup rechecks expiry after waiting for resource locks",
        async () => {
          await reset();
          const reservation = await reserve(
            student,
            await vehicleId("METRO-B01"),
          );
          const blocker = await pool.connect();
          let pending;
          try {
            await blocker.query("BEGIN");
            await blocker.query("SELECT id FROM hubs WHERE id=$1 FOR UPDATE", [
              await hubId("METRO"),
            ]);
            await pool.query(
              "UPDATE vehicle_reservations SET created_at=clock_timestamp()-interval '1 minute', expires_at=clock_timestamp()+interval '1 second' WHERE id=$1",
              [reservation.body.id],
            );
            pending = pickup(student, reservation.body.id);
            let blocked = false;
            for (let i = 0; i < 100; i++) {
              const waiting = await pool.query(
                "SELECT pid FROM pg_stat_activity WHERE application_name=$1 AND wait_event_type='Lock' AND cardinality(pg_blocking_pids(pid))>0",
                [env.APP_NAME],
              );
              if (waiting.rowCount) {
                blocked = true;
                break;
              }
              await new Promise((resolve) => setTimeout(resolve, 10));
            }
            assert.ok(
              blocked,
              "Pickup must have started and reached the held Hub before expiry",
            );
            let expired = false;
            for (let i = 0; i < 200; i++) {
              expired = (
                await row(
                  "SELECT clock_timestamp() >= expires_at AS expired FROM vehicle_reservations WHERE id=$1",
                  [reservation.body.id],
                )
              ).expired;
              if (expired) break;
              await new Promise((resolve) => setTimeout(resolve, 10));
            }
            assert.ok(expired);
          } finally {
            await blocker.query("ROLLBACK");
            blocker.release();
            if (pending) assert.equal((await pending).status, 409);
          }
          assert.equal(await tripCount(), 0);
          assert.equal((await vehicleRow("METRO-B01")).status, "reserved");
          assert.equal((await spaceOf("METRO-B01")).status, "occupied");
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
