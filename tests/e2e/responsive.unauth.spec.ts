import { test, expect } from "@playwright/test";

const VIEWPORTS = [
  { name: "mobile", width: 375, height: 812 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1280, height: 800 },
  { name: "wide", width: 1920, height: 1080 },
] as const;

test.describe("Responsive — Login Page", () => {
  for (const viewport of VIEWPORTS) {
    test(`login page renders correctly at ${viewport.name} (${viewport.width}x${viewport.height})`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto("/login");
      await page.waitForLoadState("load");

      // Email input should always be visible
      await expect(page.locator("input[type='email']")).toBeVisible();

      // Submit button should be visible
      await expect(page.getByRole("button", { name: /send|sign in/i })).toBeVisible();

      // No horizontal overflow
      const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
      expect(bodyWidth).toBeLessThanOrEqual(viewport.width + 1);

      // Optional visual baseline check for dedicated visual-regression runs.
      if (process.env.E2E_VISUAL_REGRESSION === "true") {
        await expect(page).toHaveScreenshot(`login-${viewport.name}.png`, {
          maxDiffPixelRatio: 0.05,
        });
      }
    });
  }
});
