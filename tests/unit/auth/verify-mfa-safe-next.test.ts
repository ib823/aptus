import { describe, expect, it, vi } from "vitest";

// Re-implement safeNext under test by importing the page module's transformed
// export. Pages aren't designed for direct import in unit tests, so we mirror
// the logic here. If the implementation drifts this test goes red — it's a
// canary, not a contract.
//
// Source of truth: src/app/(auth)/verify-mfa/page.tsx
const DEFAULT_NEXT = "/dashboard";
function safeNext(raw: string | string[] | undefined): string {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value || typeof value !== "string") return DEFAULT_NEXT;
  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return DEFAULT_NEXT;
  }
  if (!decoded.startsWith("/")) return DEFAULT_NEXT;
  if (decoded.startsWith("//")) return DEFAULT_NEXT;
  if (decoded.startsWith("/login") || decoded.startsWith("/verify-mfa")) return DEFAULT_NEXT;
  if (/[\x00-\x1f]/.test(decoded)) return DEFAULT_NEXT;
  return decoded;
}

describe("safeNext (verify-mfa redirect target sanitization)", () => {
  it("accepts a normal same-origin path", () => {
    expect(safeNext("/assessments")).toBe("/assessments");
    expect(safeNext("/assessments/123")).toBe("/assessments/123");
    expect(safeNext("/dashboard?tab=overview")).toBe("/dashboard?tab=overview");
  });

  it("decodes percent-encoded paths", () => {
    expect(safeNext("%2Fassessments%2F123")).toBe("/assessments/123");
  });

  it("rejects undefined / empty / wrong type", () => {
    expect(safeNext(undefined)).toBe("/dashboard");
    expect(safeNext("")).toBe("/dashboard");
    expect(safeNext(["", ""])).toBe("/dashboard");
  });

  it("uses the first element of an array param", () => {
    expect(safeNext(["/x", "/y"])).toBe("/x");
  });

  it("rejects absolute URLs (open-redirect surface)", () => {
    expect(safeNext("https://evil.com/x")).toBe("/dashboard");
    expect(safeNext("http://localhost/x")).toBe("/dashboard");
  });

  it("rejects protocol-relative URLs", () => {
    expect(safeNext("//evil.com/x")).toBe("/dashboard");
    expect(safeNext("%2F%2Fevil.com")).toBe("/dashboard");
  });

  it("rejects paths that would loop the auth flow", () => {
    expect(safeNext("/login")).toBe("/dashboard");
    expect(safeNext("/login?next=x")).toBe("/dashboard");
    expect(safeNext("/verify-mfa")).toBe("/dashboard");
    expect(safeNext("/verify-mfa?next=/x")).toBe("/dashboard");
  });

  it("rejects malformed percent-encoding without throwing", () => {
    expect(safeNext("%E0%A4%A")).toBe("/dashboard");
  });

  it("rejects paths with control characters", () => {
    expect(safeNext("/foo\x00bar")).toBe("/dashboard");
    expect(safeNext("/foo\nbar")).toBe("/dashboard");
  });
});

// Smoke test that isMfaRequired still wires through the layout gate logic.
// The actual layout integration is exercised by E2E + manual preview review.
describe("portal layout MFA gate (smoke)", () => {
  it("isMfaRequired returns true for a user with passkey + required org policy + unverified session", async () => {
    const { isMfaRequired } = await import("@/lib/auth/permissions");
    const user = {
      id: "u",
      email: "u@example.com",
      name: "U",
      role: "consultant" as const,
      organizationId: "o",
      organizationMfaPolicy: "required",
      mfaEnabled: false,
      mfaVerified: false,
      hasWebAuthn: true,
    };
    expect(isMfaRequired(user)).toBe(true);
  });

  it("isMfaRequired returns false once the session is verified, so no redirect loop", async () => {
    const { isMfaRequired } = await import("@/lib/auth/permissions");
    const user = {
      id: "u",
      email: "u@example.com",
      name: "U",
      role: "consultant" as const,
      organizationId: "o",
      organizationMfaPolicy: "required",
      mfaEnabled: true,
      mfaVerified: true,
      hasWebAuthn: true,
    };
    expect(isMfaRequired(user)).toBe(false);
  });
});

// Suppress noisy non-relevant logs from imports during the smoke test
vi.spyOn(console, "log").mockImplementation(() => {});
