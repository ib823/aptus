#!/usr/bin/env node
/**
 * Pre-deployment environment variable validation.
 * Run before deploying to production to catch missing/dangerous config.
 */

const REQUIRED_VARS = [
  "DATABASE_URL",
  "NEXTAUTH_SECRET",
  "NEXTAUTH_URL",
];

// Required in production deployments specifically. Dev can run without these
// (rate limiter degrades to per-process memory, which is fine on a single
// dev server). On Vercel / serverless, the in-memory limiter is reset on
// every invocation, so missing Redis is equivalent to no rate limiting.
const REQUIRED_IN_PRODUCTION = [
  {
    key: "CRON_SECRET",
    reason: "Authenticates Vercel Cron calls to /api/cron/*; only production deployments run crons",
  },
  {
    key: "UPSTASH_REDIS_REST_URL",
    reason: "Distributed rate limiting; in-memory fallback is ineffective on serverless",
  },
  {
    key: "UPSTASH_REDIS_REST_TOKEN",
    reason: "Distributed rate limiting; in-memory fallback is ineffective on serverless",
  },
  {
    key: "PRESALES_CSRF_SECRET",
    reason: "Presales /c POST nonces require a dedicated secret in production (NEXTAUTH_SECRET fallback is dev-only)",
  },
];

const RECOMMENDED_VARS = [
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_USER",
  "SMTP_PASS",
  "EMAIL_FROM",
  "BLOB_READ_WRITE_TOKEN",
  "SENTRY_DSN",
  "NEXT_PUBLIC_SENTRY_DSN",
  // BYOAI encryption + at least one provider key are needed for AI features
  "BYOAI_ENCRYPTION_KEY",
  // WITHOUT THIS, DECLARING A CONNECTION TO SAP IS IMPOSSIBLE — and used to be
  // impossible SILENTLY. `getEncryptionKey()` throws when it is unset, nothing
  // caught the throw, and the consultant saw a raw JSON-parse exception from a
  // zero-byte 500. It is listed here because a deployment without it cannot do
  // the first thing this product exists to do: no connection can be created, so
  // /api/studio/connections stays empty, the northbound path refuses every call
  // with CONNECTION_NOT_CONFIGURED, and three of the six incident rules —
  // including the only critical one — can never fire.
  //
  // RECOMMENDED rather than REQUIRED_IN_PRODUCTION on purpose: a deployment that
  // never declares an SAP connection is a legitimate configuration, and failing
  // its build would be a worse lie than warning it. The point is that the
  // absence is now SAID, at the moment it can still be fixed cheaply.
  "SAP_CONNECTION_ENCRYPTION_KEY",
];

// Backdoors that must NEVER be enabled on a production deploy — no override.
const DANGEROUS_IN_PRODUCTION = [
  { key: "ENABLE_SIMULATION_BRIDGE", reason: "Enables /api/auth/verify-izzat backdoor that issues real sessions" },
  { key: "ALLOW_SIMULATION_BRIDGE_IN_PROD", reason: "Overrides the runtime production kill-switch for the /api/auth/verify-izzat backdoor" },
  { key: "ALLOW_DEV_SEED_IN_PROD", reason: "Enables /api/dev/seed-* backdoors that mint real sessions and mutate data in production" },
];

// The test-login flags power the one-click /dev-login page used for internal
// testing. They are fatal on a production deploy UNLESS the operator
// consciously acknowledges an internal test deployment with
// INTERNAL_TEST_DEPLOYMENT=true. Two deliberate signals are always required
// (the flags AND the acknowledgment), so the backdoor can never ship by
// accident to a customer-facing deploy.
const TEST_LOGIN_FLAGS = [
  { key: "ALLOW_TEST_LOGIN", reason: "Enables test-login endpoint in production" },
  { key: "ENABLE_TEST_LOGIN_ENDPOINT", reason: "Enables the /api/auth/test-login + /dev-login backdoor" },
  { key: "ALLOW_TEST_LOGIN_IN_PROD", reason: "Overrides the production safety gate for test-login" },
  {
    key: "ALLOW_BACKDOOR_WITHOUT_IP_ALLOWLIST",
    reason: "Removes the IP allow-list requirement, leaving the backdoors reachable from any network",
    // The other flags OPEN a backdoor; this one removes its second lock. Without
    // its own message the acknowledgement below would report an exposed
    // /dev-login while staying silent about the IP restriction being off — a
    // warning that is true but not the whole truth.
    warn:
      "ALLOW_BACKDOOR_WITHOUT_IP_ALLOWLIST=true — the backdoors on this deploy accept requests from ANY IP. " +
      "Only E2E_TEST_SECRET stands between the internet and a platform_admin session. " +
      "Set TEST_LOGIN_ALLOWED_IPS (exact IPs, no CIDR) to restrict it, or unset this var if no backdoor is enabled.",
  },
];

let exitCode = 0;

// On Vercel, only the *production* environment enforces the production-
// hardening requirements below — Preview and Development deployments are not
// production and legitimately build without prod-only secrets (cron auth,
// distributed rate limiting, prod CSRF). Off Vercel (e.g. local
// `build:production`) fall back to NODE_ENV.
const isProductionDeploy = process.env.VERCEL_ENV
  ? process.env.VERCEL_ENV === "production"
  : process.env.NODE_ENV === "production";

if (process.env.VERCEL_ENV) {
  console.log(
    `[check-production-env] VERCEL_ENV=${process.env.VERCEL_ENV} -> production-hardening checks ${
      isProductionDeploy ? "enabled" : "skipped (non-production deploy)"
    }`,
  );
}

// Check required vars
for (const key of REQUIRED_VARS) {
  if (!process.env[key]) {
    console.error(`[FAIL] Missing required env var: ${key}`);
    exitCode = 1;
  }
}

// Warn about recommended vars
for (const key of RECOMMENDED_VARS) {
  // P0.10: a deployment that has moved its SAP key into the versioned ring
  // (SAP_CONNECTION_ENCRYPTION_KEYS) no longer needs the legacy variable.
  if (key === "SAP_CONNECTION_ENCRYPTION_KEY" && process.env.SAP_CONNECTION_ENCRYPTION_KEYS) continue;
  if (!process.env[key]) {
    console.warn(`[WARN] Missing recommended env var: ${key}`);
  }
}

/*
 * The SAP master-key ring (P0.10), checked on EVERY deploy type.
 *
 * A ring the application cannot read fails every connection save — and, once
 * envelope sealing is on, every connection open — on the first request after
 * the deploy goes live. Failing the build instead leaves the running
 * deployment serving. Only the new variables are checked, so a deployment that
 * sets none of them is unaffected.
 *
 * MIRRORS src/lib/sap-public/keys/keyring.ts (this script runs under plain
 * node and cannot import TypeScript); tests/unit/scripts/check-production-env
 * pins the same cases.
 */
const sapKeyring = process.env.SAP_CONNECTION_ENCRYPTION_KEYS || "";
const sapActive = (process.env.SAP_CONNECTION_ENCRYPTION_ACTIVE_KEY || "").trim();
const sapLegacy = (process.env.SAP_CONNECTION_ENCRYPTION_KEY || "").trim();
if (sapKeyring.trim() || sapActive) {
  const versions = new Map();
  for (const raw of sapKeyring.split(",")) {
    const entry = raw.trim();
    if (!entry) continue;
    const sep = entry.indexOf(":");
    const version = sep > 0 ? entry.slice(0, sep).trim() : "";
    const hex = sep > 0 ? entry.slice(sep + 1).trim() : "";
    if (!/^v[1-9][0-9]{0,5}$/.test(version) || !/^[0-9a-fA-F]{64}$/.test(hex) || versions.has(version)) {
      console.error(
        `[FAIL] SAP_CONNECTION_ENCRYPTION_KEYS has a malformed or duplicate entry${version ? ` (${version})` : ""}; each entry is "v<N>:<64 hex>".`,
      );
      exitCode = 1;
      continue;
    }
    versions.set(version, hex.toLowerCase());
  }
  if (sapLegacy) {
    if (versions.has("v1") && versions.get("v1") !== sapLegacy.toLowerCase()) {
      console.error(
        "[FAIL] SAP_CONNECTION_ENCRYPTION_KEY and the v1 entry of SAP_CONNECTION_ENCRYPTION_KEYS are different keys; the legacy key IS v1.",
      );
      exitCode = 1;
    }
    versions.set("v1", sapLegacy.toLowerCase());
  }
  const provider = (process.env.SAP_CONNECTION_KEY_PROVIDER || "env").trim() || "env";
  if (sapActive && provider === "env" && !versions.has(sapActive)) {
    console.error(
      "[FAIL] SAP_CONNECTION_ENCRYPTION_ACTIVE_KEY names a version that is not in SAP_CONNECTION_ENCRYPTION_KEYS — every SAP connection save would fail.",
    );
    exitCode = 1;
  }
}

// Flag dangerous vars + enforce prod-only requirements on production deploys.
if (isProductionDeploy) {
  for (const { key, reason } of DANGEROUS_IN_PRODUCTION) {
    if (process.env[key]) {
      console.error(`[FAIL] Dangerous env var set in production: ${key} — ${reason}`);
      exitCode = 1;
    }
  }

  // Test-login backdoor: fatal unless explicitly acknowledged as internal test.
  const internalTest = process.env.INTERNAL_TEST_DEPLOYMENT === "true";
  const enabledTestLoginFlags = TEST_LOGIN_FLAGS.filter(({ key }) => process.env[key]);
  if (enabledTestLoginFlags.length > 0) {
    if (internalTest) {
      for (const { key, warn } of enabledTestLoginFlags) {
        console.warn(
          warn
            ? `[WARN] ${warn} Permitted because INTERNAL_TEST_DEPLOYMENT=true; never set this on a customer-facing deployment.`
            : `[WARN] ${key} is enabled on this production deploy — permitted because INTERNAL_TEST_DEPLOYMENT=true. This deploy exposes the /dev-login backdoor; never set this on a customer-facing deployment.`,
        );
      }
      // A weak secret guarding a prod backdoor is a configuration mistake.
      if (!process.env.E2E_TEST_SECRET || process.env.E2E_TEST_SECRET.length < 24) {
        console.error(
          "[FAIL] Test-login is enabled but E2E_TEST_SECRET is missing or under 24 chars — set a strong secret.",
        );
        exitCode = 1;
      }
    } else {
      for (const { key, reason } of enabledTestLoginFlags) {
        console.error(
          `[FAIL] Dangerous env var set in production: ${key} — ${reason}. If this is a deliberate internal test deployment, set INTERNAL_TEST_DEPLOYMENT=true to acknowledge.`,
        );
        exitCode = 1;
      }
    }
  }

  // Required-in-production vars (block deploy if missing)
  for (const { key, reason } of REQUIRED_IN_PRODUCTION) {
    if (!process.env[key]) {
      console.error(`[FAIL] Missing required production env var: ${key} — ${reason}`);
      exitCode = 1;
    }
  }

  // Ensure secrets aren't placeholder values
  if (process.env.NEXTAUTH_SECRET?.includes("generate-a-random")) {
    console.error("[FAIL] NEXTAUTH_SECRET appears to be a placeholder value");
    exitCode = 1;
  }

  // Presales CSRF must not equal NEXTAUTH_SECRET (defense-in-depth: distinct
  // keys mean compromise of one doesn't compromise the other).
  if (
    process.env.PRESALES_CSRF_SECRET &&
    process.env.NEXTAUTH_SECRET &&
    process.env.PRESALES_CSRF_SECRET === process.env.NEXTAUTH_SECRET
  ) {
    console.error(
      "[FAIL] PRESALES_CSRF_SECRET must not equal NEXTAUTH_SECRET — generate a distinct key",
    );
    exitCode = 1;
  }
  if (
    process.env.PRESALES_CSRF_SECRET &&
    process.env.PRESALES_CSRF_SECRET.length < 32
  ) {
    console.error(
      "[FAIL] PRESALES_CSRF_SECRET must be at least 32 chars in production",
    );
    exitCode = 1;
  }

  // Affirm external executive journey: when the guest surface is enabled in
  // production, its CSRF nonces reuse PRESALES_CSRF_SECRET, so that secret must
  // be present (the dev-only NEXTAUTH_SECRET fallback is not permitted in prod).
  if (
    process.env.AFFIRM_EXTERNAL_ENABLED === "true" &&
    !process.env.PRESALES_CSRF_SECRET
  ) {
    console.error(
      "[FAIL] AFFIRM_EXTERNAL_ENABLED=true requires PRESALES_CSRF_SECRET in production (the /a CSRF nonces reuse it)",
    );
    exitCode = 1;
  }
}

if (exitCode === 0) {
  console.log("[OK] Environment validation passed");
} else {
  console.error("\nEnvironment validation failed. Fix the above issues before deploying.");
}

process.exit(exitCode);
