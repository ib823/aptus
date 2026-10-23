/**
 * How many S/4 Public services show the communication scenario that enables
 * them (roadmap P1.2, acceptance A3), measured on THIS database.
 *
 *   pnpm coreedge:scenario-coverage [--json]
 *
 * Prints two figures, the same two tests/unit/sap/comm-scenarios.test.ts
 * computes over the committed files:
 *
 *   - CoreEdge's curated S/4 services that SAP's table lists: how many show
 *     every scenario their definition names (the gating population, Q2).
 *   - The S/4 Public OData V2 catalogue rows: how many show a scenario by the
 *     exact address rule; and the V4 rows, joined only through a known
 *     binding (reported, never gating: a derived V4 address is a guess).
 *
 * The join is the screens' own (scenariosForServices: newest release, one
 * statement). Reads only; prints counts and service ids, never a tenant or a
 * credential. Exit code 0 when both gating figures are 80% or more, 1 when
 * one is below, 2 when the database holds no scenario release.
 *
 * Runbook: docs/runbooks/coreedge-tenant-discovery.md.
 */

import { PrismaClient } from "@prisma/client";

import { namedScenarioIds, scenariosForServices, scenariosOf, technicalIdsForAddress } from "../../src/lib/sap-public/comm-scenarios";
import { catalogueAddress } from "../../src/lib/sap-public/hub-content";
import { getSapProduct, getSapServices } from "../../src/lib/sap-public/tdd-connector";

const GATE = 0.8;

async function main(): Promise<number> {
  const json = process.argv.includes("--json");
  const prisma = new PrismaClient();
  try {
    const curated = getSapServices(getSapProduct("s4hana")!).map((s) => ({
      key: s.key,
      named: namedScenarioIds(s.scenario),
      ids: technicalIdsForAddress({ path: s.path, protocol: s.protocol ?? "ODATAV2" }),
    }));
    const rows = await prisma.sapHubContent.findMany({
      where: { contentType: "API", appliesToPublic: true, apiType: { in: ["ODATAV2", "ODATAV4"] } },
      select: { externalId: true, apiType: true },
    });
    const catalogue = rows.map((r) => {
      const address = catalogueAddress({ contentType: "API", apiType: r.apiType, externalId: r.externalId }, "s4");
      return { externalId: r.externalId, apiType: r.apiType, ids: address && address.basis !== "derived" ? technicalIdsForAddress(address) : [] };
    });
    // A wrapper row has no address and is not a service: not counted.
    const v2 = catalogue.filter((r) => r.apiType === "ODATAV2" && r.ids.length > 0);
    const v4 = catalogue.filter((r) => r.apiType === "ODATAV4");

    const join = await scenariosForServices(prisma, [...curated, ...catalogue].flatMap((s) => s.ids));
    if (join.release === null) {
      console.error("No communication scenario release is loaded in this database (scripts/load-2608-harvest.ts).");
      return 2;
    }
    const known = curated.filter((s) => scenariosOf(join, s.ids).length > 0);
    const showing = known.filter((s) => {
      const shown = new Set(scenariosOf(join, s.ids).map((r) => r.id));
      return s.named.every((id) => shown.has(id));
    });
    const v2Shown = v2.filter((r) => scenariosOf(join, r.ids).length > 0);
    const v4Shown = v4.filter((r) => scenariosOf(join, r.ids).length > 0);
    const ratio = (n: number, d: number) => (d === 0 ? null : n / d);
    const report = {
      release: join.release,
      curated: { showing: showing.length, known: known.length, ratio: ratio(showing.length, known.length), missing: known.filter((s) => !showing.includes(s)).map((s) => s.key) },
      catalogueV2: { showing: v2Shown.length, rows: v2.length, ratio: ratio(v2Shown.length, v2.length) },
      catalogueV4KnownBindings: { showing: v4Shown.length, rows: v4.length },
    };
    const pct = (r: number | null) => (r === null ? "n/a" : `${(100 * r).toFixed(1)}%`);
    if (json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      console.log(`Scenario release ${report.release}.`);
      console.log(`  Curated S/4 services the table lists, showing their scenario: ${showing.length}/${known.length} (${pct(report.curated.ratio)})`);
      if (report.curated.missing.length > 0) console.log(`    not showing: ${report.curated.missing.join(", ")}`);
      console.log(`  S/4 Public OData V2 catalogue rows showing a scenario: ${v2Shown.length}/${v2.length} (${pct(report.catalogueV2.ratio)})`);
      console.log(`  S/4 Public OData V4 catalogue rows (known bindings only, not gating): ${v4Shown.length}/${v4.length}`);
    }
    const below = [report.curated.ratio, report.catalogueV2.ratio].some((r) => r !== null && r < GATE);
    return below ? 1 : 0;
  } finally {
    await prisma.$disconnect();
  }
}

main().then(
  (code) => process.exit(code),
  (err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(2);
  },
);
