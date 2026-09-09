#!/usr/bin/env node
/** All production HIGH/CRITICAL advisories block, including transitive/no-fix.
 * There are no accepted exceptions. Any future exception requires a reviewed
 * policy change with reachability evidence, an owner and an expiry date.
 */
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

function auditProduction() {
  try {
    return execSync("pnpm audit --prod --json", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 32 * 1024 * 1024,
    });
  } catch (error) {
    // Audit exit 1 is expected when advisories exist; still inspect its report.
    if (error.status === 1 && typeof error.stdout === "string" && error.stdout.trim()) {
      return error.stdout;
    }
    throw new Error("The dependency audit could not be completed");
  }
}

/** Injectable audit runner lets regressions exercise the gate without a network. */
export function runAuditGate({ audit = auditProduction, log = console.log, error = console.error } = {}) {
  let data;
  try {
    data = JSON.parse(audit());
    if (!data || !data.advisories || typeof data.advisories !== "object" || Array.isArray(data.advisories)) {
      throw new Error("Missing advisories object");
    }
    const counts = data.metadata?.vulnerabilities;
    const levels = ["info", "low", "moderate", "high", "critical"];
    if (!counts || levels.some((level) => !Number.isInteger(counts[level]) || counts[level] < 0)) {
      throw new Error("Missing or invalid vulnerability counts");
    }
    if (Object.values(data.advisories).some((advisory) => !advisory || !levels.includes(advisory.severity))) {
      throw new Error("Unrecognized advisory severity");
    }
  } catch {
    error("Security audit FAILED — unable to obtain a valid audit report. Retry or investigate the audit service; do not bypass the gate.");
    return 1;
  }

  const failures = Object.values(data.advisories).filter((advisory) =>
    ["high", "critical"].includes(advisory.severity),
  );
  // Also fail when the summary reports a finding omitted from the detail list.
  const counts = data.metadata.vulnerabilities;
  if (failures.length || counts.high || counts.critical) {
    error("Security audit FAILED — high/critical advisories require remediation, including transitive dependencies without upstream patches.");
    for (const advisory of failures) {
      error(`  • ${advisory.module_name} [${advisory.severity}] — ${advisory.github_advisory_id || advisory.url || "unidentified advisory"}`);
    }
    return 1;
  }

  log("Security audit OK — 0 high/critical advisories; no exceptions applied.");
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = runAuditGate();
}
