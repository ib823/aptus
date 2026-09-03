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
import { getConfiguredSapTenants, getSapProduct } from "../src/lib/sap-public/tdd-connector";
import { getDynamicOdataServices, mergeProbeTargets } from "../src/lib/sap-public/dynamic-catalog";
import { probeTenantCapabilities, summarize } from "../src/lib/sap-public/capability-probe";

async function main(): Promise<void> {
  const prefix = process.env.PROBE_PREFIX ?? "S4_TDD";
  const productKey = process.env.PROBE_PRODUCT ?? "s4hana";
  const tenant = getConfiguredSapTenants(prefix)[0];
  if (!tenant) {
    console.error(`No tenant configured for ${prefix}. Set ${prefix}_BASE_URL + auth.`);
    process.exit(1);
  }

  const limit = Number(process.env.PROBE_LIMIT ?? 60);
  const product = getSapProduct(productKey);
  const curated = product?.services ?? [];
  // The PRODUCT decides the catalogue edition — the same rule the
  // /capabilities route applies. A hardcoded "PUBLIC" here meant
  // PROBE_PRODUCT=cloud-erp-private still probed the Public published set.
  const dynamic = product?.edition
    ? await getDynamicOdataServices({ edition: product.edition, limit })
    : [];
  // Curated (known-configured) services first, then top up from the catalogue.
  const services = mergeProbeTargets(curated, dynamic, limit);
  if (services.length === 0) {
    console.error(
      "No probeable OData services. Drop the api.sap.com export at\n" +
        "  sap-references/api-hub-catalog.json  and run:  pnpm sap:catalog:import",
    );
    process.exit(1);
  }
  if (dynamic.length === 0) {
    console.warn(`(catalogue not imported — probing the ${curated.length} curated services only)\n`);
  }

  console.log(`Probing ${services.length} published OData services against "${tenant.label}"…\n`);
  const rows = await probeTenantCapabilities(prefix, tenant, services);
  const s = summarize(tenant.label, rows);

  console.log(`Exposed by tenant: ${s.exposed}/${s.published}  (not activated: ${s.notActivated})`);
  const breakdown = Object.entries(s.byStatus)
    .sort((a, b) => b[1] - a[1])
    .map(([status, count]) => `${count}×HTTP${status}`)
    .join("  ");
  console.log(`Status breakdown: ${breakdown}\n`);
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
