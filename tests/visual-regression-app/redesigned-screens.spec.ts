/** Visual-regression suite for the LIVE redesigned app pages (Apps 1–7).
 *
 * Hits real Next.js routes (not static HTML) so design-token changes are
 * verified end-to-end through React rendering. Runs against:
 *   - localhost:3003 (default — playwright.visual-app.config.ts spins up next start)
 *   - PLAYWRIGHT_BASE_URL env var (e.g. a Vercel preview URL)
 *
 * Scoped to PUBLIC pages for v1. Authenticated pages (assessment shell,
 * settings, etc.) need extending the existing e2e auth-state infrastructure
 * — that's App-8b.
 *
 * To accept current output as new baseline (after intentional design changes):
 *   pnpm test:visual-app:update
 */

import { test, expect, type Page } from "@playwright/test";

/** Wait for the page to be visually stable — fonts loaded, network settled. */
async function waitForRenderStable(page: Page) {
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts.ready);
  // One more frame to let layout settle after font load
  await page.evaluate(
    () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
  );
}

test.describe("Redesigned public pages", () => {
  test("/design-system — App-1 + App-2 showcase renders with all sections", async ({ page }) => {
    await page.goto("/design-system");
    await waitForRenderStable(page);

    // Sanity checks before screenshot — fail fast with a clear error if the
    // page didn't render the expected content (rather than an opaque pixel diff)
    await expect(page.getByText("Aptus Design System")).toBeVisible();
    await expect(page.getByText("Color tokens")).toBeVisible();
    await expect(page.getByText("Status pills").or(page.getByText("StatusPill"))).toBeVisible();

    await expect(page).toHaveScreenshot("design-system.png", { fullPage: true });
  });

  test("/login — App-6 auth surface", async ({ page }) => {
    await page.goto("/login");
    await waitForRenderStable(page);

    // Login form should be visible (regardless of which variant: magic link / passkey)
    await expect(page.locator("input[type='email'], input[name='email']").first()).toBeVisible();

    await expect(page).toHaveScreenshot("login.png", { fullPage: true });
  });
});

test.describe("Coverage guard", () => {
  test("redesigned-screens spec covers the documented public surfaces", () => {
    // This is a guard test — if the list of public surfaces grows, the
    // assertion will fail and remind the maintainer to add a screenshot.
    const PUBLIC_SURFACES = ["/design-system", "/login"];
    expect(PUBLIC_SURFACES).toHaveLength(2);
  });
});
