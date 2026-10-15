import EmbeddedPostgres from "embedded-postgres";
import { resolve } from "node:path";
import { access } from "node:fs/promises";
import { root, required } from "./env.mjs";
const db = new EmbeddedPostgres({
  databaseDir: resolve(root, ".local/postgres"),
  user: required("POSTGRES_USER"),
  password: required("POSTGRES_PASSWORD"),
  port: Number(required("POSTGRES_PORT")),
  persistent: true,
  authMethod: "scram-sha-256",
  initdbFlags: ["--encoding=UTF8"],
  postgresFlags: ["-h", "127.0.0.1"],
  onLog: () => {},
  onError: (error) => console.error(error),
});
try {
  await access(resolve(root, ".local/postgres/PG_VERSION"));
} catch (error) {
  if (error.code !== "ENOENT") throw error;
  await db.initialise();
}
await db.start();
const client = db.getPgClient();
await client.connect();
const name = required("POSTGRES_DB");
if (
  !(await client.query("SELECT 1 FROM pg_database WHERE datname=$1", [name]))
    .rowCount
)
  await db.createDatabase(name);
await client.end();
console.log(
  "Local PostgreSQL ready. Keep this terminal running; Ctrl+C stops it.",
);
let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, async () => {
    if (stopping) return;
    stopping = true;
    await db.stop();
    process.exit(0);
  });
setInterval(() => {}, 60_000);
