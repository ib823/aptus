import { test, expect } from "@playwright/test";

test.describe("Admin Role — Navigation & Access", () => {
  test("can access assessments page", async ({ page }) => {
    await page.goto("/assessments");
    await page.waitForLoadState("networkidle");
    expect(page.url()).toContain("/assessments");
  });

  test("can access dashboard page", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");
    expect(page.url()).toContain("/dashboard");
  });

  test("can access admin panel", async ({ page }) => {
    await page.goto("/admin");
    await page.waitForLoadState("networkidle");
    // Admin should see the admin page, not be redirected
    expect(page.url()).toContain("/admin");
  });

  test("sees admin link in navigation", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/assessments");
    await page.waitForLoadState("networkidle");
    // Admin nav should show Settings/Admin link (visible on desktop)
    const adminLink = page.locator('a[href="/admin"]').first();
    await expect(adminLink).toBeVisible();
  });

  test("can navigate to new assessment page", async ({ page }) => {
    await page.goto("/assessments/new");
    await page.waitForLoadState("networkidle");
    expect(page.url()).toContain("/assessments/new");
  });
});

test.describe("Admin Role — Assessment Operations", () => {
  test("sees test assessment in assessments list", async ({ page }) => {
    await page.goto("/assessments");
    await page.waitForLoadState("networkidle");
    const content = await page.textContent("body");
    expect(content).toContain("E2E Test Corp");
  });

  test("can see test assessment in list", async ({ page }) => {
    await page.goto("/assessments");
    await page.waitForLoadState("networkidle");
    // Assessment card should show E2E Test Corp
    await expect(page.getByText("E2E Test Corp")).toBeVisible();
    // Card should be clickable (wrapped in a link to /assessment/[id]/scope)
    const link = page.locator("a").filter({ hasText: "E2E Test Corp" });
    const href = await link.getAttribute("href");
    expect(href).toMatch(/\/assessment\/.+\/scope/);
  });
});

test.describe("Admin Role — Logout", () => {
  test("can log out via nav button", async ({ page }) => {
    await page.goto("/assessments");
    await page.waitForLoadState("networkidle");
    const logoutButton = page.locator('button[aria-label="Sign out"]');
    if (await logoutButton.isVisible()) {
      await logoutButton.click();
      await page.waitForURL(/login/, { timeout: 10_000 });
      expect(page.url()).toContain("/login");
    }
  });
});
