/**
 * SAP Capability Catalogue — SapHubContent report + drift check.
 *
 * Prints, per contentType:
 *   - rows        : SapHubContent rows of that type
 *   - items       : effective item count (Σ itemCount for grouped rows like
 *                   CDS/BAdI/BO, else the row count) — the honest "how many
 *                   underlying items" figure
 *   - published   : the S/4 Public Hub reference figure (drift target)
 *   - kind        : runtime | reference
 *
 * Exits non-zero when the table is empty. Read-only, no network.
 *
 *   pnpm sap:hub:report
 */
import { PrismaClient } from "@prisma/client";
import {
  HUB_CONTENT_TYPES,
  HUB_CONTENT_TYPE_META,
  S4_PUBLIC_PUBLISHED_COUNTS,
  type HubContentType,
} from "../src/lib/sap-public/hub-content";

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const total = await prisma.sapHubContent.count();
  console.log("=== SAP Capability Catalogue (SapHubContent) ===\n");

  if (total === 0) {
    console.error(
      "[report-sap-hub-content] Table is EMPTY. Populate it via the supported path:\n" +
        "  drop logged-in per-type exports at sap-references/hub-content-<type>.json\n" +
        "  then run  pnpm sap:hub:import\n" +
        "(Path C OAuth bulk ingest is speculative/unverified — see the runbook.)\n" +
        "See docs/runbooks/sap-hub-content-ingest.md.",
    );
    await prisma.$disconnect();
    process.exit(1);
  }

  const rowsByType = await prisma.sapHubContent.groupBy({
    by: ["contentType"],
    _count: { _all: true },
    _sum: { itemCount: true },
  });
  const byType = new Map(rowsByType.map((r) => [r.contentType as HubContentType, r]));

  const head = `  ${"contentType".padEnd(18)} ${"rows".padStart(6)} ${"items".padStart(9)} ${"published".padStart(10)}  kind`;
  console.log(head);
  console.log("  " + "-".repeat(head.length - 2));

  let itemsGrand = 0;
  let publishedGrand = 0;
  let stubTypes = 0; // types materially below their published figure (< 25%)
  let expectedTypes = 0;
  for (const t of HUB_CONTENT_TYPES) {
    const row = byType.get(t);
    const rows = row?._count._all ?? 0;
    // Effective items = summed itemCount when present (grouped rows), else rows.
    const summed = row?._sum.itemCount ?? 0;
    const items = summed > 0 ? summed : rows;
    const published = S4_PUBLIC_PUBLISHED_COUNTS[t];
    itemsGrand += items;
    publishedGrand += published;
    if (published > 0) {
      expectedTypes++;
      if (items < published * 0.25) stubTypes++;
    }
    const kind = HUB_CONTENT_TYPE_META[t].kind;
    const flag = published > 0 && items < published * 0.25 ? "  ⚠ stub" : "";
    console.log(
      `  ${t.padEnd(18)} ${String(rows).padStart(6)} ${String(items).padStart(9)} ${String(published).padStart(10)}  ${kind}${flag}`,
    );
  }
  console.log("  " + "-".repeat(head.length - 2));
  console.log(
    `  ${"TOTAL".padEnd(18)} ${String(total).padStart(6)} ${String(itemsGrand).padStart(9)} ${String(publishedGrand).padStart(10)}`,
  );

  const coverage = publishedGrand > 0 ? ((itemsGrand / publishedGrand) * 100).toFixed(1) : "0.0";
  console.log(`\n  Effective items vs published S/4 Public: ${itemsGrand} / ${publishedGrand}  (${coverage}%)`);
  console.log(`  Types materially below published (< 25%): ${stubTypes} / ${expectedTypes}`);
  // Honest seed-vs-ingest signal: the seed is stubby on the per-item types even
  // though a couple of grouped rows (BAdI/BO) happen to match published totals.
  if (stubTypes >= Math.ceil(expectedTypes / 2)) {
    console.warn(
      "\n[report-sap-hub-content] NOTE: most content types are far below the published\n" +
        "catalogue — this is the illustrative seed, not a full ingest. Run Path C\n" +
        "(BTP OAuth) or import real per-type exports. See docs/runbooks/sap-hub-content-ingest.md.",
    );
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  void prisma.$disconnect();
  process.exit(1);
});
