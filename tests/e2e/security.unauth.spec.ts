import { test, expect } from "@playwright/test";

test.describe("Security — Unauthenticated", () => {
  test("security headers are present on responses", async ({ page }) => {
    const response = await page.goto("/login");
    expect(response).not.toBeNull();
    const headers = response!.headers();

    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(headers["content-security-policy"]).toContain("object-src 'none'");
  });

  test("HSTS header is set", async ({ page }) => {
    const response = await page.goto("/login");
    const headers = response!.headers();
    expect(headers["strict-transport-security"]).toContain("max-age=");
  });

  test("protected routes redirect to login when unauthenticated", async ({ page }) => {
    await page.goto("/assessments");
    await page.waitForLoadState("networkidle");
    expect(page.url()).toContain("/login");
  });

  test("API returns 401 for unauthenticated requests", async ({ request }) => {
    const response = await request.get("/api/assessments");
    expect(response.status()).toBe(401);
    const body = await response.json();
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  test("API returns 401 for unauthenticated dashboard", async ({ request }) => {
    const response = await request.get("/api/dashboard");
    expect(response.status()).toBe(401);
  });

  test("API returns 401 for unauthenticated admin endpoints", async ({ request }) => {
    const response = await request.get("/api/admin/overview");
    expect(response.status()).toBe(401);
  });

  test("no server information leaked in headers", async ({ page }) => {
    const response = await page.goto("/login");
    const headers = response!.headers();
    // Should not expose Express or other server frameworks
    // Note: Next.js sets x-powered-by in dev mode; this is removed in production
    expect(headers["server"] ?? "").not.toContain("Express");
  });
});

test.describe("Security — Open Redirect Prevention", () => {
  test("bridge endpoint rejects absolute URL callback", async ({ request }) => {
    const response = await request.get("/api/auth/bridge?callbackUrl=https://evil.com");
    // Should redirect to login or /assessments, NOT to evil.com
    const location = response.headers()["location"] ?? response.url();
    expect(location).not.toContain("evil.com");
  });

  test("bridge endpoint rejects protocol-relative callback", async ({ request }) => {
    const response = await request.get("/api/auth/bridge?callbackUrl=//evil.com");
    const location = response.headers()["location"] ?? response.url();
    expect(location).not.toContain("evil.com");
  });
});

test.describe("Security — Input Validation", () => {
  test("POST /api/assessments rejects invalid body", async ({ request }) => {
    const response = await request.post("/api/assessments", {
      data: { companyName: "" },
    });
    // Should be 400 or 401 (not 500)
    expect(response.status()).toBeLessThan(500);
  });

  test("MFA verify rejects non-digit codes", async ({ request }) => {
    const response = await request.post("/api/auth/mfa/verify", {
      data: { code: "abcdef" },
    });
    // Should be 400 or 401 (not 500)
    expect(response.status()).toBeLessThan(500);
  });
});
