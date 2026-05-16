#!/usr/bin/env node
/**
 * Pre-deployment environment variable validation.
 * Run before deploying to production to catch missing/dangerous config.
 */

const REQUIRED_VARS = [
  "DATABASE_URL",
  "NEXTAUTH_SECRET",
  "NEXTAUTH_URL",
  "CRON_SECRET",
];

// Required in production deployments specifically. Dev can run without these
// (rate limiter degrades to per-process memory, which is fine on a single
// dev server). On Vercel / serverless, the in-memory limiter is reset on
// every invocation, so missing Redis is equivalent to no rate limiting.
const REQUIRED_IN_PRODUCTION = [
  {
    key: "UPSTASH_REDIS_REST_URL",
    reason: "Distributed rate limiting; in-memory fallback is ineffective on serverless",
  },
  {
    key: "UPSTASH_REDIS_REST_TOKEN",
    reason: "Distributed rate limiting; in-memory fallback is ineffective on serverless",
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
];

const DANGEROUS_IN_PRODUCTION = [
  { key: "ALLOW_TEST_LOGIN", reason: "Enables test-login endpoint in production" },
  { key: "ENABLE_TEST_LOGIN_ENDPOINT", reason: "Enables test-login endpoint — must not be set in production" },
  { key: "ALLOW_TEST_LOGIN_IN_PROD", reason: "Overrides production safety gate for test-login" },
  { key: "ENABLE_SIMULATION_BRIDGE", reason: "Enables /api/auth/verify-izzat backdoor that issues real sessions" },
];

let exitCode = 0;

// Check required vars
for (const key of REQUIRED_VARS) {
  if (!process.env[key]) {
    console.error(`[FAIL] Missing required env var: ${key}`);
    exitCode = 1;
  }
}

// Warn about recommended vars
for (const key of RECOMMENDED_VARS) {
  if (!process.env[key]) {
    console.warn(`[WARN] Missing recommended env var: ${key}`);
  }
}

// Flag dangerous vars in production
if (process.env.NODE_ENV === "production") {
  for (const { key, reason } of DANGEROUS_IN_PRODUCTION) {
    if (process.env[key]) {
      console.error(`[FAIL] Dangerous env var set in production: ${key} — ${reason}`);
      exitCode = 1;
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
}

if (exitCode === 0) {
  console.log("[OK] Environment validation passed");
} else {
  console.error("\nEnvironment validation failed. Fix the above issues before deploying.");
}

process.exit(exitCode);
