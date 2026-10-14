import assert from "node:assert/strict";
// This script runs as a child with an isolated test DATABASE_URL.
const { Database } =
  await import("../apps/api/dist/database/database.module.js");
const db = new Database();
try {
  const email = process.env.SEED_OPERATOR_EMAIL;
  const original = (
    await db.query("SELECT name FROM users WHERE email=$1", [email])
  ).rows[0].name;
  const marker = new Error("Expected rollback");
  await assert.rejects(
    db.transaction(async (client) => {
      await client.query("UPDATE users SET name=$1 WHERE email=$2", [
        "Rollback probe",
        email,
      ]);
      throw marker;
    }),
    (error) => error === marker,
  );
  assert.equal(
    (await db.query("SELECT name FROM users WHERE email=$1", [email])).rows[0]
      .name,
    original,
  );
  await db.transaction(async (client) => {
    await client.query("UPDATE users SET name=$1 WHERE email=$2", [
      "Commit probe",
      email,
    ]);
  });
  assert.equal(
    (await db.query("SELECT name FROM users WHERE email=$1", [email])).rows[0]
      .name,
    "Commit probe",
  );
  await db.query("UPDATE users SET name=$1 WHERE email=$2", [original, email]);
  await assert.rejects(
    db.readSnapshot((client) =>
      client.query("UPDATE users SET name=$1 WHERE email=$2", [
        "Forbidden",
        email,
      ]),
    ),
    { code: "25006" },
  );
  assert.equal(
    (await db.query("SELECT name FROM users WHERE email=$1", [email])).rows[0]
      .name,
    original,
  );
} finally {
  await db.onModuleDestroy();
}
