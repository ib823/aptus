import { defineConfig, devices } from "@playwright/test";
import path from "path";

const STORAGE_STATE = path.join(__dirname, "tests/e2e/.auth-state.json");

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? "github" : [["html", { open: "never" }]],
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },
  globalSetup: "./tests/e2e/global-setup.ts",
  globalTeardown: "./tests/e2e/global-teardown.ts",
  use: {
    baseURL: process.env.BASE_URL ?? "http://localhost:3003",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "unauthenticated",
      testMatch: /.*\.unauth\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "authenticated",
      testMatch: /.*\.auth\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        storageState: STORAGE_STATE,
      },
    },
  ],
  ...(process.env.CI
    ? {}
    : {
        webServer: {
          command: "pnpm dev",
          port: 3003,
          reuseExistingServer: true,
          timeout: 60_000,
        },
      }),
});
