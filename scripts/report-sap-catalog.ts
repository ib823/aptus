/**
 * Move 1 — SAP API catalogue report.
 *
 * Prints a health summary of the SapApiReference table after an import:
 *   - total rows
 *   - counts by edition (Public / Private / On-Prem)
 *   - counts by apiType (ODATAV2 / ODATAV4 / REST / SOAP / EVENT / untyped)
 *   - how many rows carry communicationScenarios
 *   - untagged (no edition) and deprecated counts
 *
 * Exits non-zero when the table is empty, so it can gate CI / the runbook
 * ("did the import actually populate anything?").
 *
 * Read-only. No network calls.
 *
 *   pnpm sap:catalog:report
 *   pnpm tsx scripts/report-sap-catalog.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function line(label: string, value: number | string, total?: number): string {
  const pct =
    typeof value === "number" && typeof total === "number" && total > 0
      ? `  (${((value / total) * 100).toFixed(1)}%)`
      : "";
  return `  ${String(label).padEnd(26)} ${String(value).padStart(6)}${pct}`;
}

async function main(): Promise<void> {
  const total = await prisma.sapApiReference.count();

  console.log("=== SAP API catalogue report (SapApiReference) ===\n");
  console.log(line("Total rows", total));

  if (total === 0) {
    console.error(
      "\n[report-sap-catalog] Table is EMPTY. Import first:\n" +
        "  drop the api.sap.com export at sap-references/api-hub-catalog.json\n" +
        "  then run  pnpm sap:catalog:import\n",
    );
    await prisma.$disconnect();
    process.exit(1);
  }

  // ── By edition ──────────────────────────────────────────────────────────
  const [pub, priv, onPrem, untagged] = await Promise.all([
    prisma.sapApiReference.count({ where: { appliesToPublic: true } }),
    prisma.sapApiReference.count({ where: { appliesToPrivate: true } }),
    prisma.sapApiReference.count({ where: { appliesToOnPrem: true } }),
    prisma.sapApiReference.count({
      where: { appliesToPublic: false, appliesToPrivate: false, appliesToOnPrem: false },
    }),
  ]);
  console.log("\nBy edition:");
  console.log(line("Public", pub, total));
  console.log(line("Private", priv, total));
  console.log(line("On-Prem", onPrem, total));
  console.log(line("Untagged (no edition)", untagged, total));

  // ── By apiType ──────────────────────────────────────────────────────────
  const byType = await prisma.sapApiReference.groupBy({
    by: ["apiType"],
    _count: { _all: true },
  });
  console.log("\nBy apiType:");
  const sortedTypes = byType
    .map((t) => ({ type: t.apiType ?? "(untyped)", count: t._count._all }))
    .sort((a, b) => b.count - a.count);
  for (const t of sortedTypes) console.log(line(t.type, t.count, total));

  // ── communicationScenarios coverage ─────────────────────────────────────
  // Prisma has no direct "array length > 0" filter, so use NOT isEmpty.
  const withScenarios = await prisma.sapApiReference.count({
    where: { NOT: { communicationScenarios: { isEmpty: true } } },
  });
  const withScopeCodes = await prisma.sapApiReference.count({
    where: { NOT: { scopeItemCodes: { isEmpty: true } } },
  });
  console.log("\nGrounding signals:");
  console.log(line("With comm. scenarios", withScenarios, total));
  console.log(line("With scope-item codes", withScopeCodes, total));

  // ── Lifecycle ───────────────────────────────────────────────────────────
  const byStatus = await prisma.sapApiReference.groupBy({
    by: ["status"],
    _count: { _all: true },
  });
  const deprecated = byStatus
    .filter((s) => s.status.toLowerCase().includes("deprecat"))
    .reduce((n, s) => n + s._count._all, 0);
  console.log("\nBy status:");
  for (const s of byStatus.sort((a, b) => b._count._all - a._count._all)) {
    console.log(line(s.status, s._count._all, total));
  }
  console.log(line("Deprecated (rollup)", deprecated, total));

  console.log("\n[report-sap-catalog] OK — catalogue populated.");
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  void prisma.$disconnect();
  process.exit(1);
});
