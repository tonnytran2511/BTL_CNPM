import { execFileSync, spawn } from "node:child_process";
import { mkdtemp, cp, rm, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Rebuild the candidate in an isolated directory with no .env, node_modules,
// database cluster or build output from the working checkout.
const root = fileURLToPath(new URL("../", import.meta.url));
const directory = await mkdtemp(resolve(tmpdir(), "emobility-delivery-"));
const files = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
  { cwd: root, encoding: "utf8" },
)
  .split("\0")
  .filter(Boolean);
const excluded =
  /(^|\/)(node_modules|dist|\.git|\.local)(\/|$)|(^|\/)\.env(?:\.|$)/;
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const childEnv = { ...process.env };
// dotenv preserves defined empty values too. Remove inherited app config so
// every command reads the fresh .env generated in the isolated directory.
const template = await readFile(resolve(root, ".env.example"), "utf8");
for (const match of template.matchAll(/^([A-Z][A-Z0-9_]*)=/gm))
  delete childEnv[match[1]];
const run = (args) =>
  new Promise((done, reject) => {
    console.log(`\n[isolated checkout] npm ${args.join(" ")}`);
    const child = spawn(npm, args, {
      cwd: directory,
      env: childEnv,
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("exit", (code, signal) =>
      code === 0
        ? done()
        : reject(
            new Error(`npm ${args.join(" ")} failed (${signal ?? code}).`),
          ),
    );
  });
try {
  for (const file of files) {
    if (excluded.test(file) && file !== ".env.example") continue;
    await mkdir(dirname(resolve(directory, file)), { recursive: true });
    await cp(resolve(root, file), resolve(directory, file));
  }
  console.log(
    `Copied ${files.length} candidate paths; isolated build uses fresh generated credentials.`,
  );
  await run(["ci", "--no-audit", "--no-fund"]);
  await run(["run", "setup:env"]);
  await run(["run", "format:check"]);
  await run(["run", "build"]);
  await run(["test"]);
  if (process.env.DELIVERY_RESULT_FILE) {
    await writeFile(
      resolve(root, process.env.DELIVERY_RESULT_FILE),
      JSON.stringify(
        {
          checkedAt: new Date().toISOString(),
          sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], {
            cwd: root,
            encoding: "utf8",
          }).trim(),
          candidateIncludesWorkingChanges: true,
          freshDirectory: true,
          separateMachine: false,
          checks: ["npm ci", "setup:env", "format:check", "build", "test"],
          result: "pass",
          node: process.version,
          platform: process.platform,
          architecture: process.arch,
        },
        null,
        2,
      ) + "\n",
    );
  }
  console.log(
    "Isolated setup, formatting, build and tests passed. This is the same host, not a second-machine acceptance.",
  );
} finally {
  await rm(directory, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 100,
  });
}
