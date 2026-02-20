import { test, expect } from "@playwright/test";

test.describe("UI Consistency — Authenticated Pages", () => {
  test("assessments page uses correct font family", async ({ page }) => {
    await page.goto("/assessments");
    await page.waitForLoadState("networkidle");

    // Check that the body uses the SF Pro font stack
    const fontFamily = await page.evaluate(() => {
      return window.getComputedStyle(document.body).fontFamily;
    });

    // Should include SF Pro or its fallbacks
    const hasSFPro =
      fontFamily.includes("SF Pro") ||
      fontFamily.includes("-apple-system") ||
      fontFamily.includes("BlinkMacSystemFont") ||
      fontFamily.includes("system-ui") ||
      fontFamily.includes("Helvetica");
    expect(hasSFPro).toBe(true);
  });

  test("navigation bar has consistent styling", async ({ page }) => {
    await page.goto("/assessments");
    await page.waitForLoadState("networkidle");

    // Nav should exist
    const nav = page.locator("nav").first();
    if (await nav.isVisible()) {
      // Nav should have a background color
      const bgColor = await nav.evaluate((el) => window.getComputedStyle(el).backgroundColor);
      expect(bgColor).toBeTruthy();
    }
  });

  test("buttons follow consistent design patterns", async ({ page }) => {
    await page.goto("/assessments");
    await page.waitForLoadState("networkidle");

    // Check all visible buttons with data-slot="button" (shadcn) have consistent styling
    const buttons = page.locator('button[data-slot="button"]');
    const count = await buttons.count();

    const radii: string[] = [];
    for (let i = 0; i < Math.min(count, 10); i++) {
      const button = buttons.nth(i);
      if (await button.isVisible()) {
        const borderRadius = await button.evaluate(
          (el) => window.getComputedStyle(el).borderRadius,
        );
        radii.push(borderRadius);
      }
    }

    // All shadcn buttons should have consistent border-radius with each other
    if (radii.length > 1) {
      const unique = new Set(radii);
      // Allow at most 2 different radii (e.g., default + icon button)
      expect(unique.size).toBeLessThanOrEqual(2);
    }
  });

  test("no layout shifts detected on assessments page", async ({ page }) => {
    await page.goto("/assessments");

    // Measure Cumulative Layout Shift
    const cls = await page.evaluate(async () => {
      return new Promise<number>((resolve) => {
        let clsValue = 0;
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            const layoutEntry = entry as PerformanceEntry & {
              hadRecentInput?: boolean;
              value?: number;
            };
            if (!layoutEntry.hadRecentInput && layoutEntry.value) {
              clsValue += layoutEntry.value;
            }
          }
        });
        observer.observe({ type: "layout-shift", buffered: true });
        // Wait a bit for any shifts to register
        setTimeout(() => {
          observer.disconnect();
          resolve(clsValue);
        }, 3000);
      });
    });

    // CLS should be below 0.1 (good threshold per Web Vitals)
    expect(cls).toBeLessThan(0.1);
  });

  test("no console errors on assessments page", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        errors.push(msg.text());
      }
    });

    await page.goto("/assessments");
    await page.waitForLoadState("networkidle");

    // Filter out known acceptable errors (e.g., 3rd party script errors)
    const realErrors = errors.filter(
      (e) => !e.includes("favicon") && !e.includes("hydration"),
    );
    expect(realErrors).toHaveLength(0);
  });

  test("no broken images on assessments page", async ({ page }) => {
    await page.goto("/assessments");
    await page.waitForLoadState("networkidle");

    const brokenImages = await page.evaluate(() => {
      const images = document.querySelectorAll("img");
      const broken: string[] = [];
      images.forEach((img) => {
        if (!img.complete || img.naturalWidth === 0) {
          broken.push(img.src);
        }
      });
      return broken;
    });

    expect(brokenImages).toHaveLength(0);
  });
});
