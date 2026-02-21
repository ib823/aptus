import { test, expect } from "@playwright/test";

test.describe("Security — Authenticated (Admin)", () => {
  test("security headers present on authenticated pages", async ({ page }) => {
    const response = await page.goto("/assessments");
    expect(response).not.toBeNull();
    const headers = response!.headers();

    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["content-security-policy"]).toContain("default-src 'self'");
  });

  test("session cookie has HttpOnly flag", async ({ page }) => {
    await page.goto("/assessments");
    await page.waitForLoadState("networkidle");

    // HttpOnly cookies are NOT accessible via JavaScript
    const jsAccessibleCookies = await page.evaluate(() => document.cookie);
    expect(jsAccessibleCookies).not.toContain("fit-portal-session");
  });

  test("API rejects requests with tampered session cookie", async ({ browser }) => {
    // Create a fresh context with a fake session cookie
    const context = await browser.newContext();
    await context.addCookies([{
      name: "fit-portal-session",
      value: "tampered-invalid-session-token-that-doesnt-exist",
      domain: "localhost",
      path: "/",
    }]);

    const page = await context.newPage();
    const response = await page.request.get("/api/assessments");
    expect(response.status()).toBe(401);

    await context.close();
  });

  test("no sensitive data in page source", async ({ page }) => {
    await page.goto("/assessments");
    await page.waitForLoadState("networkidle");

    const content = await page.content();
    expect(content).not.toContain("NEXTAUTH_SECRET");
    expect(content).not.toContain("TOTP_ENCRYPTION_KEY");
    expect(content).not.toContain("DATABASE_URL");
  });

  test("admin can access admin page", async ({ page }) => {
    await page.goto("/admin");
    await page.waitForLoadState("networkidle");
    expect(page.url()).toContain("/admin");
  });

  test("admin can list assessments", async ({ page }) => {
    await page.goto("/assessments");
    await page.waitForLoadState("networkidle");
    expect(page.url()).toContain("/assessments");
    const body = await page.textContent("body");
    expect(body).toBeTruthy();
  });

  // Logout test MUST be last — it invalidates the session
  test("logout clears session cookie", async ({ page }) => {
    await page.goto("/assessments");
    await page.waitForLoadState("networkidle");

    await page.goto("/api/auth/logout");
    await page.waitForLoadState("networkidle");

    expect(page.url()).toContain("/login");

    const cookies = await page.context().cookies();
    const sessionCookie = cookies.find(c => c.name === "fit-portal-session");
    expect(sessionCookie).toBeUndefined();
  });
});
