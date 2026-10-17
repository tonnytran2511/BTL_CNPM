import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { randomBytes, scryptSync } from "node:crypto";
import pg from "pg";
import { root, required } from "./env.mjs";
const data = JSON.parse(
  await readFile(resolve(root, required("SEED_DATA_FILE")), "utf8"),
);
const pool = new pg.Pool({ connectionString: required("DATABASE_URL") });
const client = await pool.connect();
const hash = (password) => {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
};
try {
  await client.query("BEGIN");
  for (const role of ["operator", "student"]) {
    const prefix = `SEED_${role.toUpperCase()}`;
    await client.query(
      "INSERT INTO users(email,name,role,password_hash) VALUES($1,$2,$3,$4) ON CONFLICT(email) DO NOTHING",
      [
        required(`${prefix}_EMAIL`).trim().toLowerCase(),
        required(`${prefix}_NAME`),
        role,
        hash(required(`${prefix}_PASSWORD`)),
      ],
    );
  }
  const threshold = data.settings.lowBatteryThreshold;
  const maximumParkingDurationMinutes =
    data.settings.maximumParkingDurationMinutes;
  if (
    !Number.isInteger(maximumParkingDurationMinutes) ||
    maximumParkingDurationMinutes <= 0
  )
    throw new Error("Invalid maximumParkingDurationMinutes");
  await client.query(
    "INSERT INTO settings(key,value) VALUES($1,$2) ON CONFLICT(key) DO NOTHING",
    [
      "maximumParkingDurationMinutes",
      JSON.stringify(maximumParkingDurationMinutes),
    ],
  );
  if (!Number.isInteger(threshold) || threshold < 0 || threshold > 100)
    throw new Error("Invalid lowBatteryThreshold");
  await client.query(
    "INSERT INTO settings(key,value) VALUES($1,$2) ON CONFLICT(key) DO NOTHING",
    ["lowBatteryThreshold", JSON.stringify(threshold)],
  );
  // T06 rental settings (BR-01): validated here, read from the DB by the rental module.
  const rentalSettings = {
    simulationMaximumSteps: (v) => Number.isSafeInteger(v) && v > 0,
    simulationMaximumArrivalsPerStep: (v) => Number.isSafeInteger(v) && v > 0,
    reservationHoldMinutes: (v) => Number.isInteger(v) && v > 0,
    minimumRentalBatteryPercent: (v) =>
      Number.isInteger(v) && v >= 0 && v <= 100,
  };
  for (const [key, valid] of Object.entries(rentalSettings)) {
    if (!valid(data.settings[key])) throw new Error(`Invalid ${key}`);
    await client.query(
      "INSERT INTO settings(key,value) VALUES($1,$2) ON CONFLICT(key) DO NOTHING",
      [key, JSON.stringify(data.settings[key])],
    );
  }
  for (const hub of data.hubs) {
    if (
      !Number.isInteger(hub.parkingCapacity) ||
      hub.parkingCapacity < hub.vehicles.length
    )
      throw new Error("Invalid seed parking capacity");
    const inserted = await client.query(
      "INSERT INTO hubs(code,name,location) VALUES($1,$2,$3) ON CONFLICT(code) DO NOTHING RETURNING id",
      [hub.code, hub.name, hub.location],
    );
    if (!inserted.rowCount) continue; // Never overwrite existing operational resources.
    const hubId = inserted.rows[0].id;
    const ids = [];
    for (const vehicle of hub.vehicles) {
      const result = await client.query(
        "INSERT INTO vehicles(code,hub_id,type,battery_percent,status) VALUES($1,$2,$3,$4,$5) RETURNING id",
        [
          vehicle.code,
          hubId,
          vehicle.type,
          vehicle.batteryPercent,
          vehicle.status,
        ],
      );
      ids.push(result.rows[0].id);
    }
    for (let i = 0; i < hub.parkingCapacity; i++) {
      await client.query(
        "INSERT INTO parking_spaces(hub_id,code,status,vehicle_id) VALUES($1,$2,$3,$4)",
        [hubId, `P${i + 1}`, ids[i] ? "occupied" : "available", ids[i] ?? null],
      );
    }
    for (const point of hub.chargingPoints)
      await client.query(
        "INSERT INTO charging_points(hub_id,code,status) VALUES($1,$2,$3)",
        [hubId, point.code, point.status],
      );
  }
  await client.query("COMMIT");
  console.log(
    "Seed complete; existing users/resources kept unchanged. Credentials are in .env.",
  );
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
  await pool.end();
}
