/**
 * Backfill `SapApiReference.apiType` using heuristic patterns derived from
 * each row's apiId / apiHubUrl.
 *
 * BACKGROUND (forensic note):
 *   The canonical apiType (ODATAV4 / ODATAV2 / REST / SOAP) lives on
 *   api.sap.com's product-scoped listing pages — but those endpoints are
 *   gated by the SAP Public Catalog OAuth2 flow (sappubliccatalog.
 *   authentication.eu10.hana.ondemand.com). Probing with both bare fetch
 *   and headless Playwright in this codespace returned 401 / OAuth redirect.
 *   We have no SAP-Public-Catalog credentials available here, so direct
 *   fetch of the focused S/4HANA Cloud Private Edition OData V4 subset
 *   (424 APIs per chrome-claude's 2026-05 manifest) is not possible from
 *   this environment.
 *
 * Best-effort heuristic (applied here):
 *   - apiId contains "_CDS_"           → ODATAV4 (CDS-based services emit OData v4)
 *   - apiId ends with "_SRV_NNNN"      → ODATAV2 (traditional ABAP services)
 *   - apiId starts with "OP_API_..."   → ODATAV2 (legacy ABAP exposes; mostly v2)
 *   - apiId starts with "OP_..._CDS_"  → ODATAV4 (CDS overlays this convention)
 *   - apiId starts with "IS_"          → ODATAV2 (Industry Solutions, mostly v2)
 *   - apiHubUrl contains "/SOAP/"      → SOAP
 *   - apiHubUrl contains "/REST/"      → REST
 *   - else                              → leave NULL (unclassified)
 *
 * Honest output: the heuristic only catches what its rules cover. Records
 * marked NULL are not false-tagged — they're genuinely unclassified and need
 * either (a) the canonical fetch (when creds are available) or (b) a richer
 * heuristic. Counts are logged for audit.
 *
 * Usage:
 *   $ pnpm tsx scripts/ingest/refresh-api-types.ts
 */

import { prisma } from "../../src/lib/db/prisma";
import { classifyApiTypeById } from "../../src/lib/sap-public/hub-content";

interface HeuristicResult {
  apiType: string | null;
  reason: string;
}

function classifyByHeuristic(apiId: string, apiHubUrl: string): HeuristicResult {
  // Primary: the shared technical-id convention (CE_→V4, *_SRV→V2, _IN/_OUT→SOAP,
  // _CDS_→V4; sap-s4-* stays null — its odata path would be broken; unknown → null).
  const byId = classifyApiTypeById(apiId);
  if (byId) return { apiType: byId, reason: "id-convention" };
  // Supplements for ids the convention can't place — protocol hints in the URL.
  if (apiHubUrl.includes("/SOAP/") || /\b(soap|wsdl)\b/i.test(apiHubUrl)) return { apiType: "SOAP", reason: "soap_in_url" };
  if (apiHubUrl.includes("/REST/")) return { apiType: "REST", reason: "rest_in_url" };
  if (/odata\.svc/i.test(apiHubUrl)) return { apiType: "ODATAV2", reason: "odata_svc_in_url" };
  return { apiType: null, reason: "no_match" };
}

async function main(): Promise<void> {
  const all = await prisma.sapApiReference.findMany({
    select: { id: true, apiId: true, apiHubUrl: true, apiType: true },
  });
  console.log(`[refresh-api-types] Inspecting ${all.length.toLocaleString()} SapApiReference rows`);

  const reasonCounts = new Map<string, number>();
  const typeCounts: Record<string, number> = {};
  const updates: Array<{ id: string; apiType: string | null }> = [];

  let preserved = 0;
  for (const row of all) {
    // NON-CLOBBER: a value the import file already provided (row.apiType set)
    // is authoritative — never overwrite it with a heuristic guess (and never
    // null it out). The heuristic only fills rows still NULL after import.
    if (row.apiType) {
      preserved++;
      continue;
    }
    const result = classifyByHeuristic(row.apiId, row.apiHubUrl);
    reasonCounts.set(result.reason, (reasonCounts.get(result.reason) ?? 0) + 1);
    typeCounts[result.apiType ?? "(null)"] = (typeCounts[result.apiType ?? "(null)"] ?? 0) + 1;
    if (result.apiType !== null) updates.push({ id: row.id, apiType: result.apiType });
  }
  console.log(`[refresh-api-types] Preserved ${preserved.toLocaleString()} rows with a file-provided apiType (not re-classified)`);

  console.log(`[refresh-api-types] Classification result:`);
  for (const [type, count] of Object.entries(typeCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${type.padEnd(15)} ${count.toLocaleString()}`);
  }
  console.log(`[refresh-api-types] Reason breakdown (top 10):`);
  const reasons = Array.from(reasonCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10);
  for (const [reason, count] of reasons) {
    console.log(`  ${reason.padEnd(25)} ${count.toLocaleString()}`);
  }

  console.log(`[refresh-api-types] Will update ${updates.length.toLocaleString()} rows (those whose apiType differs from heuristic)`);

  // Bulk update via raw transactions in chunks
  const chunkSize = 500;
  for (let i = 0; i < updates.length; i += chunkSize) {
    const slice = updates.slice(i, i + chunkSize);
    await prisma.$transaction(
      slice.map((u) =>
        prisma.sapApiReference.update({
          where: { id: u.id },
          data: { apiType: u.apiType },
        }),
      ),
    );
  }
  console.log(`[refresh-api-types] Done.`);

  // Report the focused subset (S/4HANA Cloud PE OData V4 — chrome-claude's #8)
  const focusedSubset = await prisma.sapApiReference.count({
    where: { apiType: "ODATAV4", appliesToPrivate: true },
  });
  const focusedReleased = await prisma.sapApiReference.count({
    where: { apiType: "ODATAV4", appliesToPrivate: true, status: "Released" },
  });
  console.log(``);
  console.log(`[refresh-api-types] FOCUSED SUBSET (#8 from forensic manifest):`);
  console.log(`  appliesToPrivate=true AND apiType='ODATAV4'  : ${focusedSubset.toLocaleString()}`);
  console.log(`    of which status='Released'                  : ${focusedReleased.toLocaleString()}`);
  console.log(``);
  console.log(`[refresh-api-types] HONEST NOTE: This count is heuristic-derived. The`);
  console.log(`canonical 424 from api.sap.com requires SAP Public Catalog OAuth that`);
  console.log(`isn't available in this codespace. The heuristic is conservative —`);
  console.log(`unclassified rows stay NULL rather than guessed.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((err) => {
    console.error("[refresh-api-types] Failed:", err);
    void prisma.$disconnect();
    process.exit(1);
  });
