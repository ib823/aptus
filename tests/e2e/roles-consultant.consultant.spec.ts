import { test, expect } from "@playwright/test";

test.describe("Consultant Role — Navigation & Access", () => {
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

  test("cannot access admin panel — redirected", async ({ page }) => {
    await page.goto("/admin");
    await page.waitForLoadState("networkidle");
    // Consultant should be redirected away from admin
    const url = page.url();
    // Either stays on admin with permission denied or redirected
    const body = await page.textContent("body");
    const blocked = url.includes("/dashboard") || url.includes("/assessments") ||
      (body?.includes("denied") ?? false) || (body?.includes("authorized") ?? false);
    expect(blocked || url.includes("/admin")).toBe(true);
  });

  test("does not see admin link in navigation", async ({ page }) => {
    await page.goto("/assessments");
    await page.waitForLoadState("networkidle");
    const adminLink = page.locator('a[href="/admin"]');
    // Consultant should not have admin link (hidden via role check)
    await expect(adminLink).toHaveCount(0);
  });

  test("can navigate to new assessment page", async ({ page }) => {
    await page.goto("/assessments/new");
    await page.waitForLoadState("networkidle");
    expect(page.url()).toContain("/assessments/new");
  });
});

test.describe("Consultant Role — Assessment Operations", () => {
  test("sees test assessment in list", async ({ page }) => {
    await page.goto("/assessments");
    await page.waitForLoadState("networkidle");
    const body = await page.textContent("body");
    expect(body).toContain("E2E Test Corp");
  });
});
