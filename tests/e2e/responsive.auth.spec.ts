import { test, expect } from "@playwright/test";

const VIEWPORTS = [
  { name: "mobile", width: 375, height: 812 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1280, height: 800 },
  { name: "wide", width: 1920, height: 1080 },
] as const;

test.describe("Responsive — Assessments Page", () => {
  for (const viewport of VIEWPORTS) {
    test(`assessments page renders at ${viewport.name} (${viewport.width}x${viewport.height})`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto("/assessments");
      await page.waitForLoadState("networkidle");

      // Page should load without errors
      expect(page.url()).toContain("/assessments");

      // No horizontal overflow
      const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
      expect(bodyWidth).toBeLessThanOrEqual(viewport.width + 1);

      // Take screenshot for visual comparison
      await expect(page).toHaveScreenshot(`assessments-${viewport.name}.png`, {
        maxDiffPixelRatio: 0.05,
      });
    });
  }
});

test.describe("Responsive — Dashboard Page", () => {
  for (const viewport of VIEWPORTS) {
    test(`dashboard renders at ${viewport.name} (${viewport.width}x${viewport.height})`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto("/dashboard");
      await page.waitForLoadState("networkidle");

      // No horizontal overflow
      const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
      expect(bodyWidth).toBeLessThanOrEqual(viewport.width + 1);

      // Take screenshot for visual comparison
      await expect(page).toHaveScreenshot(`dashboard-${viewport.name}.png`, {
        maxDiffPixelRatio: 0.05,
      });
    });
  }
});
