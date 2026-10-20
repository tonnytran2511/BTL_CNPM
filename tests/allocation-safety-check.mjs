import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import "reflect-metadata";
import { Database } from "../apps/api/dist/database/database.module.js";
import { MobilityRepository } from "../apps/api/dist/mobility/mobility.repository.js";
import { MobilityService } from "../apps/api/dist/mobility/mobility.service.js";
import { ChargingAllocationRepository } from "../apps/api/dist/mobility/charging-allocation.repository.js";
import { ChargingAllocationService } from "../apps/api/dist/mobility/charging-allocation.service.js";

// Executed only by the foundation harness against its isolated temporary database.
const db = new Database();
const parking = new MobilityService(new MobilityRepository(db));
const charging = new ChargingAllocationService(
  new ChargingAllocationRepository(),
);
const hubs = [],
  vehicles = [],
  keys = [];
const status = (code) => (error) => error.getStatus?.() === code;
const student = (
  await db.query("SELECT id,email,name,role FROM users WHERE email=$1", [
    process.env.SEED_STUDENT_EMAIL,
  ])
).rows[0];
const operator = (
  await db.query("SELECT id,email,name,role FROM users WHERE email=$1", [
    process.env.SEED_OPERATOR_EMAIL,
  ])
).rows[0];
const key = () => {
  const value = randomUUID();
  keys.push(value);
  return value;
};
const window = () => ({
  startsAt: new Date(Date.now() + 3600000).toISOString(),
  endsAt: new Date(Date.now() + 7200000).toISOString(),
});
async function hub({ cars = 0, free = 0, points = 0 } = {}) {
  const hubId = (
    await db.query(
      "INSERT INTO hubs(code,name,location) VALUES($1,'T18 fixture','isolated test') RETURNING id",
      [randomUUID()],
    )
  ).rows[0].id;
  hubs.push(hubId);
  const ids = [];
  for (let i = 0; i < cars; i++) {
    const id = (
      await db.query(
        "INSERT INTO private_vehicles(owner_id,code,type,battery_percent) VALUES($1,$2,'electric_bicycle',20) RETURNING id",
        [student.id, randomUUID()],
      )
    ).rows[0].id;
    vehicles.push(id);
    ids.push(id);
    await db.query(
      "INSERT INTO parking_spaces(hub_id,code,status,private_vehicle_id) VALUES($1,$2,'occupied',$3)",
      [hubId, `CAR-${i}`, id],
    );
  }
  for (let i = 0; i < free; i++)
    await db.query("INSERT INTO parking_spaces(hub_id,code) VALUES($1,$2)", [
      hubId,
      `FREE-${i}`,
    ]);
  const pointIds = [];
  for (let i = 0; i < points; i++)
    pointIds.push(
      (
        await db.query(
          "INSERT INTO charging_points(hub_id,code) VALUES($1,$2) RETURNING id",
          [hubId, `C-${i}`],
        )
      ).rows[0].id,
    );
  return { id: hubId, vehicles: ids, points: pointIds };
}
async function request(context, vehicleId = context.vehicles[0]) {
  return parking.charge(
    student,
    {
      hubId: context.id,
      vehicle: { kind: "private", id: vehicleId },
      targetBatteryPercent: 80,
    },
    key(),
  );
}
const allocate = (id, point, actor = operator) =>
  db.transaction((c) => charging.allocatePrivateRequest(actor, id, point, c));
try {
  // Different cars fight for the last slot. Same actor/key retry must replay.
  const parkingHub = await hub({ cars: 2, free: 1 });
  await db.query(
    "UPDATE parking_spaces SET private_vehicle_id=NULL,status='available' WHERE hub_id=$1 AND code LIKE 'CAR-%'",
    [parkingHub.id],
  );
  // Keep just one physical space, without changing the fixture cars.
  await db.query(
    "DELETE FROM parking_spaces WHERE hub_id=$1 AND code LIKE 'CAR-%'",
    [parkingHub.id],
  );
  const time = window();
  const attempts = await Promise.allSettled(
    parkingHub.vehicles.map((id) =>
      parking.reserve(
        student,
        { hubId: parkingHub.id, privateVehicleId: id, ...time },
        key(),
      ),
    ),
  );
  assert.equal(attempts.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(
    attempts.filter((r) => r.status === "rejected" && status(409)(r.reason))
      .length,
    1,
  );
  const initialBooking = attempts.find((r) => r.status === "fulfilled").value;
  const otherVehicle = parkingHub.vehicles.find(
    (id) => id !== initialBooking.privateVehicleId,
  );
  // Direct DB writes cannot bypass the interval constraint either.
  await assert.rejects(
    db.query(
      "INSERT INTO parking_bookings(user_id,private_vehicle_id,parking_space_id,starts_at,ends_at) VALUES($1,$2,$3,$4,$5)",
      [
        student.id,
        otherVehicle,
        initialBooking.parkingSpaceId,
        time.startsAt,
        time.endsAt,
      ],
    ),
    { code: "23P01" },
  );
  await parking.transition(student, initialBooking.id, "cancel", key());
  const replayKey = key();
  const sameInput = {
    hubId: parkingHub.id,
    privateVehicleId: otherVehicle,
    ...time,
  };
  const replay = await Promise.all([
    parking.reserve(student, sameInput, replayKey),
    parking.reserve(student, sameInput, replayKey),
  ]);
  assert.equal(replay[0].id, replay[1].id);
  assert.equal(
    (
      await db.query(
        "SELECT count(*)::int AS count FROM parking_bookings WHERE id=$1",
        [replay[0].id],
      )
    ).rows[0].count,
    1,
  );

  // One vehicle cannot obtain overlapping reservations across two different Hubs.
  const hubA = await hub({ free: 1 }),
    hubB = await hub({ free: 1 });
  const overlap = await Promise.allSettled(
    [hubA, hubB].map((h) =>
      parking.reserve(
        student,
        {
          hubId: h.id,
          privateVehicleId: initialBooking.privateVehicleId,
          ...time,
        },
        key(),
      ),
    ),
  );
  assert.equal(overlap.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(
    overlap.filter((r) => r.status === "rejected" && status(409)(r.reason))
      .length,
    1,
  );
  console.log(
    "T18 parking: last-slot race, raw SQL overlap, same-key retry and cross-Hub vehicle conflict passed.",
  );
  // Expired holds are reusable; unexpired holds still protect the resource.
  await db.query(
    "UPDATE parking_bookings SET status='cancelled' WHERE parking_space_id IN (SELECT id FROM parking_spaces WHERE hub_id=ANY($1::uuid[]))",
    [hubs],
  );
  const held = await hub({ free: 1 });
  const heldInput = {
    hubId: held.id,
    privateVehicleId: otherVehicle,
    ...window(),
  };
  await db.query(
    "UPDATE parking_spaces SET status='held',hold_expires_at=now()+interval '10 minutes' WHERE hub_id=$1",
    [held.id],
  );
  await assert.rejects(parking.reserve(student, heldInput, key()), status(409));
  await db.query(
    "UPDATE parking_spaces SET hold_expires_at=now()-interval '1 second' WHERE hub_id=$1",
    [held.id],
  );
  const heldBooking = await parking.reserve(student, heldInput, key());
  assert.equal(heldBooking.status, "reserved");
  await parking.transition(student, heldBooking.id, "cancel", key());

  // A late departing vehicle still physically occupies its space after its slot ends.
  const late = await hub({ cars: 1 });
  const lateSpace = (
    await db.query("SELECT id FROM parking_spaces WHERE hub_id=$1", [late.id])
  ).rows[0].id;
  await db.query(
    "INSERT INTO parking_bookings(user_id,private_vehicle_id,parking_space_id,starts_at,ends_at,status) VALUES($1,$2,$3,now()-interval '2 hours',now()-interval '2 minutes','checked_in')",
    [student.id, late.vehicles[0], lateSpace],
  );
  const nextBooking = (
    await db.query(
      "INSERT INTO parking_bookings(user_id,private_vehicle_id,parking_space_id,starts_at,ends_at) VALUES($1,$2,$3,now()-interval '1 minute',now()+interval '1 hour') RETURNING id",
      [student.id, otherVehicle, lateSpace],
    )
  ).rows[0].id;
  await assert.rejects(
    parking.transition(student, nextBooking, "check-in", key()),
    status(409),
  );
  assert.equal(
    (
      await db.query(
        "SELECT private_vehicle_id FROM parking_spaces WHERE id=$1",
        [lateSpace],
      )
    ).rows[0].private_vehicle_id,
    late.vehicles[0],
  );
  console.log(
    "T18 parking: live/expired hold and overstaying vehicle checks passed.",
  );

  // Two distinct requests compete for one point; loser must remain queued.
  const competition = await hub({ cars: 2, points: 1 });
  const requests = await Promise.all(
    competition.vehicles.map((id) => request(competition, id)),
  );
  const result = await Promise.allSettled(
    requests.map((r) => allocate(r.id, competition.points[0])),
  );
  assert.equal(result.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(
    result.filter((r) => r.status === "rejected" && status(409)(r.reason))
      .length,
    1,
  );
  const session = result.find((r) => r.status === "fulfilled").value;
  assert.equal(
    (
      await db.query(
        "SELECT count(*)::int AS count FROM charging_sessions WHERE charging_point_id=$1 AND status IN ('scheduled','charging')",
        [competition.points[0]],
      )
    ).rows[0].count,
    1,
  );
  assert.equal(
    (
      await db.query(
        "SELECT count(*)::int AS count FROM charging_requests WHERE hub_id=$1 AND status='queued'",
        [competition.id],
      )
    ).rows[0].count,
    1,
  );
  assert.equal(
    (await allocate(session.requestId, competition.points[0])).id,
    session.id,
  );
  assert.equal(
    (
      await db.query("SELECT status FROM charging_points WHERE id=$1", [
        competition.points[0],
      ])
    ).rows[0].status,
    "occupied",
  );
  const loser = requests.find((r) => r.id !== session.requestId);
  await assert.rejects(
    db.query(
      "INSERT INTO charging_sessions(request_id,charging_point_id,status) VALUES($1,$2,'scheduled')",
      [loser.id, competition.points[0]],
    ),
    { code: "23505" },
  );
  await assert.rejects(
    allocate(loser.id, competition.points[0], student),
    status(403),
  );
  console.log(
    "T18 charging: one point for one request, replay, DB uniqueness and operator permission passed.",
  );

  const single = await hub({ cars: 1, points: 2 });
  const singleRequest = await request(single);
  const contested = await Promise.allSettled(
    single.points.map((p) => allocate(singleRequest.id, p)),
  );
  assert.equal(contested.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(
    contested.filter((r) => r.status === "rejected" && status(409)(r.reason))
      .length,
    1,
  );
  assert.equal(
    (
      await db.query(
        "SELECT count(*)::int AS count FROM charging_points WHERE hub_id=$1 AND status='occupied'",
        [single.id],
      )
    ).rows[0].count,
    1,
  );
  console.log("T18 charging: one request cannot acquire two points.");

  // Simulate failure after point/request writes, then check caller transaction rollback.
  const rollback = await hub({ cars: 1, points: 1 });
  const rollbackRequest = await request(rollback);
  const failingRepo = new ChargingAllocationRepository();
  failingRepo.createSession = async () => {
    throw new Error("session insert failure");
  };
  const failing = new ChargingAllocationService(failingRepo);
  await assert.rejects(
    db.transaction((c) =>
      failing.allocatePrivateRequest(
        operator,
        rollbackRequest.id,
        rollback.points[0],
        c,
      ),
    ),
    /session insert failure/,
  );
  assert.equal(
    (
      await db.query("SELECT status FROM charging_points WHERE id=$1", [
        rollback.points[0],
      ])
    ).rows[0].status,
    "available",
  );
  assert.equal(
    (
      await db.query("SELECT status FROM charging_requests WHERE id=$1", [
        rollbackRequest.id,
      ])
    ).rows[0].status,
    "queued",
  );
  assert.equal(
    (
      await db.query(
        "SELECT count(*)::int AS count FROM charging_sessions WHERE request_id=$1",
        [rollbackRequest.id],
      )
    ).rows[0].count,
    0,
  );
  await db.query("UPDATE charging_points SET status='failed' WHERE id=$1", [
    rollback.points[0],
  ]);
  await assert.rejects(
    allocate(rollbackRequest.id, rollback.points[0]),
    status(409),
  );
  await assert.rejects(
    allocate(rollbackRequest.id, competition.points[0]),
    status(409),
  );
  await db.query("UPDATE charging_points SET status='available' WHERE id=$1", [
    rollback.points[0],
  ]);
  await db.query("UPDATE hubs SET status='inactive' WHERE id=$1", [
    rollback.id,
  ]);
  await assert.rejects(
    allocate(rollbackRequest.id, rollback.points[0]),
    status(409),
  );
  await db.query("UPDATE hubs SET status='active' WHERE id=$1", [rollback.id]);
  await db.query(
    "UPDATE parking_spaces SET status='available',private_vehicle_id=NULL WHERE hub_id=$1",
    [rollback.id],
  );
  await assert.rejects(
    allocate(rollbackRequest.id, rollback.points[0]),
    status(409),
  );
  console.log(
    "T18 charging: caller rollback, failed/wrong-Hub point, inactive Hub and departed vehicle checks passed.",
  );

  // Checkout and allocation must agree on whether the car still owns its space.
  const departure = await hub({ cars: 1, points: 1 });
  const departureRequest = await request(departure);
  const departureSpace = (
    await db.query("SELECT id FROM parking_spaces WHERE hub_id=$1", [
      departure.id,
    ])
  ).rows[0].id;
  const departureBooking = (
    await db.query(
      "INSERT INTO parking_bookings(user_id,private_vehicle_id,parking_space_id,starts_at,ends_at,status) VALUES($1,$2,$3,now()-interval '1 minute',now()+interval '1 hour','checked_in') RETURNING id",
      [student.id, departure.vehicles[0], departureSpace],
    )
  ).rows[0].id;
  const departureRace = await Promise.allSettled([
    allocate(departureRequest.id, departure.points[0]),
    parking.transition(student, departureBooking, "check-out", key()),
  ]);
  assert.equal(departureRace.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(
    departureRace.filter(
      (r) => r.status === "rejected" && status(409)(r.reason),
    ).length,
    1,
  );
  const final = (
    await db.query(
      `SELECT p.status AS parking_status,r.status AS request_status,c.status AS point_status
    FROM parking_spaces p JOIN charging_requests r ON r.private_vehicle_id=$2
    JOIN charging_points c ON c.id=$3 WHERE p.id=$1`,
      [departureSpace, departure.vehicles[0], departure.points[0]],
    )
  ).rows[0];
  if (departureRace[0].status === "fulfilled") {
    assert.deepEqual(final, {
      parking_status: "occupied",
      request_status: "allocated",
      point_status: "occupied",
    });
  } else {
    assert.deepEqual(final, {
      parking_status: "available",
      request_status: "cancelled",
      point_status: "available",
    });
  }
  console.log(
    "T18 charging: allocation/check-out race leaves a consistent physical state.",
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
    "DELETE FROM parking_bookings WHERE parking_space_id IN (SELECT id FROM parking_spaces WHERE hub_id=ANY($1::uuid[]))",
    [hubs],
  );
  await db.query("DELETE FROM parking_spaces WHERE hub_id=ANY($1::uuid[])", [
    hubs,
  ]);
  await db.query("DELETE FROM charging_points WHERE hub_id=ANY($1::uuid[])", [
    hubs,
  ]);
  await db.query("DELETE FROM hubs WHERE id=ANY($1::uuid[])", [hubs]);
  await db.query("DELETE FROM mobility_idempotency WHERE key=ANY($1::text[])", [
    keys,
  ]);
  await db.query("DELETE FROM private_vehicles WHERE id=ANY($1::uuid[])", [
    vehicles,
  ]);
  await db.onModuleDestroy();
}
