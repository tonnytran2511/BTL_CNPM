import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { createServer as createHttpServer } from "node:http";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import EmbeddedPostgres from "embedded-postgres";
import exitHook from "async-exit-hook";
import { createServer as createViteServer } from "vite";

// A disposable demonstration environment, never the operational DATABASE_URL.
const root = fileURLToPath(new URL("../", import.meta.url));
const directory = await mkdtemp(resolve(tmpdir(), "emobility-t14-"));
async function freePort() {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = server.address().port;
  await new Promise((done) => server.close(done));
  return port;
}
const dbPort = await freePort();
const apiPort = await freePort();
const webPort = await freePort();
const password = randomBytes(24).toString("hex");
const credentials = Object.fromEntries(
  ["operator", "student"].map((role) => [
    role,
    {
      email: `${role}@example.test`,
      password: randomBytes(18).toString("base64url"),
    },
  ]),
);
const env = {
  ...process.env,
  DATABASE_URL: `postgresql://demo:${password}@127.0.0.1:${dbPort}/t14`,
  API_PORT: String(apiPort),
  WEB_ORIGIN: `http://localhost:${webPort}`,
  APP_NAME: "T14 — Demo tích hợp riêng",
  POLL_INTERVAL_MS: "3000",
  SESSION_TTL_SECONDS: "3600",
  COOKIE_SECURE: "false",
  LOGIN_WINDOW_MS: "60000",
  LOGIN_MAX_ATTEMPTS: "100",
  VITE_API_TIMEOUT_MS: "5000",
  SEED_DATA_FILE:
    process.env.DEMO_SEED_DATA_FILE ?? "database/seed.example.json",
  ...Object.fromEntries(
    Object.entries(credentials).flatMap(([role, account]) => [
      [`SEED_${role.toUpperCase()}_EMAIL`, account.email],
      [`SEED_${role.toUpperCase()}_PASSWORD`, account.password],
      [`SEED_${role.toUpperCase()}_NAME`, `Demo ${role}`],
    ]),
  ),
};
const database = new EmbeddedPostgres({
  databaseDir: resolve(directory, "postgres"),
  user: "demo",
  password,
  port: dbPort,
  persistent: false,
  authMethod: "scram-sha-256",
  initdbFlags: ["--encoding=UTF8", "--locale=C"],
  postgresFlags: ["-h", "127.0.0.1"],
  onLog: () => {},
  onError: () => {},
});
let api,
  web,
  started = false,
  stopping = false,
  initializing = true,
  cancelled = false;
const http = createHttpServer((request, response) =>
  web.middlewares(request, response),
);
// Own these two signals so the database library cannot exit while our API,
// HTTP server and temporary files are still being cleaned up. Its fallback
// hooks for unexpected exits and other signals remain installed.
for (const signal of ["SIGINT", "SIGTERM"]) exitHook.unhookEvent(signal);
function checkCancelled() {
  if (cancelled) throw new Error("Demo startup cancelled.");
}
async function stop(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  if (http.listening) {
    const closed = new Promise((done) => http.close(done));
    http.closeAllConnections();
    await closed;
  }
  await web?.close();
  if (api && api.exitCode === null && api.signalCode === null) {
    const exited = once(api, "exit");
    api.kill("SIGTERM");
    await exited;
  }
  if (started) await database.stop();
  await rm(directory, {
    recursive: true,
    force: true,
    maxRetries: 20,
    retryDelay: 100,
  });
  console.log("Demo stopped; temporary database and credentials removed.");
  process.exit(exitCode);
}
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    cancelled = true;
    if (!initializing) void stop();
  });
async function command(file) {
  const child = spawn(process.execPath, [file], {
    cwd: root,
    env,
    stdio: "ignore",
  });
  const [code] = await once(child, "exit");
  if (code !== 0) throw new Error(`${file} failed (${code}).`);
}
try {
  await database.initialise();
  checkCancelled();
  await database.start();
  started = true;
  checkCancelled();
  await database.createDatabase("t14");
  await command("scripts/migrate.mjs");
  await command("scripts/seed.mjs");
  checkCancelled();
  api = spawn(process.execPath, ["apps/api/dist/main.js"], {
    cwd: root,
    env,
    stdio: "ignore",
  });
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    checkCancelled();
    if (api.exitCode !== null || api.signalCode !== null) break;
    try {
      const response = await fetch(`http://127.0.0.1:${apiPort}/api/health`, {
        signal: AbortSignal.timeout(1000),
      });
      if (response.ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((done) => setTimeout(done, 100));
  }
  if (!ready)
    throw new Error(
      "Demo API did not start; build the API before running the demo.",
    );
  Object.assign(process.env, env);
  web = await createViteServer({
    root: resolve(root, "apps/web"),
    configFile: resolve(root, "apps/web/vite.config.ts"),
    server: { middlewareMode: { server: http }, ws: { server: http } },
  });
  checkCancelled();
  http.listen(webPort, "localhost");
  await once(http, "listening");
  const stateFile = resolve(directory, "session.json");
  await writeFile(
    stateFile,
    JSON.stringify({
      databaseUrl: env.DATABASE_URL,
      apiPort,
      webPort,
      pid: process.pid,
    }),
    { mode: 0o600 },
  );
  console.log(
    JSON.stringify(
      { url: env.WEB_ORIGIN, credentials, stateFile, seed: env.SEED_DATA_FILE },
      null,
      2,
    ),
  );
  console.log(
    "Disposable demo only. Keep this terminal open; Ctrl+C removes the environment. Do not share the temporary credentials.",
  );
  initializing = false;
  if (cancelled) await stop();
} catch (error) {
  initializing = false;
  console.error(error instanceof Error ? error.message : "Demo failed.");
  await stop(cancelled ? 0 : 1);
}
