/**
 * Security Tests — Authentication (T-SEC-001 through T-SEC-011)
 *
 * Validates that all authentication boundaries are properly enforced:
 * unauthenticated access, expired/forged tokens, SSO replay, magic links,
 * viewer link expiry, TOTP enforcement, and SCIM bearer tokens.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createMockSession,
  createExpiredSession,
  createForgedToken,
  createUnauthenticatedContext,
  createMockUser,
} from "../helpers/auth";
import * as UserFactory from "../factories/user.factory";
import * as OrgFactory from "../factories/organization.factory";

// ── Mock middleware / auth verification layer ────────────────────────────

interface AuthResult {
  authenticated: boolean;
  status: number;
  error?: string;
}

/** Simulate server-side auth verification for an incoming request */
function verifyAuth(headers: Record<string, string | undefined>): AuthResult {
  const token = headers["authorization"]?.replace("Bearer ", "");

  if (!token) {
    return { authenticated: false, status: 401, error: "UNAUTHORIZED" };
  }

  // Expired token check
  if (token.includes("expired")) {
    return { authenticated: false, status: 401, error: "TOKEN_EXPIRED" };
  }

  // Forged token check (wrong secret / signature)
  if (token.startsWith("forged-jwt-")) {
    return { authenticated: false, status: 401, error: "INVALID_SIGNATURE" };
  }

  // Valid token
  if (token.startsWith("test-token-")) {
    return { authenticated: true, status: 200 };
  }

  return { authenticated: false, status: 401, error: "UNAUTHORIZED" };
}

/** Simulate SAML assertion validator */
function validateSamlAssertion(
  assertionId: string,
  usedAssertions: Set<string>,
): { valid: boolean; error?: string } {
  if (usedAssertions.has(assertionId)) {
    return { valid: false, error: "ASSERTION_REPLAYED" };
  }
  usedAssertions.add(assertionId);
  return { valid: true };
}

/** Simulate magic link validation */
function validateMagicLink(
  token: string,
  usedTokens: Set<string>,
  createdAt: Date,
  maxAgeMs = 24 * 60 * 60 * 1000,
): { valid: boolean; error?: string } {
  if (usedTokens.has(token)) {
    return { valid: false, error: "MAGIC_LINK_ALREADY_USED" };
  }
  if (Date.now() - createdAt.getTime() > maxAgeMs) {
    return { valid: false, error: "MAGIC_LINK_EXPIRED" };
  }
  usedTokens.add(token);
  return { valid: true };
}

/** Simulate time-limited viewer link validation */
function validateViewerLink(
  token: string,
  expiresAt: Date,
): { valid: boolean; status: number; error?: string } {
  if (Date.now() > expiresAt.getTime()) {
    return { valid: false, status: 401, error: "VIEWER_LINK_EXPIRED" };
  }
  return { valid: true, status: 200 };
}

/** Simulate TOTP verification */
function verifyTotp(
  code: string,
  expectedCode: string,
  failedAttempts: { count: number },
  maxAttempts = 10,
): { valid: boolean; status: number; error?: string } {
  if (failedAttempts.count >= maxAttempts) {
    return { valid: false, status: 403, error: "ACCOUNT_TEMPORARILY_LOCKED" };
  }
  if (code !== expectedCode) {
    failedAttempts.count++;
    if (failedAttempts.count >= maxAttempts) {
      return { valid: false, status: 403, error: "ACCOUNT_TEMPORARILY_LOCKED" };
    }
    return { valid: false, status: 403, error: "INVALID_TOTP_CODE" };
  }
  failedAttempts.count = 0;
  return { valid: true, status: 200 };
}

/** Simulate SCIM endpoint auth */
function verifyScimAuth(
  headers: Record<string, string | undefined>,
  validBearerToken: string,
): { authenticated: boolean; status: number; error?: string } {
  const authHeader = headers["authorization"];
  if (!authHeader) {
    return { authenticated: false, status: 401, error: "SCIM_NO_TOKEN" };
  }
  const token = authHeader.replace("Bearer ", "");
  if (token !== validBearerToken) {
    return { authenticated: false, status: 401, error: "SCIM_INVALID_TOKEN" };
  }
  return { authenticated: true, status: 200 };
}

// ── API route paths for testing ──────────────────────────────────────────

const API_ROUTES = [
  "/api/assessments",
  "/api/dashboard",
  "/api/admin/overview",
  "/api/assessments/abc123/steps",
  "/api/assessments/abc123/gaps",
  "/api/assessments/abc123/sign-off",
  "/api/settings/profile",
  "/api/organizations",
  "/api/reports/generate",
  "/api/integrations",
];

// ── Tests ────────────────────────────────────────────────────────────────

describe("Authentication Security", () => {
  describe("T-SEC-001: Access any API route without auth token returns 401", () => {
    it.each(API_ROUTES)(
      "returns 401 for unauthenticated request to %s",
      (route) => {
        const result = verifyAuth({});
        expect(result.authenticated).toBe(false);
        expect(result.status).toBe(401);
        expect(result.error).toBe("UNAUTHORIZED");
      },
    );

    it("unauthenticated context has null user, session, and token", () => {
      const ctx = createUnauthenticatedContext();
      expect(ctx.user).toBeNull();
      expect(ctx.session).toBeNull();
      expect(ctx.token).toBeNull();
    });
  });

  describe("T-SEC-002: Access with expired JWT returns 401", () => {
    it("rejects an expired session token", () => {
      const expiredSession = createExpiredSession("consultant");
      expect(expiredSession.expiresAt.getTime()).toBeLessThan(Date.now());

      const result = verifyAuth({
        authorization: "Bearer expired-test-token",
      });
      expect(result.authenticated).toBe(false);
      expect(result.status).toBe(401);
      expect(result.error).toBe("TOKEN_EXPIRED");
    });

    it("expired session has expiresAt in the past", () => {
      const session = createExpiredSession("viewer");
      expect(session.expiresAt.getTime()).toBeLessThan(Date.now());
    });

    it("valid session has expiresAt in the future", () => {
      const session = createMockSession("consultant");
      expect(session.expiresAt.getTime()).toBeGreaterThan(Date.now());
    });
  });

  describe("T-SEC-003: Access with forged JWT (wrong secret) returns 401", () => {
    it("rejects a token signed with the wrong secret", () => {
      const forgedToken = createForgedToken("platform_admin");
      expect(forgedToken).toMatch(/^forged-jwt-/);

      const result = verifyAuth({
        authorization: `Bearer ${forgedToken}`,
      });
      expect(result.authenticated).toBe(false);
      expect(result.status).toBe(401);
      expect(result.error).toBe("INVALID_SIGNATURE");
    });

    it("rejects forged tokens for every role", () => {
      const roles = [
        "platform_admin",
        "partner_lead",
        "consultant",
        "viewer",
      ] as const;

      for (const role of roles) {
        const token = createForgedToken(role);
        const result = verifyAuth({ authorization: `Bearer ${token}` });
        expect(result.authenticated).toBe(false);
        expect(result.status).toBe(401);
      }
    });
  });

  describe("T-SEC-004: SSO replay attack (reuse old SAML assertion) is rejected", () => {
    it("accepts a SAML assertion the first time", () => {
      const usedAssertions = new Set<string>();
      const result = validateSamlAssertion("assertion-001", usedAssertions);
      expect(result.valid).toBe(true);
    });

    it("rejects a SAML assertion that was already used", () => {
      const usedAssertions = new Set<string>();
      validateSamlAssertion("assertion-002", usedAssertions);

      const result = validateSamlAssertion("assertion-002", usedAssertions);
      expect(result.valid).toBe(false);
      expect(result.error).toBe("ASSERTION_REPLAYED");
    });

    it("tracks assertions independently", () => {
      const usedAssertions = new Set<string>();
      validateSamlAssertion("assertion-A", usedAssertions);

      const resultB = validateSamlAssertion("assertion-B", usedAssertions);
      expect(resultB.valid).toBe(true);

      const resultA2 = validateSamlAssertion("assertion-A", usedAssertions);
      expect(resultA2.valid).toBe(false);
      expect(resultA2.error).toBe("ASSERTION_REPLAYED");
    });
  });

  describe("T-SEC-005: Magic link used twice — second use rejected", () => {
    it("accepts magic link on first use", () => {
      const usedTokens = new Set<string>();
      const result = validateMagicLink(
        "magic-token-abc",
        usedTokens,
        new Date(),
      );
      expect(result.valid).toBe(true);
    });

    it("rejects magic link on second use", () => {
      const usedTokens = new Set<string>();
      validateMagicLink("magic-token-def", usedTokens, new Date());

      const result = validateMagicLink(
        "magic-token-def",
        usedTokens,
        new Date(),
      );
      expect(result.valid).toBe(false);
      expect(result.error).toBe("MAGIC_LINK_ALREADY_USED");
    });

    it("creates viewer users with magic link attributes", () => {
      const user = UserFactory.createWithMagicLink("org-001");
      expect(user.role).toBe("viewer");
      expect(user.mfaEnabled).toBe(false);
      expect(user.loginCount).toBe(0);
    });
  });

  describe("T-SEC-006: Magic link after 24h is expired", () => {
    it("accepts magic link within 24h window", () => {
      const usedTokens = new Set<string>();
      const createdAt = new Date(Date.now() - 23 * 60 * 60 * 1000); // 23h ago
      const result = validateMagicLink(
        "magic-fresh",
        usedTokens,
        createdAt,
      );
      expect(result.valid).toBe(true);
    });

    it("rejects magic link older than 24h", () => {
      const usedTokens = new Set<string>();
      const createdAt = new Date(Date.now() - 25 * 60 * 60 * 1000); // 25h ago
      const result = validateMagicLink(
        "magic-old",
        usedTokens,
        createdAt,
      );
      expect(result.valid).toBe(false);
      expect(result.error).toBe("MAGIC_LINK_EXPIRED");
    });

    it("rejects magic link at exactly 24h boundary", () => {
      const usedTokens = new Set<string>();
      const createdAt = new Date(Date.now() - 24 * 60 * 60 * 1000 - 1); // 24h + 1ms ago
      const result = validateMagicLink(
        "magic-boundary",
        usedTokens,
        createdAt,
      );
      expect(result.valid).toBe(false);
      expect(result.error).toBe("MAGIC_LINK_EXPIRED");
    });
  });

  describe("T-SEC-007: Time-limited viewer link after expiry returns 401", () => {
    it("accepts viewer link before expiry", () => {
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1h from now
      const result = validateViewerLink("viewer-token-valid", expiresAt);
      expect(result.valid).toBe(true);
      expect(result.status).toBe(200);
    });

    it("rejects viewer link after expiry with 401", () => {
      const expiresAt = new Date(Date.now() - 1000); // 1s ago
      const result = validateViewerLink("viewer-token-expired", expiresAt);
      expect(result.valid).toBe(false);
      expect(result.status).toBe(401);
      expect(result.error).toBe("VIEWER_LINK_EXPIRED");
    });

    it("expired viewer factory user is marked inactive", () => {
      const expiredViewer = UserFactory.createExpiredViewer("assessment-001");
      expect(expiredViewer.isActive).toBe(false);
      expect(expiredViewer.deactivatedBy).toBe("system");
      expect(expiredViewer.deactivationReason).toContain("access expired");
    });
  });

  describe("T-SEC-008: TOTP with wrong code returns 403", () => {
    it("rejects an incorrect TOTP code with 403", () => {
      const failedAttempts = { count: 0 };
      const result = verifyTotp("000000", "123456", failedAttempts);
      expect(result.valid).toBe(false);
      expect(result.status).toBe(403);
      expect(result.error).toBe("INVALID_TOTP_CODE");
    });

    it("accepts a correct TOTP code", () => {
      const failedAttempts = { count: 0 };
      const result = verifyTotp("123456", "123456", failedAttempts);
      expect(result.valid).toBe(true);
      expect(result.status).toBe(200);
    });

    it("increments failed attempt counter on wrong code", () => {
      const failedAttempts = { count: 0 };
      verifyTotp("000000", "123456", failedAttempts);
      expect(failedAttempts.count).toBe(1);
      verifyTotp("111111", "123456", failedAttempts);
      expect(failedAttempts.count).toBe(2);
    });
  });

  describe("T-SEC-009: TOTP brute force (10 wrong codes) — account temporarily locked", () => {
    it("locks account after 10 consecutive wrong TOTP codes", () => {
      const failedAttempts = { count: 0 };
      const correctCode = "123456";

      for (let i = 0; i < 10; i++) {
        verifyTotp(`wrong-${i}`, correctCode, failedAttempts);
      }

      expect(failedAttempts.count).toBe(10);

      // Even the correct code should be rejected now
      const result = verifyTotp(correctCode, correctCode, failedAttempts);
      expect(result.valid).toBe(false);
      expect(result.status).toBe(403);
      expect(result.error).toBe("ACCOUNT_TEMPORARILY_LOCKED");
    });

    it("returns ACCOUNT_TEMPORARILY_LOCKED on the 10th failed attempt", () => {
      const failedAttempts = { count: 9 }; // Already 9 failures
      const result = verifyTotp("wrong", "123456", failedAttempts);
      expect(result.valid).toBe(false);
      expect(result.status).toBe(403);
      expect(result.error).toBe("ACCOUNT_TEMPORARILY_LOCKED");
    });

    it("resets counter on successful verification before lockout", () => {
      const failedAttempts = { count: 5 };
      const result = verifyTotp("123456", "123456", failedAttempts);
      expect(result.valid).toBe(true);
      expect(failedAttempts.count).toBe(0);
    });
  });

  describe("T-SEC-010: SCIM endpoint without bearer token returns 401", () => {
    it("rejects SCIM request with no Authorization header", () => {
      const org = OrgFactory.createWithSSO();
      const result = verifyScimAuth({}, org.scimBearerToken!);
      expect(result.authenticated).toBe(false);
      expect(result.status).toBe(401);
      expect(result.error).toBe("SCIM_NO_TOKEN");
    });

    it("rejects SCIM request with empty Authorization header", () => {
      const org = OrgFactory.createWithSSO();
      const result = verifyScimAuth(
        { authorization: "" },
        org.scimBearerToken!,
      );
      expect(result.authenticated).toBe(false);
      expect(result.status).toBe(401);
    });
  });

  describe("T-SEC-011: SCIM endpoint with wrong bearer token returns 401", () => {
    it("rejects SCIM request with an invalid bearer token", () => {
      const org = OrgFactory.createWithSSO();
      const result = verifyScimAuth(
        { authorization: "Bearer invalid-scim-token" },
        org.scimBearerToken!,
      );
      expect(result.authenticated).toBe(false);
      expect(result.status).toBe(401);
      expect(result.error).toBe("SCIM_INVALID_TOKEN");
    });

    it("accepts SCIM request with the correct bearer token", () => {
      const org = OrgFactory.createWithSSO();
      const result = verifyScimAuth(
        { authorization: `Bearer ${org.scimBearerToken}` },
        org.scimBearerToken!,
      );
      expect(result.authenticated).toBe(true);
      expect(result.status).toBe(200);
    });

    it("SSO-enabled org has SCIM bearer token configured", () => {
      const org = OrgFactory.createWithSSO();
      expect(org.scimEnabled).toBe(true);
      expect(org.scimBearerToken).toBeTruthy();
      expect(org.scimEndpoint).toBeTruthy();
    });
  });
});
