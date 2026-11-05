import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = fileURLToPath(new URL("../", import.meta.url));
const files = readdirSync(new URL("../tests/", import.meta.url))
  .filter((name) => name.endsWith(".test.mjs"))
  .sort()
  .map((name) => `tests/${name}`);
if (!files.length) throw new Error("No API test files found.");
// Several suites boot their own PostgreSQL cluster. Bound file concurrency so
// startup/cleanup deadlines are not consumed by competing database processes.
// Concurrent requests inside each suite (the actual race tests) stay intact.
const result = spawnSync(
  process.execPath,
  ["--test", "--test-concurrency=2", ...files],
  {
    cwd: root,
    stdio: "inherit",
  },
);
if (result.error) throw result.error;
process.exit(result.status ?? 1);
