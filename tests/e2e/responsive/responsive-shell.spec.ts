import { test, expect } from "@playwright/test";

/**
 * Shell Responsive Regression Suite
 *
 * Guards against the CSS Grid min-content blowout on `.aptus-app` (the top-
 * level shell). Before fix(shell): `.aptus-app` had no `grid-template-columns`
 * so its single implicit track sized to max-content (~1432px), forcing the
 * shell wider than the viewport at all narrow widths and breaking every
 * `md:` Tailwind breakpoint underneath.
 *
 * Each assertion below would have failed before the fix and must pass after:
 *
 *   1. document.documentElement scrollWidth ≤ clientWidth + 1
 *      (no horizontal overflow on the page itself)
 *   2. .aptus-app bounding box width ≤ viewport.width + 1
 *      (the shell is not wider than the viewport)
 *   3. .aptus-app computed grid-template-columns is NOT a fixed pixel value
 *      (it must be a flexible minmax/fr value, otherwise blowout returns)
 *
 * See docs/design/clickable-elements.md and globals.css for the structural
 * fixes. See tests/e2e/responsive/responsive-views.spec.ts for visual
 * regression coverage at the same viewports.
 */

const VIEWPORTS = [
  { name: "mobile-sm", width: 320, height: 800 },
  { name: "mobile",    width: 375, height: 800 },
  { name: "tablet",    width: 768, height: 1024 },
  { name: "laptop",    width: 1024, height: 768 },
  { name: "desktop",   width: 1440, height: 900 },
] as const;

const ROUTES = [
  "/dashboard",
  "/assessments",
  "/templates",
] as const;

for (const vp of VIEWPORTS) {
  for (const route of ROUTES) {
    test(`shell ${route} is responsive at ${vp.name} (${vp.width}x${vp.height})`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(route);
      await page.waitForLoadState("load");

      // 1. No horizontal scroll on the document root.
      const overflow = await page.evaluate(() => ({
        scrollW: document.documentElement.scrollWidth,
        clientW: document.documentElement.clientWidth,
      }));
      expect(
        overflow.scrollW,
        `${route} @ ${vp.name}: document scrollWidth (${overflow.scrollW}) exceeds clientWidth (${overflow.clientW}). The min-content blowout has returned.`,
      ).toBeLessThanOrEqual(overflow.clientW + 1);

      // 2. .aptus-app shell does not exceed the viewport width.
      const shell = await page.evaluate(() => {
        const el = document.querySelector(".aptus-app");
        if (!el) return null;
        const cs = getComputedStyle(el);
        return {
          width: el.getBoundingClientRect().width,
          gridTemplateColumns: cs.gridTemplateColumns,
        };
      });
      expect(shell, `${route} @ ${vp.name}: .aptus-app element not found.`).not.toBeNull();
      expect(
        shell!.width,
        `${route} @ ${vp.name}: .aptus-app width (${shell!.width}) exceeds viewport width (${vp.width}).`,
      ).toBeLessThanOrEqual(vp.width + 1);

      // 3. grid-template-columns must NOT be a single fixed px value > 320px.
      // A 4-digit pixel value is the canonical "min-content blowout" footprint.
      expect(
        shell!.gridTemplateColumns,
        `${route} @ ${vp.name}: .aptus-app grid-template-columns is "${shell!.gridTemplateColumns}" — should be a flexible value (minmax/fr), not a fixed pixel width.`,
      ).not.toMatch(/^\d{4,}px$/);
    });
  }
}

test.describe("AptusShell off-canvas sidebar (mobile)", () => {
  test("hamburger toggle is visible at ≤768px and toggles the sidebar", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto("/dashboard");
    await page.waitForLoadState("load");

    const toggle = page.locator(".a-menu-toggle");
    await expect(toggle, "menu toggle should be visible at mobile width").toBeVisible();

    const sidebar = page.locator(".a-siderail-mobile");
    await expect(sidebar, "sidebar should NOT have a-open class initially").not.toHaveClass(/a-open/);

    await toggle.click();
    await expect(sidebar, "sidebar should have a-open class after toggle").toHaveClass(/a-open/);

    // Close via backdrop tap.
    await page.locator('[aria-hidden="true"]').first().click({ force: true });
    await expect(sidebar, "sidebar should close after backdrop click").not.toHaveClass(/a-open/);
  });

  test("hamburger toggle is hidden at ≥769px", async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto("/dashboard");
    await page.waitForLoadState("load");
    await expect(page.locator(".a-menu-toggle")).toBeHidden();
  });
});
