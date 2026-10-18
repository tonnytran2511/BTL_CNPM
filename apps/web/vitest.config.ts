import { defineConfig } from "vitest/config";
export default defineConfig({
  define: { "import.meta.env.VITE_API_TIMEOUT_MS": JSON.stringify("1000") },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.ts"],
    clearMocks: true,
    restoreMocks: true,
  },
});
