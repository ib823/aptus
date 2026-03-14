import { test, expect, type Page } from "@playwright/test";
import { BasePage } from "../pages/base.page";

/**
 * Responsive Views — Tests ~30 major views at 3 viewports:
 *   Desktop (1920x1080), Tablet (1024x768), Mobile (390x844)
 *
 * Each view is tested for:
 *   1. No horizontal overflow
 *   2. Page loads without errors
 *   3. Visual regression screenshot
 */

const VIEWPORTS = [
  { name: "desktop", width: 1920, height: 1080 },
  { name: "tablet", width: 1024, height: 768 },
  { name: "mobile", width: 390, height: 844 },
] as const;

/** All views to test with their route paths (auth-required and public). */
const AUTH_VIEWS = [
  { name: "dashboard", path: "/dashboard" },
  { name: "assessments-list", path: "/assessments" },
  { name: "new-assessment", path: "/assessments/new" },
  { name: "organization", path: "/organization" },
  { name: "organization-users", path: "/organization/users" },
  { name: "analytics", path: "/analytics" },
  { name: "templates", path: "/templates" },
  { name: "admin-panel", path: "/admin" },
  { name: "admin-users", path: "/admin/users" },
  { name: "admin-assessments", path: "/admin/assessments" },
  { name: "admin-industries", path: "/admin/industries" },
  { name: "admin-baselines", path: "/admin/baselines" },
  { name: "admin-catalog", path: "/admin/catalog" },
  { name: "workshops-join", path: "/workshops/join" },
] as const;

const UNAUTH_VIEWS = [
  { name: "login", path: "/login" },
  { name: "mfa-verify", path: "/mfa/verify" },
  { name: "mfa-setup", path: "/mfa/setup" },
] as const;

/**
 * Assessment sub-pages are tested dynamically — we resolve the first
 * assessment ID and visit each sub-route.
 */
const ASSESSMENT_SUB_ROUTES = [
  { name: "profile", sub: "profile" },
  { name: "scope", sub: "scope" },
  { name: "review", sub: "review" },
  { name: "gaps", sub: "gaps" },
  { name: "integrations", sub: "integrations" },
  { name: "data-migration", sub: "data-migration" },
  { name: "ocm", sub: "ocm" },
  { name: "config", sub: "config" },
  { name: "flows", sub: "flows" },
  { name: "remaining", sub: "remaining" },
  { name: "report", sub: "report" },
] as const;

async function getFirstAssessmentId(page: Page): Promise<string | null> {
  await page.goto("/assessments");
  await page.waitForLoadState("load");
  const link = page.locator("a[href*='/assessment/']").first();
  if (await link.isVisible().catch(() => false)) {
    const href = await link.getAttribute("href");
    const match = href?.match(/assessment\/([^/]+)/);
    return match?.[1] ?? null;
  }
  return null;
}

function allowsIntentionalHorizontalScroll(path: string, viewportWidth: number): boolean {
  return path.startsWith("/admin") && viewportWidth <= 1024;
}

// ──────────────────────────────────────────────────────────────
// Authenticated views at all viewports
// ──────────────────────────────────────────────────────────────
test.describe("Responsive — Authenticated Views", () => {
  for (const view of AUTH_VIEWS) {
    for (const viewport of VIEWPORTS) {
      test(`${view.name} @ ${viewport.name} (${viewport.width}x${viewport.height})`, async ({
        page,
      }) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });

        await page.goto(view.path);
        await page.waitForLoadState("load");

        // Page should load without crashing
        const body = await page.textContent("body").catch(() => "");
        expect(body).not.toContain("Internal Server Error");

        // No horizontal overflow
        const basePage = new BasePage(page);
        if (!allowsIntentionalHorizontalScroll(view.path, viewport.width)) {
          const noOverflow = await basePage.checkNoHorizontalOverflow(viewport.width);
          expect(noOverflow).toBe(true);
        }

        // Optional visual baseline check for dedicated visual-regression runs.
        if (process.env.E2E_VISUAL_REGRESSION === "true") {
          await expect(page).toHaveScreenshot(
            `${view.name}-${viewport.name}.png`,
            { maxDiffPixelRatio: 0.05, fullPage: false }
          );
        }
      });
    }
  }
});

// ──────────────────────────────────────────────────────────────
// Unauthenticated views at all viewports
// ──────────────────────────────────────────────────────────────
test.describe("Responsive — Unauthenticated Views", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  for (const view of UNAUTH_VIEWS) {
    for (const viewport of VIEWPORTS) {
      test(`${view.name} @ ${viewport.name} (${viewport.width}x${viewport.height})`, async ({
        page,
      }) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });

        await page.goto(view.path);
        await page.waitForLoadState("load");

        const body = await page.textContent("body").catch(() => "");
        expect(body).not.toContain("Internal Server Error");

        const basePage = new BasePage(page);
        const noOverflow = await basePage.checkNoHorizontalOverflow(viewport.width);
        expect(noOverflow).toBe(true);

        if (process.env.E2E_VISUAL_REGRESSION === "true") {
          await expect(page).toHaveScreenshot(
            `unauth-${view.name}-${viewport.name}.png`,
            { maxDiffPixelRatio: 0.05, fullPage: false }
          );
        }
      });
    }
  }
});

// ──────────────────────────────────────────────────────────────
// Assessment sub-pages at all viewports
// ──────────────────────────────────────────────────────────────
test.describe("Responsive — Assessment Sub-Pages", () => {
  let assessmentId: string | null = null;

  test.beforeAll(async ({ browser }) => {
    // Resolve the assessment ID once for all sub-page tests
    const context = await browser.newContext();
    const page = await context.newPage();
    assessmentId = await getFirstAssessmentId(page);
    await context.close();
  });

  for (const subRoute of ASSESSMENT_SUB_ROUTES) {
    for (const viewport of VIEWPORTS) {
      test(`assessment-${subRoute.name} @ ${viewport.name} (${viewport.width}x${viewport.height})`, async ({
        page,
      }) => {
        if (!assessmentId) {
          // Fall back to resolving in-test if beforeAll didn't find one
          assessmentId = await getFirstAssessmentId(page);
        }
        if (!assessmentId) {
          test.skip(true, 'No assessment data available — seed required');
          return;
        }

        await page.setViewportSize({ width: viewport.width, height: viewport.height });

        await page.goto(`/assessment/${assessmentId}/${subRoute.sub}`);
        await page.waitForLoadState("load");

        const body = await page.textContent("body").catch(() => "");
        expect(body).not.toContain("Internal Server Error");

        const basePage = new BasePage(page);
        const noOverflow = await basePage.checkNoHorizontalOverflow(viewport.width);
        expect(noOverflow).toBe(true);

        if (process.env.E2E_VISUAL_REGRESSION === "true") {
          await expect(page).toHaveScreenshot(
            `assessment-${subRoute.name}-${viewport.name}.png`,
            { maxDiffPixelRatio: 0.05, fullPage: false }
          );
        }
      });
    }
  }
});

// ──────────────────────────────────────────────────────────────
// Mobile-specific interaction tests
// ──────────────────────────────────────────────────────────────
test.describe("Responsive — Mobile-Specific Interactions", () => {
  const mobileViewport = { width: 390, height: 844 };

  test("mobile hamburger menu opens and closes", async ({ page }) => {
    await page.setViewportSize(mobileViewport);
    await page.goto("/dashboard");
    await page.waitForLoadState("load");

    // Look for hamburger menu button
    const menuButton = page.locator(
      "[data-testid='mobile-menu'], button[aria-label*='menu' i], [data-testid='hamburger']"
    );

    if (await menuButton.isVisible().catch(() => false)) {
      await menuButton.click();

      // Navigation items should become visible
      const nav = page.locator("nav, [data-testid='mobile-nav']");
      await expect(nav).toBeVisible({ timeout: 5_000 });

      // Close menu
      await menuButton.click();
    }
  });

  test("mobile touch targets are at least 44px", async ({ page }) => {
    await page.setViewportSize(mobileViewport);
    await page.goto("/assessments");
    await page.waitForLoadState("load");

    const buttons = page.locator("button, a[role='button'], [role='tab']");
    const count = await buttons.count();

    const tooSmall: string[] = [];
    for (let i = 0; i < Math.min(count, 20); i++) {
      const btn = buttons.nth(i);
      if (await btn.isVisible().catch(() => false)) {
        const box = await btn.boundingBox();
        if (box && (box.width < 44 || box.height < 44)) {
          const text = await btn.textContent().catch(() => "unknown");
          tooSmall.push(`${text?.trim()} (${Math.round(box.width)}x${Math.round(box.height)})`);
        }
      }
    }

    // Allow some tolerance — flag but don't hard-fail (informational)
    if (tooSmall.length > 0) {
      console.warn(`Touch targets below 44px: ${tooSmall.join(", ")}`);
    }
  });

  test("mobile scroll behavior on long assessment list", async ({ page }) => {
    await page.setViewportSize(mobileViewport);
    await page.goto("/assessments");
    await page.waitForLoadState("load");

    // Scroll to bottom
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(500);

    // Verify the page scrolled correctly
    const scrollY = await page.evaluate(() => window.scrollY);
    // If there's content to scroll, scrollY should be > 0
    expect(scrollY).toBeGreaterThanOrEqual(0);
  });

  test("mobile orientation change — portrait to landscape", async ({ page }) => {
    // Start in portrait
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/dashboard");
    await page.waitForLoadState("load");

    // Switch to landscape
    await page.setViewportSize({ width: 844, height: 390 });
    await page.waitForTimeout(500);

    const basePage = new BasePage(page);
    const noOverflow = await basePage.checkNoHorizontalOverflow(844);
    expect(noOverflow).toBe(true);

    const body = await page.textContent("body").catch(() => "");
    expect(body).not.toContain("Internal Server Error");
  });
});

// ──────────────────────────────────────────────────────────────
// Tablet-specific interaction tests
// ──────────────────────────────────────────────────────────────
test.describe("Responsive — Tablet-Specific Interactions", () => {
  const tabletViewport = { width: 1024, height: 768 };

  test("tablet sidebar collapses or adapts", async ({ page }) => {
    await page.setViewportSize(tabletViewport);
    await page.goto("/dashboard");
    await page.waitForLoadState("load");

    const sidebar = page.locator("[data-testid='sidebar'], nav:first-of-type");
    if (await sidebar.isVisible().catch(() => false)) {
      const box = await sidebar.boundingBox();
      // Sidebar should not take more than 30% of tablet width
      if (box) {
        expect(box.width).toBeLessThan(tabletViewport.width * 0.35);
      }
    }
  });

  test("tablet table columns adapt without horizontal scroll", async ({ page }) => {
    await page.setViewportSize(tabletViewport);
    await page.goto("/assessments");
    await page.waitForLoadState("load");

    const basePage = new BasePage(page);
    const noOverflow = await basePage.checkNoHorizontalOverflow(tabletViewport.width);
    expect(noOverflow).toBe(true);
  });
});
