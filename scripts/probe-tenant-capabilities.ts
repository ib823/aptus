/**
 * Move 2 — CLI: probe which published OData services the ABeam TDD tenant exposes.
 *
 *   pnpm tsx scripts/probe-tenant-capabilities.ts
 *
 * Uses the S4_TDD_* connection (your live ABeam TDD system) by default.
 * Requires SapApiReference to be populated first (import the seed/export).
 * Read-only: only calls $metadata, pulls no business data.
 *
 * Env overrides: PROBE_PREFIX (default S4_TDD), PROBE_LIMIT (default 60).
 */
import "dotenv/config";
import { getConfiguredSapTenants } from "../src/lib/sap-public/tdd-connector";
import { getDynamicOdataServices } from "../src/lib/sap-public/dynamic-catalog";
import { probeTenantCapabilities, summarize } from "../src/lib/sap-public/capability-probe";

async function main(): Promise<void> {
  const prefix = process.env.PROBE_PREFIX ?? "S4_TDD";
  const tenant = getConfiguredSapTenants(prefix)[0];
  if (!tenant) {
    console.error(`No tenant configured for ${prefix}. Set ${prefix}_BASE_URL + auth.`);
    process.exit(1);
  }

  const services = await getDynamicOdataServices({
    edition: "PUBLIC",
    limit: Number(process.env.PROBE_LIMIT ?? 60),
  });
  if (services.length === 0) {
    console.error(
      "SapApiReference is empty. Drop s4-public-api-seed.json in sap-references/ and run:\n" +
        "  pnpm tsx scripts/import-sap-api-catalog.ts",
    );
    process.exit(1);
  }

  console.log(`Probing ${services.length} published OData services against "${tenant.label}"…\n`);
  const rows = await probeTenantCapabilities(prefix, tenant, services);
  const s = summarize(tenant.label, rows);

  console.log(`Exposed by tenant: ${s.exposed}/${s.published}  (not activated: ${s.notActivated})\n`);
  for (const r of rows.sort((a, b) => Number(b.exposed) - Number(a.exposed) || a.service.localeCompare(b.service))) {
    const mark = r.exposed ? "✓" : "·";
    const detail = r.exposed ? `${r.entitySetCount} entity sets` : `HTTP ${r.status || "err"}`;
    console.log(`${mark} ${r.service.padEnd(44)} ${detail.padEnd(16)} ${r.scenario}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
