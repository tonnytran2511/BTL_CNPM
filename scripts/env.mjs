import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import dotenv from "dotenv";
export const root = fileURLToPath(new URL("../", import.meta.url));
dotenv.config({ path: resolve(root, ".env"), quiet: true });
export function required(name) {
  const value = process.env[name];
  if (!value || value.startsWith("REPLACE_"))
    throw new Error(`Configure ${name} in .env`);
  return value;
}
