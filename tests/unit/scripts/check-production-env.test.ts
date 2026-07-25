/**
 * The production env gate.
 *
 * This script decides whether a deploy is allowed to proceed, and had no tests
 * at all — so every guarantee in it was load-bearing and unverified. A gate that
 * silently stops failing is worse than no gate, because the green build is read
 * as an all-clear.
 *
 * Run as a subprocess with a controlled environment: it reads process.env at
 * module scope and calls process.exit, so it cannot be imported.
 */

import { spawnSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SCRIPT = path.resolve(process.cwd(), "scripts/check-production-env.js");

/** Env that satisfies every REQUIRED/REQUIRED_IN_PRODUCTION check. */
const BASE_PROD_ENV: Record<string, string> = {
  VERCEL_ENV: "production",
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://u:p@h:5432/d",
  NEXTAUTH_SECRET: "x".repeat(32),
  NEXTAUTH_URL: "https://example.test",
  CRON_SECRET: "y".repeat(32),
  UPSTASH_REDIS_REST_URL: "https://redis.test",
  UPSTASH_REDIS_REST_TOKEN: "z".repeat(32),
  PRESALES_CSRF_SECRET: "c".repeat(32),
};

interface Result {
  code: number;
  out: string;
}

function run(env: Record<string, string | undefined>): Result {
  // spawnSync, not execFileSync: the warnings under test go to stderr via
  // console.warn, and execFileSync's return value is stdout only — so a passing
  // deploy's warnings would be invisible and every "it warns" assertion would
  // fail against an empty string.
  const r = spawnSync("node", [SCRIPT], {
    // Bare env: inheriting the real one would let an ambient var flip a result.
    env: { PATH: process.env.PATH ?? "", ...env } as NodeJS.ProcessEnv,
    encoding: "utf8",
  });
  return { code: r.status ?? 1, out: `${r.stdout ?? ""}${r.stderr ?? ""}` };
}

/* ── the gate still works at all ───────────────────────────────────────────── */

describe("the gate itself", () => {
  it("passes a clean production deploy", () => {
    const r = run(BASE_PROD_ENV);
    expect(r.code, r.out).toBe(0);
  });

  it("fails when a required var is missing", () => {
    const { DATABASE_URL: _drop, ...rest } = BASE_PROD_ENV;
    const r = run(rest);
    expect(r.code).toBe(1);
    expect(r.out).toContain("DATABASE_URL");
  });

  it("does not apply production hardening to a preview deploy", () => {
    // Preview deploys legitimately build without prod-only secrets.
    const r = run({ ...BASE_PROD_ENV, VERCEL_ENV: "preview", CRON_SECRET: undefined });
    expect(r.code, r.out).toBe(0);
  });
});

/* ── ALLOW_BACKDOOR_WITHOUT_IP_ALLOWLIST ───────────────────────────────────── */

describe("ALLOW_BACKDOOR_WITHOUT_IP_ALLOWLIST", () => {
  const withBackdoor = {
    ...BASE_PROD_ENV,
    ENABLE_TEST_LOGIN_ENDPOINT: "true",
    ALLOW_TEST_LOGIN_IN_PROD: "true",
    E2E_TEST_SECRET: "s".repeat(32),
  };

  it("fails a customer-facing production deploy", () => {
    // The whole point: it must never reach a real deployment unacknowledged.
    const r = run({ ...BASE_PROD_ENV, ALLOW_BACKDOOR_WITHOUT_IP_ALLOWLIST: "true" });
    expect(r.code).toBe(1);
    expect(r.out).toContain("ALLOW_BACKDOOR_WITHOUT_IP_ALLOWLIST");
    expect(r.out).toContain("INTERNAL_TEST_DEPLOYMENT=true");
  });

  it("is permitted on an acknowledged internal deploy, but warns", () => {
    const r = run({
      ...withBackdoor,
      INTERNAL_TEST_DEPLOYMENT: "true",
      ALLOW_BACKDOOR_WITHOUT_IP_ALLOWLIST: "true",
    });
    expect(r.code, r.out).toBe(0);
    expect(r.out).toContain("[WARN]");
  });

  it("says the IP restriction is off — not just that a backdoor is exposed", () => {
    // The reason this entry exists. The generic message reports an exposed
    // /dev-login and says nothing about the IP allow-list, which is true but not
    // the whole truth.
    const r = run({
      ...withBackdoor,
      INTERNAL_TEST_DEPLOYMENT: "true",
      ALLOW_BACKDOOR_WITHOUT_IP_ALLOWLIST: "true",
    });
    expect(r.out).toMatch(/ANY IP/);
    expect(r.out).toContain("E2E_TEST_SECRET");
  });

  it("does not warn about IPs when the var is not set", () => {
    const r = run({ ...withBackdoor, INTERNAL_TEST_DEPLOYMENT: "true" });
    expect(r.code, r.out).toBe(0);
    expect(r.out).not.toMatch(/ANY IP/);
  });
});

/* ── the surrounding guarantees this change must not break ─────────────────── */

describe("test-login flags", () => {
  it("still fail a production deploy without the acknowledgement", () => {
    const r = run({ ...BASE_PROD_ENV, ENABLE_TEST_LOGIN_ENDPOINT: "true" });
    expect(r.code).toBe(1);
    expect(r.out).toContain("ENABLE_TEST_LOGIN_ENDPOINT");
  });

  it("still fail when the guarding secret is too short", () => {
    // A weak secret guarding a prod backdoor is a configuration mistake, and the
    // acknowledgement does not excuse it.
    const r = run({
      ...BASE_PROD_ENV,
      INTERNAL_TEST_DEPLOYMENT: "true",
      ENABLE_TEST_LOGIN_ENDPOINT: "true",
      E2E_TEST_SECRET: "short",
    });
    expect(r.code).toBe(1);
    expect(r.out).toContain("E2E_TEST_SECRET");
  });

  it("keeps the always-fatal backdoors always fatal", () => {
    // DANGEROUS_IN_PRODUCTION has no override — INTERNAL_TEST_DEPLOYMENT must
    // not become a skeleton key for the simulation bridge or dev seeds.
    for (const key of [
      "ENABLE_SIMULATION_BRIDGE",
      "ALLOW_SIMULATION_BRIDGE_IN_PROD",
      "ALLOW_DEV_SEED_IN_PROD",
    ]) {
      const r = run({ ...BASE_PROD_ENV, INTERNAL_TEST_DEPLOYMENT: "true", [key]: "true" });
      expect(r.code, `${key} must stay fatal even when acknowledged`).toBe(1);
      expect(r.out).toContain(key);
    }
  });
});
