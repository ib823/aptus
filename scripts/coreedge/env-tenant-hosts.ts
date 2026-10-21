/**
 * Which deployment tenants COREEDGE_ENV_TENANT_HOSTS=enforce would refuse (P0.14b).
 *
 *   pnpm coreedge:env-tenant-hosts [--json]
 *
 * Reads THIS process's environment — run it with the deployment's variables
 * (for Vercel: `vercel env pull .env.production.local` and load that file, or
 * run it in a shell that has them) — and prints, for every tenant configured
 * through `{PREFIX}_BASE_URL` / `{PREFIX}_TENANTS_JSON` and for ARIBA_*,
 * whether each URL a call is sent to (base URL, token endpoint) passes the SAP
 * host allow-list a stored connection must pass when it is saved
 * (src/lib/studio/sap-host-allowlist.ts, plus SAP_HOST_ALLOWLIST_EXTRA).
 *
 * Prints the variable names and hosts only: never a URL path, a credential or
 * any other value. Sends nothing anywhere. Exit code 0 when every tenant
 * passes, 1 when enforce would refuse one (so it can gate a release step), 2
 * when a prefix's configuration cannot be read.
 *
 * Runbook: docs/runbooks/coreedge-console-pipeline.md.
 */

import { auditConfiguredTenantHosts, envTenantHostMode } from "../../src/lib/sap-public/env-tenant-hosts";

const json = process.argv.includes("--json");
const report = auditConfiguredTenantHosts();
const mode = envTenantHostMode();

if (json) {
  console.log(JSON.stringify({ mode, tenants: report }, null, 2));
} else {
  console.log(`COREEDGE_ENV_TENANT_HOSTS is ${mode}.`);
  if (report.length === 0) console.log("No deployment tenant is configured in this environment.");
  for (const row of report) {
    if (row.check === null) {
      console.log(`  ✗ ${row.product}: configuration unreadable — ${row.error ?? "unknown"}`);
      continue;
    }
    if (row.check.allowed) {
      console.log(`  ✓ ${row.product} ${row.tenantKey}: every host is on the allow-list`);
      continue;
    }
    console.log(`  ✗ ${row.product} ${row.tenantKey}: enforce would refuse`);
    for (const f of row.check.findings) console.log(`      ${f.variable} → ${f.host}: ${f.reason}`);
  }
}

const unreadable = report.some((r) => r.check === null);
const refused = report.some((r) => r.check !== null && !r.check.allowed);
process.exit(unreadable ? 2 : refused ? 1 : 0);
