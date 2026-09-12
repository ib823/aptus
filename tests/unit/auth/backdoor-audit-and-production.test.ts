/**
 * The two intentional auth backdoors (audit E14, P1).
 *
 * `/api/auth/test-login` mints a real `platform_admin` session; `/api/auth/verify-izzat`
 * mints a real session for a seeded user. The audit found three things:
 *
 *   1. They are stripped from the build only on VERCEL production builds, so any
 *      other pipeline shipped both and rested on four env vars staying unset.
 *   2. Neither writes an audit row — `logBackdoorAttempt` was a `console.warn`
 *      beneath a comment calling it "audit-logged".
 *   3. The runtime gate was a single feature flag, while the BUILD gate has
 *      always demanded a second, deliberate signal (INTERNAL_TEST_DEPLOYMENT).
 *      A variable set after the build therefore opened the backdoor without the
 *      acknowledgement — the exact case the strip script's own header warns of.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: { backdoorAttempt: { create: mocks.create } },
}));

import {
  isIpAllowed,
  logBackdoorAttempt,
  productionBackdoorBlock,
  recordBackdoorSuccess,
} from "@/lib/auth/test-backdoor-guards";
import {
  isDisposableCheckout,
  planRemoval,
  TEST_AUTH_DIRS,
} from "../../../scripts/strip-test-auth-for-production.mjs";

const HEADERS = () =>
  new Headers({ "user-agent": "vitest", "x-vercel-forwarded-for": "203.0.113.7" });

beforeEach(() => {
  mocks.create.mockReset();
  mocks.create.mockResolvedValue({});
  // vi.stubEnv, not `process.env = {...}` — NODE_ENV is typed readonly, and the
  // sibling suite (test-backdoor-guards.test.ts) already stubs this way.
  vi.unstubAllEnvs();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("excluded from every production build, not only Vercel's", () => {
  it("still removes both directories, and only those", () => {
    expect(TEST_AUTH_DIRS).toEqual([
      "src/app/api/auth/test-login",
      "src/app/(auth)/dev-login",
    ]);
  });

  it("acts on a Vercel production build", () => {
    expect(planRemoval({ VERCEL: "1", VERCEL_ENV: "production" })).toMatchObject({ act: true });
  });

  it("ALSO acts on a GitHub Actions production build", () => {
    // The gap: "only on Vercel" was never the rule anyone wanted, it was the
    // consequence of Vercel being the only pipeline that existed.
    expect(
      planRemoval({ CI: "true", GITHUB_ACTIONS: "true", NODE_ENV: "production" }),
    ).toMatchObject({ act: true });
  });

  it("ALSO acts on a pipeline that declares itself with STRIP_TEST_AUTH", () => {
    // A plain `docker build` announces nothing; this is its opt-in.
    expect(planRemoval({ STRIP_TEST_AUTH: "1", NODE_ENV: "production" })).toMatchObject({
      act: true,
    });
  });

  it("never touches a contributor's checkout, even on a production build", () => {
    // `next build` sets NODE_ENV=production locally too. Deleting source files
    // from somebody's working tree is a worse failure than the one this prevents.
    expect(planRemoval({ NODE_ENV: "production" })).toMatchObject({
      act: false,
      reason: "not-a-pipeline",
    });
  });

  it("leaves Preview deployments alone — the E2E suite needs them", () => {
    expect(planRemoval({ VERCEL: "1", VERCEL_ENV: "preview" })).toMatchObject({
      act: false,
      reason: "not-production",
    });
  });

  it("recognises the pipelines it claims to", () => {
    for (const env of [
      { VERCEL: "1" },
      { CI: "true" },
      { CI: "1" },
      { GITHUB_ACTIONS: "true" },
      { NETLIFY: "true" },
      { RENDER: "true" },
      { FLY_APP_NAME: "app" },
      { STRIP_TEST_AUTH: "1" },
    ]) {
      expect(isDisposableCheckout(env), JSON.stringify(env)).toBe(true);
    }
    expect(isDisposableCheckout({})).toBe(false);
  });
});

describe("the runtime honours the deploy-time acknowledgement", () => {
  it("is inert outside production", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(productionBackdoorBlock()).toBeNull();
  });

  it("blocks a production runtime that never declared itself an internal test deployment", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("INTERNAL_TEST_DEPLOYMENT", "");
    expect(productionBackdoorBlock()).toContain("INTERNAL_TEST_DEPLOYMENT");
  });

  it("blocks it even when the feature flags say otherwise", () => {
    // The whole point: ALLOW_TEST_LOGIN_IN_PROD is a variable an operator can
    // set in a dashboard after the build. The build-time check has always
    // required a second signal; now so does the runtime.
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ENABLE_TEST_LOGIN_ENDPOINT", "true");
    vi.stubEnv("ALLOW_TEST_LOGIN_IN_PROD", "true");
    vi.stubEnv("ALLOW_SIMULATION_BRIDGE_IN_PROD", "true");
    vi.stubEnv("INTERNAL_TEST_DEPLOYMENT", "");
    expect(productionBackdoorBlock()).not.toBeNull();
  });

  it("permits an acknowledged internal test deployment", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("INTERNAL_TEST_DEPLOYMENT", "true");
    expect(productionBackdoorBlock()).toBeNull();
  });
});

describe("every attempt leaves a durable row", () => {
  it("records a refusal, with the IP and a truncated user agent", async () => {
    await logBackdoorAttempt({
      endpoint: "/api/auth/test-login",
      outcome: "denied:secret",
      headers: HEADERS(),
    });
    expect(mocks.create).toHaveBeenCalledTimes(1);
    const { data } = mocks.create.mock.calls[0]![0] as { data: Record<string, unknown> };
    expect(data).toMatchObject({
      endpoint: "/api/auth/test-login",
      outcome: "denied:secret",
      ipAddress: "203.0.113.7",
      userAgent: "vitest",
    });
  });

  it("caps the user agent, which is attacker-controlled and unbounded", async () => {
    const headers = new Headers({ "user-agent": "x".repeat(5_000) });
    await logBackdoorAttempt({
      endpoint: "/api/auth/test-login",
      outcome: "denied:ip",
      headers,
    });
    const { data } = mocks.create.mock.calls[0]![0] as { data: { userAgent: string } };
    expect(data.userAgent.length).toBeLessThanOrEqual(300);
  });

  it("records the email a caller asked for, even when no such user exists", async () => {
    // The failed attempts are the interesting ones, which is why this column is
    // not a foreign key to User.
    await logBackdoorAttempt({
      endpoint: "/api/auth/test-login",
      outcome: "denied:user",
      headers: HEADERS(),
      email: "nobody@evil.test",
    });
    const { data } = mocks.create.mock.calls[0]![0] as { data: { email: string } };
    expect(data.email).toBe("nobody@evil.test");
  });

  it("a refusal stays a refusal when the database is down", async () => {
    // Best-effort on the denial path: a database failure must not turn a refusal
    // into an error a caller could use to tell "wrong secret" from "db down".
    mocks.create.mockRejectedValue(new Error("db down"));
    await expect(
      logBackdoorAttempt({
        endpoint: "/api/auth/test-login",
        outcome: "denied:secret",
        headers: HEADERS(),
      }),
    ).resolves.toBeUndefined();
  });
});

describe("a success that cannot be recorded does not happen", () => {
  it("reports true when the row was written", async () => {
    const ok = await recordBackdoorSuccess({
      endpoint: "/api/auth/test-login",
      headers: HEADERS(),
      email: "e2e-tester@abeam.test",
      userId: "u_1",
    });
    expect(ok).toBe(true);
    const { data } = mocks.create.mock.calls[0]![0] as { data: Record<string, unknown> };
    expect(data).toMatchObject({ outcome: "success", userId: "u_1" });
  });

  it("reports FALSE when it could not be, so the caller refuses the session", async () => {
    // The one place an audit failure fails the request. Everywhere else the rule
    // is "a gap in the trail beats losing the caller's work" — but here the
    // caller's work IS a platform_admin session obtained without credentials.
    mocks.create.mockRejectedValue(new Error("db down"));
    const ok = await recordBackdoorSuccess({
      endpoint: "/api/auth/test-login",
      headers: HEADERS(),
      email: "e2e-tester@abeam.test",
      userId: "u_1",
    });
    expect(ok).toBe(false);
  });
});

describe("the IP allow-list still fails closed in production", () => {
  it("is open in development when unset", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("TEST_LOGIN_ALLOWED_IPS", "");
    expect(isIpAllowed(HEADERS(), "TEST_LOGIN_ALLOWED_IPS")).toBe(true);
  });

  it("is closed in production when unset", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("TEST_LOGIN_ALLOWED_IPS", "");
    vi.stubEnv("ALLOW_BACKDOOR_WITHOUT_IP_ALLOWLIST", "");
    expect(isIpAllowed(HEADERS(), "TEST_LOGIN_ALLOWED_IPS")).toBe(false);
  });

  it("honours a configured list", () => {
    vi.stubEnv("TEST_LOGIN_ALLOWED_IPS", "203.0.113.7, 198.51.100.1");
    expect(isIpAllowed(HEADERS(), "TEST_LOGIN_ALLOWED_IPS")).toBe(true);
    const other = new Headers({ "x-vercel-forwarded-for": "198.51.100.99" });
    expect(isIpAllowed(other, "TEST_LOGIN_ALLOWED_IPS")).toBe(false);
  });
});
