/** Playwright config for visual-regression testing of the report bundle mocks.
 *
 * This config is INTENTIONALLY separate from playwright.config.ts:
 *   - No web server (the mocks are static HTML served via file://).
 *   - Single Chromium project with a fixed viewport for deterministic pixels.
 *   - Tight default tolerance — these tests guard the design package and
 *     should fail loudly on any unintentional pixel drift.
 *
 * Usage:
 *   pnpm test:visual              — run, fail on any drift
 *   pnpm test:visual:update       — accept current output as the new baseline
 */

import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/visual-regression",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0, // visual diffs are deterministic — retries hide flakiness
  workers: process.env.CI ? 2 : 4,
  reporter: process.env.CI
    ? [["github"], ["html", { open: "never", outputFolder: "playwright-visual-report" }]]
    : [["list"], ["html", { open: "never", outputFolder: "playwright-visual-report" }]],
  timeout: 30_000,
  expect: {
    timeout: 10_000,
    toHaveScreenshot: {
      // Two-axis tolerance:
      //   maxDiffPixelRatio = % of pixels allowed to differ (machine-noise floor)
      //   threshold = per-channel color difference (0–1) before a pixel counts as different
      //
      // Empirically the noise floor on wide XLSX mocks (1.4 MP screenshots) is
      // ~1100 pixels (0.08%) due to font subpixel hinting in headless Chrome.
      // 0.5% gives ~5x headroom over the noise floor while still catching real
      // changes — a single moved column or color shift moves >1% of pixels.
      maxDiffPixelRatio: 0.005,
      threshold: 0.1,
      animations: "disabled",
    },
  },
  use: {
    // Fixed viewport — A4 portrait at 96 DPI is 794 × 1123. We use a wider
    // size so XLSX mocks (full bleed at 297mm = 1123px) and landscape pages
    // both render without horizontal scrollbars.
    viewport: { width: 1200, height: 900 },
    // Static files only — no network calls. If a mock tries to hit a CDN
    // (e.g. Google Fonts), block it. The font fallback chain in print.css
    // ensures readable rendering without external CSS.
    offline: false, // need this on so font CSS @import resolves
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
});
