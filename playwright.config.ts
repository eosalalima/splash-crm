import { defineConfig } from "@playwright/test";
import { randomBytes } from "node:crypto";
const database = process.env.PHASE1_TEST_DATABASE_URL;
if (
  !database ||
  !/^\/splash_phase1_[A-Za-z0-9_]+$/.test(new URL(database).pathname)
) {
  throw new Error(
    "Set PHASE1_TEST_DATABASE_URL to a dedicated database named splash_phase1_*. Never use a live CRM database.",
  );
}
export default defineConfig({
  testDir: "./tests/browser",
  workers: 1,
  timeout: 90000,
  expect: { timeout: 15000 },
  use: {
    baseURL: "http://localhost:3100",
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : {},
  },
  webServer: [
    {
      command: "node tests/fixtures/neon-auth.mjs",
      url: "http://127.0.0.1:4444/__test/calls",
      reuseExistingServer: false,
    },
    {
      command: "npm run db:migrate && npm run dev -- --port 3100 --webpack",
      url: "http://localhost:3100/login",
      timeout: 120000,
      reuseExistingServer: false,
      env: {
        DATABASE_URL: database,
        NEON_AUTH_BASE_URL: "http://127.0.0.1:4444/auth",
        NEON_AUTH_COOKIE_SECRET: randomBytes(32).toString("hex"),
      },
    },
  ],
});
