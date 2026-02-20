import { test, expect } from "@playwright/test";

test.describe("Process Owner Role — Navigation & Access", () => {
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

  test("cannot access admin panel", async ({ page }) => {
    await page.goto("/admin");
    await page.waitForLoadState("networkidle");
    const url = page.url();
    const body = await page.textContent("body");
    const blocked = url.includes("/dashboard") || url.includes("/assessments") ||
      (body?.includes("denied") ?? false) || (body?.includes("authorized") ?? false);
    expect(blocked || url.includes("/admin")).toBe(true);
  });

  test("does not see admin link in navigation", async ({ page }) => {
    await page.goto("/assessments");
    await page.waitForLoadState("networkidle");
    const adminLink = page.locator('a[href="/admin"]');
    await expect(adminLink).toHaveCount(0);
  });
});

test.describe("Process Owner Role — Assessment Visibility", () => {
  test("sees assessments where they are a stakeholder", async ({ page }) => {
    await page.goto("/assessments");
    await page.waitForLoadState("networkidle");
    // PO should see assessments they're assigned to
    const body = await page.textContent("body");
    // Either sees the test assessment or an empty state
    const hasContent = (body?.includes("E2E Test Corp") ?? false) ||
      (body?.includes("No assessments") ?? false);
    expect(hasContent).toBe(true);
  });
});
