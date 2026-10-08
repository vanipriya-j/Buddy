import path from "path";
import { defineConfig } from "vitest/config";

const databaseUrl = `file:${path.resolve(__dirname, "data/test.db")}`;

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["src/test/setup.ts"],
    fileParallelism: false,
    env: {
      DATABASE_URL: databaseUrl,
      SESSION_SECRET: "test-secret-test-secret",
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
