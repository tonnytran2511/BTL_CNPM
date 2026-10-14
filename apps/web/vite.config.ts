import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { parseRequestTimeout } from "./src/utils/config.ts";
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, "../..", "");
  if (!env.API_PORT || !env.WEB_ORIGIN)
    throw new Error("Run npm run setup:env before starting Vite.");
  const origin = new URL(env.WEB_ORIGIN);
  const requestTimeoutMs = parseRequestTimeout(env.VITE_API_TIMEOUT_MS);
  return {
    plugins: [react()],
    define: {
      "import.meta.env.VITE_API_TIMEOUT_MS": JSON.stringify(
        String(requestTimeoutMs),
      ),
    },
    server: {
      host: origin.hostname,
      port: Number(origin.port),
      strictPort: true,
      proxy: { "/api": { target: `http://127.0.0.1:${env.API_PORT}` } },
    },
  };
});
