/** Playwright config for visual-regression of the LIVE redesigned app pages.
 *
 * Distinct from playwright.visual.config.ts (which tests static report mocks
 * via file://). This config spins up `next start` against a fresh build and
 * tests pages that render through the actual Next.js app, so design-token
 * changes in `globals.css` are caught against real component rendering.
 *
 * Scoped to PUBLIC pages (no auth, no DB needed) for the App-8 baseline:
 *   - /design-system  — the showcase page (App-1 + App-2)
 *   - /login          — auth surface (App-6)
 *
 * Authenticated pages (/, /assessments, /settings, assessment shell) live
 * in the existing playwright.config.ts e2e suite — adding visual regression
 * for those is App-8b (requires extending the existing auth-state setup).
 *
 * Usage:
 *   pnpm test:visual-app           — run, fail on drift
 *   pnpm test:visual-app:update    — accept current as new baseline
 *
 * Note: relies on `next build` + `next start` working locally. In codespaces
 * with low memory, build may OOM — this config is primarily for CI. */

import { defineConfig, devices, type PlaywrightTestConfig } from "@playwright/test";

const baseConfig: PlaywrightTestConfig = {
  testDir: "./tests/visual-regression-app",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 2,
  reporter: process.env.CI
    ? [["github"], ["html", { open: "never", outputFolder: "playwright-visual-app-report" }]]
    : [["list"], ["html", { open: "never", outputFolder: "playwright-visual-app-report" }]],
  timeout: 30_000,
  expect: {
    timeout: 10_000,
    toHaveScreenshot: {
      // Live-app screenshots have more variance than static HTML mocks
      // (font loading, hydration timing). Slightly more generous than the
      // static-mocks config (0.5%).
      maxDiffPixelRatio: 0.01,
      threshold: 0.12,
      animations: "disabled",
    },
  },
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3003",
    viewport: { width: 1280, height: 800 },
    trace: "off",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [
    {
      name: "chromium-desktop",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
};

// Conditionally attach webServer (skip if testing against PLAYWRIGHT_BASE_URL).
// Spread pattern keeps the typecheck happy under exactOptionalPropertyTypes.
export default defineConfig(
  process.env.PLAYWRIGHT_BASE_URL
    ? baseConfig
    : {
        ...baseConfig,
        webServer: {
          // Production build for deterministic rendering. Reuses if already running.
          command: "pnpm build && pnpm start --port 3003",
          port: 3003,
          reuseExistingServer: !process.env.CI,
          timeout: 240_000,
        },
      },
);
