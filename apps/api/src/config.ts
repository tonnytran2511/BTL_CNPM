import { resolve } from "node:path";
import dotenv from "dotenv";
dotenv.config({ path: resolve(__dirname, "../../../.env"), quiet: true });
function required(name: string): string {
  const value = process.env[name];
  if (!value || value.startsWith("REPLACE_"))
    throw new Error(`Configure ${name} in .env`);
  return value;
}
function positiveInteger(name: string): number {
  const value = Number(required(name));
  if (!Number.isSafeInteger(value) || value <= 0)
    throw new Error(`${name} must be a positive integer`);
  return value;
}
const secure = required("COOKIE_SECURE");
if (!["true", "false"].includes(secure))
  throw new Error("COOKIE_SECURE must be true or false");
const origin = required("WEB_ORIGIN");
if (new URL(origin).origin !== origin)
  throw new Error("WEB_ORIGIN must be an origin without a path");
export const config = Object.freeze({
  databaseUrl: required("DATABASE_URL"),
  apiPort: positiveInteger("API_PORT"),
  webOrigin: origin,
  appName: required("APP_NAME"),
  pollIntervalMs: positiveInteger("POLL_INTERVAL_MS"),
  sessionTtlSeconds: positiveInteger("SESSION_TTL_SECONDS"),
  cookieSecure: secure === "true",
  loginWindowMs: positiveInteger("LOGIN_WINDOW_MS"),
  loginMaxAttempts: positiveInteger("LOGIN_MAX_ATTEMPTS"),
});
