import { readFile, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { root } from "./env.mjs";
const example = await readFile(resolve(root, ".env.example"), "utf8");
const dbPassword = randomBytes(24).toString("hex");
let config = example.replaceAll("REPLACE_WITH_RANDOM_PASSWORD", dbPassword);
for (const key of ["SEED_OPERATOR_PASSWORD", "SEED_STUDENT_PASSWORD"]) {
  config = config.replace(
    new RegExp(`^${key}=.*$`, "m"),
    `${key}=${randomBytes(18).toString("base64url")}`,
  );
}
try {
  await writeFile(resolve(root, ".env"), config, { flag: "wx", mode: 0o600 });
  console.log(
    "Created .env with random credentials. Read demo accounts there; do not share this file.",
  );
} catch (error) {
  if (error.code !== "EEXIST") throw error;
  console.log(".env already exists; kept unchanged.");
}
