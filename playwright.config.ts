import { defineConfig, devices } from "@playwright/test";
import path from "path";

function statePath(role: string): string {
  return path.join(__dirname, `tests/e2e/.auth-state-${role}.json`);
}

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
        storageState: statePath("admin"),
      },
    },
    {
      name: "admin",
      testMatch: /.*\.admin\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        storageState: statePath("admin"),
      },
    },
    {
      name: "consultant",
      testMatch: /.*\.consultant\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        storageState: statePath("consultant"),
      },
    },
    {
      name: "process-owner",
      testMatch: /.*\.po\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        storageState: statePath("processOwner"),
      },
    },
    {
      name: "it-lead",
      testMatch: /.*\.it\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        storageState: statePath("itLead"),
      },
    },
    {
      name: "executive",
      testMatch: /.*\.exec\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        storageState: statePath("executive"),
      },
    },
  ],
  webServer: {
    command: process.env.CI ? "pnpm start" : "pnpm dev",
    port: 3003,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
