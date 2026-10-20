// @vitest-environment node
/**
 * The step-up is rate-limited per PERSON, not per office (roadmap P0.12).
 *
 * Under COREEDGE_STEP_UP=enforce every approver steps up every few minutes,
 * and a consultancy's approvers often share one egress address. Keyed by IP,
 * the eleventh colleague to confirm a passkey inside five minutes got a 429
 * and could not revoke anything until the window passed — the incident case
 * where revoking matters most. The caller is signed in, so the limit is theirs.
 *
 * WHAT IS REAL: the routes and the rate limiter (its in-memory store). The
 * session is stood in per request, and no challenge cookie is presented, so a
 * request that clears the limits ends at "Challenge expired or missing"
 * (400) — the limit is all this file is about.
 */

import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

const caller = vi.hoisted(() => ({ id: "" }));

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: () => undefined, delete: () => undefined }),
  headers: async () => new Headers(),
}));

vi.mock("@/lib/auth/session", () => ({
  getSessionToken: async () => `token-${caller.id}`,
  validateSession: async () => ({
    id: caller.id,
    email: `${caller.id}@abeam.test`,
    name: caller.id,
    role: "consultant",
    organizationId: "org",
    organizationMfaPolicy: null,
    mfaEnabled: true,
    mfaVerified: true,
    hasWebAuthn: true,
    passkeyAssertedAt: null,
    authMethod: "session",
  }),
  issueStepUpChallenge: async () => undefined,
  recordStepUpAssertion: async () => null,
  rotateSessionToken: async () => null,
  getSessionCookieOptions: () => ({}),
  SESSION_COOKIE_NAME: "session",
}));

vi.mock("@/lib/auth/webauthn-db", () => ({
  getUserCredentials: async () => [{ credentialId: "cred", transports: [] }],
  getCredentialByCredentialId: async () => null,
  updateCredentialCounter: async () => undefined,
}));

import { POST as stepUpOptions } from "@/app/api/auth/webauthn/step-up/options/route";
import { POST as stepUpVerify } from "@/app/api/auth/webauthn/step-up/verify/route";
import { RATE_LIMITS } from "@/lib/security/rate-limit";

/** A request from one shared office address, unique per test so buckets never mix. */
function fromOffice(ip: string) {
  return () =>
    new Request("http://localhost/x", {
      method: "POST",
      body: JSON.stringify({ response: { id: "cred" } }),
      headers: { "Content-Type": "application/json", "x-real-ip": ip },
    }) as never;
}

const officeIp = () => `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;

describe("step-up rate limits are per person", () => {
  it("verify: colleagues behind one address do not spend each other's attempts", async () => {
    const req = fromOffice(officeIp());
    const run = randomUUID().slice(0, 8);

    const statuses: number[] = [];
    for (let i = 0; i <= RATE_LIMITS.mfa.limit; i += 1) {
      caller.id = `${run}-approver-${i}`;
      statuses.push((await stepUpVerify(req())).status);
    }

    expect(statuses).not.toContain(429);
  });

  it("verify: one person is still limited", async () => {
    const req = fromOffice(officeIp());
    caller.id = `${randomUUID().slice(0, 8)}-approver`;

    const statuses: number[] = [];
    for (let i = 0; i <= RATE_LIMITS.mfa.limit; i += 1) statuses.push((await stepUpVerify(req())).status);

    expect(statuses.slice(0, RATE_LIMITS.mfa.limit)).not.toContain(429);
    expect(statuses.at(-1)).toBe(429);
  });

  it("options: colleagues behind one address do not spend each other's allowance", async () => {
    const req = fromOffice(officeIp());
    const run = randomUUID().slice(0, 8);

    const statuses: number[] = [];
    for (let i = 0; i <= RATE_LIMITS.auth.limit; i += 1) {
      caller.id = `${run}-approver-${i}`;
      statuses.push((await stepUpOptions(req())).status);
    }

    expect(statuses).not.toContain(429);
  });
});
