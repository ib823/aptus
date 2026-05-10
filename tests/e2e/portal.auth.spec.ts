import { test, expect } from "@playwright/test";

test.describe("Portal — Authenticated", () => {
  test("should load assessments page", async ({ page }) => {
    await page.goto("/assessments");
    await expect(page).toHaveTitle(/Aptus/);
    // The page should render without redirecting to login
    await expect(page.url()).toContain("/assessments");
  });

  test("should display navigation bar", async ({ page }) => {
    await page.goto("/assessments");
    // Portal nav should be visible with Aptus branding
    await expect(page.getByText(/Aptus/i).first()).toBeVisible();
  });

  test("should navigate to new assessment page", async ({ page }) => {
    await page.goto("/assessments/new");
    await page.waitForLoadState("load");
    // Should either show the assessment creation form or redirect
    expect(page.url()).toMatch(/assessments/);
  });

  test("should load dashboard page", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForLoadState("load");
    expect(page.url()).toMatch(/dashboard|assessments/);
  });
});
