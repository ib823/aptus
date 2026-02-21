/** Unit tests for security-headers.ts (Phase 27) */

import { describe, it, expect } from "vitest";
import { getSecurityHeaders, getCspDirectives } from "@/lib/pwa/security-headers";

describe("getSecurityHeaders", () => {
  const headers = getSecurityHeaders();

  it("returns an array of header objects", () => {
    expect(Array.isArray(headers)).toBe(true);
    expect(headers.length).toBeGreaterThan(0);
  });

  it("includes Content-Security-Policy", () => {
    const csp = headers.find((h) => h.key === "Content-Security-Policy");
    expect(csp).toBeDefined();
    expect(csp!.value.length).toBeGreaterThan(0);
  });

  it("includes X-Frame-Options set to DENY", () => {
    const xfo = headers.find((h) => h.key === "X-Frame-Options");
    expect(xfo).toBeDefined();
    expect(xfo!.value).toBe("DENY");
  });

  it("includes Strict-Transport-Security with correct max-age", () => {
    const hsts = headers.find((h) => h.key === "Strict-Transport-Security");
    expect(hsts).toBeDefined();
    expect(hsts!.value).toContain("max-age=63072000");
    expect(hsts!.value).toContain("includeSubDomains");
    expect(hsts!.value).toContain("preload");
  });

  it("includes X-Content-Type-Options set to nosniff", () => {
    const xcto = headers.find((h) => h.key === "X-Content-Type-Options");
    expect(xcto).toBeDefined();
    expect(xcto!.value).toBe("nosniff");
  });

  it("includes Referrer-Policy", () => {
    const rp = headers.find((h) => h.key === "Referrer-Policy");
    expect(rp).toBeDefined();
    expect(rp!.value).toBe("strict-origin-when-cross-origin");
  });

  it("includes Permissions-Policy", () => {
    const pp = headers.find((h) => h.key === "Permissions-Policy");
    expect(pp).toBeDefined();
    expect(pp!.value).toContain("camera=()");
    expect(pp!.value).toContain("microphone=()");
  });

  it("includes X-XSS-Protection", () => {
    const xss = headers.find((h) => h.key === "X-XSS-Protection");
    expect(xss).toBeDefined();
    expect(xss!.value).toBe("1; mode=block");
  });

  it("each header has both key and value as strings", () => {
    for (const header of headers) {
      expect(typeof header.key).toBe("string");
      expect(typeof header.value).toBe("string");
    }
  });
});

describe("getCspDirectives", () => {
  const csp = getCspDirectives();

  it("includes default-src 'self'", () => {
    expect(csp).toContain("default-src 'self'");
  });

  it("includes script-src", () => {
    expect(csp).toContain("script-src");
  });

  it("includes frame-ancestors 'none'", () => {
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it("includes object-src 'none'", () => {
    expect(csp).toContain("object-src 'none'");
  });
});
