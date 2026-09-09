import { defineConfig } from "@playwright/test";

if (!process.env.TEST_DATABASE_URL) throw new Error("Set TEST_DATABASE_URL to an isolated test database.");
const baseURL = "http://localhost:3003";
export default defineConfig({
  testDir: "./tests/security-http",
  workers: 1,
  retries: 0,
  timeout: 30_000,
  reporter: "list",
  use: { baseURL },
  webServer: {
    command: "pnpm start",
    url: baseURL + "/presales/login",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: { DATABASE_URL: process.env.TEST_DATABASE_URL, NEXTAUTH_URL: baseURL },
  },
});
