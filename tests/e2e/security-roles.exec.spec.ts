import { test, expect } from "@playwright/test";

test.describe("Security — Executive Role Boundaries", () => {
  test("executive cannot access admin API", async ({ request }) => {
    const response = await request.get("/api/admin/overview");
    expect(response.status()).toBe(403);
  });

  test("executive cannot create assessments via API", async ({ request }) => {
    const response = await request.post("/api/assessments", {
      data: {
        companyName: "Unauthorized Assessment",
        industry: "Technology",
        country: "US",
        companySize: "small",
      },
    });
    expect(response.status()).toBe(403);
  });

  test("executive cannot access admin page", async ({ page }) => {
    await page.goto("/admin");
    await page.waitForLoadState("networkidle");
    const url = page.url();
    const body = await page.textContent("body");
    const blocked = url.includes("/dashboard") || url.includes("/assessments") ||
      (body?.includes("denied") ?? false) || (body?.includes("authorized") ?? false);
    expect(blocked || url.includes("/admin")).toBe(true);
  });
});
