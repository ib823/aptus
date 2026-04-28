/**
 * Phase 12 — share-link auth tests + customer portal route presence.
 */

import { describe, it, expect } from "vitest";
import { generateShareLinkToken, ShareLinkInvalid } from "@/lib/auth/share-link";

describe("Phase 12 — generateShareLinkToken", () => {
  it("returns a urlsafe-base64 string of plausible length", () => {
    const t = generateShareLinkToken();
    expect(t.length).toBeGreaterThanOrEqual(40);
    expect(t.length).toBeLessThanOrEqual(50);
    // urlsafe base64: A-Z, a-z, 0-9, -, _
    expect(t).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("returns distinct tokens on each call (cryptographically random)", () => {
    const a = generateShareLinkToken();
    const b = generateShareLinkToken();
    expect(a).not.toBe(b);
  });
});

describe("Phase 12 — ShareLinkInvalid error class", () => {
  it("preserves the reason code", () => {
    const e = new ShareLinkInvalid("EXPIRED");
    expect(e.reason).toBe("EXPIRED");
    expect(e.message).toMatch(/EXPIRED/);
  });
});

describe("Phase 12 — customer portal route + share-link API exist", () => {
  it("/(portal-customer)/assessments/[shareToken]/page exports a default", async () => {
    const mod = await import("@/app/(portal-customer)/assessments/[shareToken]/page");
    expect(typeof mod.default).toBe("function");
  });

  it("/(portal-customer)/layout exports a default", async () => {
    const mod = await import("@/app/(portal-customer)/layout");
    expect(typeof mod.default).toBe("function");
  });

  it("GET/POST /api/assessments/[id]/share-links", async () => {
    const mod = await import("@/app/api/assessments/[id]/share-links/route");
    expect(typeof mod.GET).toBe("function");
    expect(typeof mod.POST).toBe("function");
  });
});
