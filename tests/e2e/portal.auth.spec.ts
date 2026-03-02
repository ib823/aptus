import { test, expect } from "@playwright/test";

test.describe("Portal — Authenticated", () => {
  test("should load assessments page", async ({ page }) => {
    await page.goto("/assessments");
    await expect(page).toHaveTitle(/ABeam/);
    // The page should render without redirecting to login
    await expect(page.url()).toContain("/assessments");
  });

  test("should display navigation bar", async ({ page }) => {
    await page.goto("/assessments");
    // Portal nav should be visible with ABeam branding
    await expect(page.getByText(/ABeam/i).first()).toBeVisible();
  });

  test("should navigate to new assessment page", async ({ page }) => {
    await page.goto("/assessments/new");
    await page.waitForLoadState("networkidle");
    // Should either show the assessment creation form or redirect
    expect(page.url()).toMatch(/assessments/);
  });

  test("should load dashboard page", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");
    expect(page.url()).toMatch(/dashboard|assessments/);
  });
});
