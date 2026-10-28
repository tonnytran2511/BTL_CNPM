import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { access, rm } from "node:fs/promises";
import { dirname, basename } from "node:path";
import { root } from "../scripts/env.mjs";

test(
  "disposable demo shuts down with an open Vite HMR websocket and removes its cluster",
  { timeout: 60_000 },
  async () => {
    const child = spawn(process.execPath, ["scripts/demo-t14.mjs"], {
      cwd: root,
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"],
    });
    const exited = once(child, "exit");
    let session, socket, timeout;
    try {
      session = await new Promise((resolve, reject) => {
        let output = "";
        // Startup output contains ephemeral passwords: never include it in errors.
        child.stdout.on("data", (chunk) => {
          output += chunk;
          const marker = output.indexOf("Disposable demo only.");
          if (marker < 0) return;
          try {
            const prefix = output.slice(0, marker);
            const start = prefix.indexOf('{\n  "url"');
            resolve(JSON.parse(prefix.slice(start).trim()));
          } catch {
            reject(new Error("Cannot parse disposable demo readiness."));
          }
        });
        child.on("error", reject);
        child.on("exit", () =>
          reject(new Error("Demo exited before readiness.")),
        );
        timeout = setTimeout(
          () => reject(new Error("Demo readiness timed out.")),
          30_000,
        );
      });
      clearTimeout(timeout);
      const client = await (await fetch(`${session.url}/@vite/client`)).text();
      const token = client.match(/const wsToken = "([^"]+)"/);
      assert.ok(token, "Vite client must advertise its HMR connection token");
      const url = new URL(session.url);
      url.protocol = "ws:";
      url.searchParams.set("token", token[1]);
      socket = new WebSocket(url, "vite-hmr");
      await once(socket, "open", { signal: AbortSignal.timeout(10_000) });
      const closed = once(socket, "close", {
        signal: AbortSignal.timeout(10_000),
      });
      child.kill("SIGTERM");
      const [code] = await Promise.race([
        exited,
        once(AbortSignal.timeout(10_000), "abort").then(() => {
          throw new Error("Open HMR connection blocked demo shutdown.");
        }),
      ]);
      assert.equal(code, 0);
      await closed;
      await assert.rejects(access(session.stateFile), { code: "ENOENT" });
    } finally {
      clearTimeout(timeout);
      socket?.close();
      // Kill only the process group created by this test if shutdown regresses.
      try {
        process.kill(
          process.platform === "win32" ? child.pid : -child.pid,
          "SIGKILL",
        );
      } catch (error) {
        if (error.code !== "ESRCH") throw error;
      }
      if (
        session &&
        basename(dirname(session.stateFile)).startsWith("emobility-t14-")
      )
        await rm(dirname(session.stateFile), {
          recursive: true,
          force: true,
          maxRetries: 10,
          retryDelay: 100,
        });
    }
  },
);
