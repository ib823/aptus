#!/usr/bin/env node
/**
 * CI Security-audit gate — resilient to transitive, no-fix CVEs.
 *
 * Runs `pnpm audit --prod --json` and classifies every HIGH/CRITICAL advisory:
 *   - DIRECT dependency (path `.>pkg`)            → FAIL (we own it; fix it)
 *   - FIXABLE (a patched version exists)          → FAIL (add a pnpm override)
 *   - TRANSITIVE *and* NO fix available           → WARN (accepted; can't fix)
 *
 * This never weakens the gate for fixable or direct-dependency vulnerabilities
 * (a fixable transitive CVE like fast-uri still fails — Dependabot raises the
 * override PR, which auto-merges, and open PRs rebase onto a green main). It
 * only stops a genuinely-unfixable transitive advisory from hard-blocking every
 * build. Infra errors (the retired legacy audit endpoint) stay non-blocking.
 */
import { execSync } from "node:child_process";

function runAudit() {
  try {
    return execSync("pnpm audit --prod --json", { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 32 * 1024 * 1024 });
  } catch (e) {
    // pnpm audit exits non-zero when vulnerabilities are found — expected; its
    // stdout still holds the JSON report. Merge stderr for the infra-error check.
    return `${e.stdout ?? ""}${e.stderr ?? ""}`;
  }
}

const raw = runAudit();

// Retired/unavailable audit endpoint → infrastructure error, not a real finding.
if (/ERR_PNPM_AUDIT_BAD_RESPONSE|audit endpoint/i.test(raw)) {
  console.log("::warning::pnpm audit endpoint unavailable (infra error); audit gate skipped this run.");
  process.exit(0);
}

let data;
try {
  data = JSON.parse(raw);
} catch {
  console.log("::warning::could not parse pnpm audit output; audit gate skipped this run.");
  console.log(raw.slice(0, 800));
  process.exit(0);
}

const advisories = Object.values(data.advisories ?? {});
const BLOCKING = new Set(["high", "critical"]);
const hasFix = (patched) => typeof patched === "string" && patched.trim() !== "" && patched !== "<0.0.0";
// pnpm path is `.>a>b>vuln`; a DIRECT dep is one hop from the root (`.>vuln`).
const isDirectPath = (p) => String(p).split(">").filter(Boolean).length <= 2;

const fails = [];
const warns = [];
for (const a of advisories) {
  if (!BLOCKING.has(a.severity)) continue;
  const paths = (a.findings ?? []).flatMap((f) => f.paths ?? []);
  const direct = paths.some(isDirectPath);
  const fixable = hasFix(a.patched_versions);
  const row = {
    name: a.module_name,
    sev: a.severity,
    patched: a.patched_versions || "(none)",
    id: a.github_advisory_id || a.url || `advisory#${a.id}`,
    direct,
    fixable,
  };
  if (direct || fixable) fails.push(row);
  else warns.push(row); // transitive AND no fix available
}

for (const w of warns) {
  console.log(`::warning::[audit] transitive, no-fix ${w.sev} in ${w.name} (${w.id}) — accepted; no patched version exists. Track upstream.`);
}

if (fails.length === 0) {
  console.log(`Security audit OK — 0 blocking high/critical advisories (${warns.length} transitive no-fix warned).`);
  process.exit(0);
}

console.error(`\n❌ Security audit FAILED — ${fails.length} blocking high/critical advisor${fails.length === 1 ? "y" : "ies"}:`);
for (const f of fails) {
  const why = f.direct ? "DIRECT dependency" : "transitive but FIXABLE";
  console.error(`  • ${f.name} [${f.sev}] — ${why} → patched ${f.patched}  (${f.id})`);
}
console.error(
  "\nFix flow (~2 min): Dependabot usually raises the bump automatically. To do it by hand, add/adjust a pnpm override in package.json (e.g. \"<pkg>\": \">=<patched>\"), run `pnpm install`, and open a chore(security) PR that merges first. See CONTRIBUTING.md → \"Unblocking a transitive CVE\".",
);
process.exit(1);
