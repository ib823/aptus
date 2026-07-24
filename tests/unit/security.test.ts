/** Security unit tests — sanitization, rate limiting, input validation */

import { describe, test, expect, vi, beforeEach } from "vitest";
import type { UserRole } from "@/types/assessment";
import type { checkRateLimit as CheckRateLimitFn, getClientIp as GetClientIpFn } from "@/lib/security/rate-limit";

// ── HTML Sanitization ─────────────────────────────────────────────────────
describe("HTML Sanitization", () => {
  let sanitizeHtmlContent: (html: string) => string;
  let sanitizeSvgContent: (svg: string) => string;

  beforeEach(async () => {
    const mod = await import("@/lib/security/sanitize");
    sanitizeHtmlContent = mod.sanitizeHtmlContent;
    sanitizeSvgContent = mod.sanitizeSvgContent;
  });

  test("strips script tags", () => {
    const input = '<p>Hello</p><script>alert("xss")</script>';
    const result = sanitizeHtmlContent(input);
    expect(result).not.toContain("<script>");
    expect(result).toContain("<p>Hello</p>");
  });

  test("strips inline event handlers", () => {
    const input = '<img src="x" onerror="alert(1)" />';
    const result = sanitizeHtmlContent(input);
    expect(result).not.toContain("onerror");
  });

  test("strips onclick handlers", () => {
    const input = '<button onclick="steal()">Click</button>';
    const result = sanitizeHtmlContent(input);
    expect(result).not.toContain("onclick");
  });

  test("strips onload handlers", () => {
    const input = '<body onload="malicious()">';
    const result = sanitizeHtmlContent(input);
    expect(result).not.toContain("onload");
  });

  test("strips javascript: URLs", () => {
    const input = '<a href="javascript:alert(1)">Click</a>';
    const result = sanitizeHtmlContent(input);
    expect(result).not.toContain("javascript:");
  });

  test("strips data: URLs in links", () => {
    const input = '<a href="data:text/html,<script>alert(1)</script>">Click</a>';
    const result = sanitizeHtmlContent(input);
    expect(result).not.toContain("data:");
  });

  test("allows safe HTML tags", () => {
    const input = '<p><strong>Bold</strong> and <em>italic</em></p>';
    const result = sanitizeHtmlContent(input);
    expect(result).toContain("<strong>Bold</strong>");
    expect(result).toContain("<em>italic</em>");
  });

  test("allows tables", () => {
    const input = '<table><tr><th>Header</th></tr><tr><td>Cell</td></tr></table>';
    const result = sanitizeHtmlContent(input);
    expect(result).toContain("<table>");
    expect(result).toContain("<td>Cell</td>");
  });

  test("allows lists", () => {
    const input = '<ul><li>Item 1</li><li>Item 2</li></ul>';
    const result = sanitizeHtmlContent(input);
    expect(result).toContain("<ul>");
    expect(result).toContain("<li>Item 1</li>");
  });

  test("strips iframe tags", () => {
    const input = '<iframe src="https://evil.com"></iframe>';
    const result = sanitizeHtmlContent(input);
    expect(result).not.toContain("<iframe");
  });

  test("strips object/embed tags", () => {
    const input = '<object data="evil.swf"></object><embed src="evil.swf">';
    const result = sanitizeHtmlContent(input);
    expect(result).not.toContain("<object");
    expect(result).not.toContain("<embed");
  });

  test("strips form tags", () => {
    const input = '<form action="https://evil.com"><input type="text"></form>';
    const result = sanitizeHtmlContent(input);
    expect(result).not.toContain("<form");
  });

  test("strips style tags with @import", () => {
    const input = '<style>@import url("https://evil.com/steal.css")</style>';
    const result = sanitizeHtmlContent(input);
    expect(result).not.toContain("<style");
    expect(result).not.toContain("@import");
  });

  test("strips meta tags (redirect attacks)", () => {
    const input = '<meta http-equiv="refresh" content="0;url=https://evil.com">';
    const result = sanitizeHtmlContent(input);
    expect(result).not.toContain("<meta");
  });

  test("adds target=_blank and rel=noopener to links", () => {
    const input = '<a href="https://example.com">Link</a>';
    const result = sanitizeHtmlContent(input);
    expect(result).toContain('target="_blank"');
    expect(result).toContain('rel="noopener noreferrer"');
  });

  // SVG sanitization
  test("strips script elements from SVG", () => {
    const input = '<svg><script>alert(1)</script><rect width="100" height="100"/></svg>';
    const result = sanitizeSvgContent(input);
    expect(result).not.toContain("<script>");
    expect(result).toContain("<rect");
  });

  test("strips foreignObject from SVG", () => {
    const input = '<svg><foreignObject><body><script>alert(1)</script></body></foreignObject></svg>';
    const result = sanitizeSvgContent(input);
    expect(result).not.toContain("<foreignObject");
    expect(result).not.toContain("<script>");
  });

  test("allows safe SVG elements", () => {
    const input = '<svg viewBox="0 0 100 100"><rect x="0" y="0" width="100" height="100" fill="red"/></svg>';
    const result = sanitizeSvgContent(input);
    expect(result).toContain("<svg");
    expect(result).toContain("<rect");
  });

  test("strips event handlers from SVG elements", () => {
    const input = '<svg><rect onclick="alert(1)" width="100" height="100"/></svg>';
    const result = sanitizeSvgContent(input);
    expect(result).not.toContain("onclick");
  });
});

// ── Rate Limiting ─────────────────────────────────────────────────────────
describe("Rate Limiting", () => {
  let checkRateLimit: typeof CheckRateLimitFn;

  beforeEach(async () => {
    const mod = await import("@/lib/security/rate-limit");
    checkRateLimit = mod.checkRateLimit;
  });

  test("allows requests within limit", async () => {
    const key = `test-allow-${Date.now()}`;
    const config = { limit: 5, windowMs: 60000 };

    const result = await checkRateLimit(key, config);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
  });

  test("blocks requests exceeding limit", async () => {
    const key = `test-block-${Date.now()}`;
    const config = { limit: 3, windowMs: 60000 };

    await checkRateLimit(key, config);
    await checkRateLimit(key, config);
    await checkRateLimit(key, config);

    const result = await checkRateLimit(key, config);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  test("different keys have independent limits", async () => {
    const config = { limit: 1, windowMs: 60000 };

    const key1 = `test-key1-${Date.now()}`;
    const key2 = `test-key2-${Date.now()}`;

    await checkRateLimit(key1, config);
    const result = await checkRateLimit(key2, config);
    expect(result.allowed).toBe(true);
  });

  test("provides reset time when blocked", async () => {
    const key = `test-reset-${Date.now()}`;
    const config = { limit: 1, windowMs: 60000 };

    await checkRateLimit(key, config);
    const result = await checkRateLimit(key, config);
    expect(result.allowed).toBe(false);
    expect(result.resetMs).toBeGreaterThan(0);
    expect(result.resetMs).toBeLessThanOrEqual(60000);
  });
});

// ── Client IP Extraction ──────────────────────────────────────────────────
describe("Client IP Extraction", () => {
  let getClientIp: typeof GetClientIpFn;

  beforeEach(async () => {
    const mod = await import("@/lib/security/rate-limit");
    getClientIp = mod.getClientIp;
  });

  test("extracts first IP from X-Forwarded-For", () => {
    const headers = new Headers({
      "x-forwarded-for": "1.2.3.4, 10.0.0.1, 192.168.1.1",
    });
    expect(getClientIp(headers)).toBe("1.2.3.4");
  });

  test("falls back to X-Real-IP", () => {
    const headers = new Headers({
      "x-real-ip": "5.6.7.8",
    });
    expect(getClientIp(headers)).toBe("5.6.7.8");
  });

  test("returns unknown when no IP headers", () => {
    const headers = new Headers();
    expect(getClientIp(headers)).toBe("unknown");
  });

  test("trims whitespace from forwarded IP", () => {
    const headers = new Headers({
      "x-forwarded-for": "  9.8.7.6  , 10.0.0.1",
    });
    expect(getClientIp(headers)).toBe("9.8.7.6");
  });
});

// ── Open Redirect Prevention ──────────────────────────────────────────────
describe("Open Redirect Prevention", () => {
  test("allows relative paths", () => {
    const callback = "/assessments";
    const safe = callback.startsWith("/") && !callback.startsWith("//")
      ? callback
      : "/assessments";
    expect(safe).toBe("/assessments");
  });

  test("blocks protocol-relative URLs", () => {
    const callback = "//evil.com/steal";
    const safe = callback.startsWith("/") && !callback.startsWith("//")
      ? callback
      : "/assessments";
    expect(safe).toBe("/assessments");
  });

  test("blocks absolute URLs", () => {
    const callback = "https://evil.com/phishing";
    const safe = callback.startsWith("/") && !callback.startsWith("//")
      ? callback
      : "/assessments";
    expect(safe).toBe("/assessments");
  });

  test("allows nested paths", () => {
    const callback = "/assessment/abc123/scope";
    const safe = callback.startsWith("/") && !callback.startsWith("//")
      ? callback
      : "/assessments";
    expect(safe).toBe("/assessment/abc123/scope");
  });

  test("blocks javascript: URLs", () => {
    const callback = "javascript:alert(1)";
    const safe = callback.startsWith("/") && !callback.startsWith("//")
      ? callback
      : "/assessments";
    expect(safe).toBe("/assessments");
  });
});

// ── Input Validation Schemas ──────────────────────────────────────────────
describe("Input Validation", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { z } = require("zod");

  test("rejects empty company name", () => {
    const schema = z.object({ companyName: z.string().min(1).max(200) });
    expect(schema.safeParse({ companyName: "" }).success).toBe(false);
  });

  test("rejects overly long company name", () => {
    const schema = z.object({ companyName: z.string().min(1).max(200) });
    expect(schema.safeParse({ companyName: "A".repeat(201) }).success).toBe(false);
  });

  test("rejects invalid TOTP code format", () => {
    const schema = z.object({ code: z.string().length(6).regex(/^\d{6}$/) });
    expect(schema.safeParse({ code: "12345" }).success).toBe(false);
    expect(schema.safeParse({ code: "abcdef" }).success).toBe(false);
    expect(schema.safeParse({ code: "123456" }).success).toBe(true);
  });

  test("rejects SQL injection in string fields", () => {
    const schema = z.object({
      code: z.string().min(2).max(50).regex(/^[a-z0-9_-]+$/),
    });
    // SQL injection attempt
    expect(schema.safeParse({ code: "'; DROP TABLE users; --" }).success).toBe(false);
  });

  test("rejects XSS in string fields with regex", () => {
    const schema = z.object({
      code: z.string().min(2).max(50).regex(/^[a-z0-9_-]+$/),
    });
    expect(schema.safeParse({ code: '<script>alert("xss")</script>' }).success).toBe(false);
  });
});

// TOTP encryption tests removed — TOTP support deleted in favor of passkey-only second factor.

// ── Session Security ──────────────────────────────────────────────────────
describe("Session Token Generation", () => {
  test("generates 64-character hex tokens", async () => {
    const { generateSessionToken } = await import("@/lib/auth/session");
    const token = generateSessionToken();
    expect(token).toMatch(/^[a-f0-9]{64}$/);
  });

  test("generates unique tokens", async () => {
    const { generateSessionToken } = await import("@/lib/auth/session");
    const tokens = new Set(Array.from({ length: 100 }, () => generateSessionToken()));
    expect(tokens.size).toBe(100);
  });
});

// ── Permission Boundaries ─────────────────────────────────────────────────
describe("Permission Boundaries", () => {
  // Post-simplification: there is no role-gated TOTP. Magic link is sufficient
  // on its own unless the organization requires passkey MFA.
  test("isMfaRequired only blocks default magic-link users when org policy requires it", async () => {
    const { isMfaRequired } = await import("@/lib/auth/permissions");

    const externalUser = {
      id: "1", email: "test@test.com", name: "Test",
      role: "process_owner" as const,
      organizationId: null, organizationMfaPolicy: null, mfaEnabled: true, mfaVerified: false, hasWebAuthn: false,
    };
    expect(isMfaRequired(externalUser)).toBe(false);

    const adminNoMfa = {
      id: "2", email: "admin@test.com", name: "Admin",
      role: "admin" as unknown as UserRole,
      organizationId: null, organizationMfaPolicy: null, mfaEnabled: false, mfaVerified: false, hasWebAuthn: false,
    };
    expect(isMfaRequired(adminNoMfa)).toBe(false);

    const requiredOrgUser = {
      id: "3", email: "required@test.com", name: "Required",
      role: "process_owner" as const,
      organizationId: "org-1", organizationMfaPolicy: "required" as const, mfaEnabled: false, mfaVerified: false, hasWebAuthn: false,
    };
    expect(isMfaRequired(requiredOrgUser)).toBe(true);
  });

  test("executives cannot edit step responses", async () => {
    const { canEditStepResponse } = await import("@/lib/auth/permissions");

    const executive = {
      id: "1", email: "exec@test.com", name: "Exec",
      role: "executive" as unknown as UserRole,
      organizationId: null, organizationMfaPolicy: null, mfaEnabled: true, mfaVerified: true, totpVerified: true, hasWebAuthn: false,
    };
    const result = await canEditStepResponse(executive, "assessment-1", "Finance");
    expect(result.allowed).toBe(false);
  });

  test("executives and IT leads cannot manage stakeholders", async () => {
    const { canManageStakeholders } = await import("@/lib/auth/permissions");

    const executive = {
      id: "1", email: "exec@test.com", name: "Exec",
      role: "executive" as unknown as UserRole,
      organizationId: null, organizationMfaPolicy: null, mfaEnabled: true, mfaVerified: true, totpVerified: true, hasWebAuthn: false,
    };
    expect(canManageStakeholders(executive).allowed).toBe(false);

    const itLead = {
      id: "2", email: "it@test.com", name: "IT",
      role: "it_lead" as const,
      organizationId: null, organizationMfaPolicy: null, mfaEnabled: true, mfaVerified: true, totpVerified: true, hasWebAuthn: false,
    };
    expect(canManageStakeholders(itLead).allowed).toBe(false);
  });
});

// ── Security Headers Presence ─────────────────────────────────────────────
describe("Security Headers Configuration", () => {
  test("next.config.ts imports centralized security headers", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const configPath = path.resolve(__dirname, "../../next.config.ts");
    const content = fs.readFileSync(configPath, "utf-8");

    expect(content).toContain("getSecurityHeaders");
    expect(content).toContain("security-headers");
    expect(content).toContain("headers()");
  });

  test("getSecurityHeaders returns all required static security headers", async () => {
    const { getSecurityHeaders } = await import("@/lib/pwa/security-headers");
    const headers = getSecurityHeaders();
    const allValues = headers.map((h) => `${h.key}: ${h.value}`).join("\n");

    expect(allValues).toContain("X-Content-Type-Options");
    expect(allValues).toContain("nosniff");
    expect(allValues).toContain("X-Frame-Options");
    expect(allValues).toContain("DENY");
    expect(allValues).toContain("Strict-Transport-Security");
    expect(allValues).toContain("Referrer-Policy");
    expect(allValues).toContain("Permissions-Policy");
    // Content-Security-Policy is intentionally NOT in the static header set — it
    // is per-request (nonce-bound) and emitted by middleware via getCspWithNonce.
    expect(allValues).not.toContain("Content-Security-Policy");
  });

  test("getCspWithNonce emits an enforced, nonce-bound script policy", async () => {
    const { getCspWithNonce } = await import("@/lib/pwa/security-headers");
    const csp = getCspWithNonce("abc123");
    expect(csp).toContain("script-src 'nonce-abc123'");
    expect(csp).toContain("'strict-dynamic'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    const scriptSrc = csp.split(";").find((d) => d.trim().startsWith("script-src")) ?? "";
    expect(scriptSrc).not.toContain("'unsafe-inline'");
  });
});
