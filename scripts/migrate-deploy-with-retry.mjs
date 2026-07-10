#!/usr/bin/env node
/**
 * Wrap `prisma migrate deploy` with retry logic for Neon free-tier cold
 * starts. The free plan auto-suspends compute after ~5 min of inactivity;
 * the first connection attempt wakes it but Prisma's CLI times out (~5s)
 * before the wake completes (~10-15s). Without this wrapper, every deploy
 * after a quiet period fails with P1001.
 *
 * Strategy:
 *   - run `prisma migrate deploy`
 *   - if it exits with 1 AND stderr contains "P1001" or "Can't reach
 *     database server", wait, then retry up to MAX_ATTEMPTS times with
 *     exponential backoff
 *   - if it exits with 1 AND stderr contains a P3009 (failed migration
 *     left in _prisma_migrations) for a migration on the
 *     KNOWN_AUTO_RECOVERABLE list, run `prisma migrate resolve
 *     --rolled-back <name>` once and retry. This is a one-shot recovery
 *     for migrations whose SQL has been corrected after a prior failure
 *     — checksums differ, so Prisma refuses to proceed until the failed
 *     row is cleared.
 *   - any other failure (real migration error, schema conflict, etc.) —
 *     fail-fast, don't mask
 *
 * Total wait at MAX_ATTEMPTS=5: 0 + 5 + 10 + 20 + 40 = 75 seconds — well
 * within Neon's typical wake window for free-tier compute.
 */

import { spawn } from "node:child_process";

const MAX_ATTEMPTS = 5;
const BASE_DELAY_MS = 5000;
const COLD_START_PATTERNS = [
  "P1001",
  "Can't reach database server",
  "Connection terminated unexpectedly",
];

// One-shot allowlist: migrations whose SQL has been corrected post-failure
// and which are safe to auto-mark as rolled-back. The corrected migration
// MUST be idempotent against either schema state (already-applied or fresh).
// Once main is unstuck, entries here become dead code and can be pruned.
//
// NOTE: this entry is INDEPENDENT of the fresh-DB empty-invariant fix applied
// to the phase13.* migrations. It targets a different failure mode — a P3009
// (failed migration row left in _prisma_migrations) recovery for a corrected
// session-token migration, typically after a Neon cold-start partial apply.
// The empty-DB assert bug never produced a P3009 on the deploy path, so this
// band-aid neither caused nor is resolved by that fix. It is retained
// deliberately (removing it isn't proven safe against the Neon scenario it
// guards); prune only once that recovery path is confirmed dead in prod.
const KNOWN_AUTO_RECOVERABLE = new Set([
  "20260516220000_session_token_hashing",
]);

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function run(cmd, args) {
  return new Promise((resolve) => {
    const proc = spawn(cmd, args, { stdio: ["inherit", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d) => {
      const s = d.toString();
      stdout += s;
      process.stdout.write(s);
    });
    proc.stderr.on("data", (d) => {
      const s = d.toString();
      stderr += s;
      process.stderr.write(s);
    });
    proc.on("close", (code) => {
      resolve({ code: code ?? -1, stdout, stderr });
    });
  });
}

function runMigrateDeploy() {
  return run("prisma", ["migrate", "deploy"]);
}

function isColdStart(stderr) {
  return COLD_START_PATTERNS.some((p) => stderr.includes(p));
}

/**
 * Detect P3009 (failed migration in target DB) for a migration on the
 * KNOWN_AUTO_RECOVERABLE list. Returns the matching migration name or null.
 */
function detectAutoRecoverableP3009(stderr) {
  if (!stderr.includes("P3009")) return null;
  for (const name of KNOWN_AUTO_RECOVERABLE) {
    if (stderr.includes(name)) return name;
  }
  return null;
}

let attempt = 0;
let didAutoResolve = false;
while (attempt < MAX_ATTEMPTS) {
  attempt++;
  if (attempt > 1) {
    const wait = BASE_DELAY_MS * Math.pow(2, attempt - 2);
    console.log(`\n[migrate-deploy-retry] Waiting ${wait / 1000}s before attempt ${attempt}/${MAX_ATTEMPTS}...`);
    await delay(wait);
  }
  const { code, stderr } = await runMigrateDeploy();
  if (code === 0) {
    if (attempt > 1) {
      console.log(`[migrate-deploy-retry] Succeeded on attempt ${attempt}/${MAX_ATTEMPTS}.`);
    }
    process.exit(0);
  }

  // P3009 recovery: one-shot per invocation, allowlist-gated.
  if (!didAutoResolve) {
    const recoverable = detectAutoRecoverableP3009(stderr);
    if (recoverable) {
      console.warn(
        `\n[migrate-deploy-retry] Detected P3009 for ${recoverable} on the auto-recoverable list.`,
      );
      console.warn(
        `[migrate-deploy-retry] Marking it as rolled-back so the corrected (idempotent) migration can re-apply.`,
      );
      const resolveResult = await run("prisma", [
        "migrate",
        "resolve",
        "--rolled-back",
        recoverable,
      ]);
      didAutoResolve = true;
      if (resolveResult.code !== 0) {
        console.error(
          `\n[migrate-deploy-retry] 'prisma migrate resolve --rolled-back ${recoverable}' failed. Aborting.`,
        );
        process.exit(resolveResult.code);
      }
      // Loop continues — next iteration retries `migrate deploy`.
      continue;
    }
  }

  if (!isColdStart(stderr)) {
    console.error(`\n[migrate-deploy-retry] Failure is NOT a cold-start (no P1001 pattern) and not an auto-recoverable P3009. Aborting without retry.`);
    process.exit(code);
  }
  console.log(`\n[migrate-deploy-retry] Cold-start detected (P1001).`);
}

console.error(`\n[migrate-deploy-retry] Exhausted ${MAX_ATTEMPTS} attempts. Last error was a cold-start; the Neon compute may have a deeper issue.`);
process.exit(1);
