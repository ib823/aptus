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

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function runMigrateDeploy() {
  return new Promise((resolve) => {
    const proc = spawn("prisma", ["migrate", "deploy"], { stdio: ["inherit", "pipe", "pipe"] });
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

function isColdStart(stderr) {
  return COLD_START_PATTERNS.some((p) => stderr.includes(p));
}

let attempt = 0;
while (attempt < MAX_ATTEMPTS) {
  attempt++;
  if (attempt > 1) {
    const wait = BASE_DELAY_MS * Math.pow(2, attempt - 2);
    console.log(`\n[migrate-deploy-retry] Cold-start detected. Waiting ${wait / 1000}s before attempt ${attempt}/${MAX_ATTEMPTS}...`);
    await delay(wait);
  }
  const { code, stderr } = await runMigrateDeploy();
  if (code === 0) {
    if (attempt > 1) {
      console.log(`[migrate-deploy-retry] Succeeded on attempt ${attempt}/${MAX_ATTEMPTS}.`);
    }
    process.exit(0);
  }
  if (!isColdStart(stderr)) {
    console.error(`\n[migrate-deploy-retry] Failure is NOT a cold-start (no P1001 pattern). Aborting without retry.`);
    process.exit(code);
  }
}

console.error(`\n[migrate-deploy-retry] Exhausted ${MAX_ATTEMPTS} attempts. Last error was a cold-start; the Neon compute may have a deeper issue.`);
process.exit(1);
