/**
 * WS13 — load the 2026-09-07 data-acquisition harvest.
 *
 * Five TSVs produced against SAP's own published, anonymous content services:
 * the Fiori Apps Reference Library data service and help.sap.com's page-content
 * service. Each file carries a provenance block of `#` lines above its header.
 *
 * The two hub-harvest JSON files (DATA_PRODUCT, INTEGRATION_ADAPTER) are NOT
 * loaded here — `pnpm sap:hub:import` already reads that directory, and the
 * enum values it needs ship with this workstream's migration.
 *
 * Usage:  pnpm sap:2608:load-harvest [--dry-run]
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { PrismaClient } from "@prisma/client";

import { sapContentSourcesFor } from "./lib/sap-content-sources";
import { ensureContentRelease, integrityGate } from "./lib/sap-2608/db";

const RELEASE = "2608" as const;
const SOURCES = sapContentSourcesFor(RELEASE);
const DIR = "sap-references";
const TX = { maxWait: 30_000, timeout: 180_000 } as const;
const BATCH = 500;

/**
 * Read a harvest TSV. Lines beginning `#` are the provenance block and are
 * returned separately rather than skipped silently — a file that lost its
 * provenance is a file whose completeness nobody can judge.
 */
export function readHarvestTsv(text: string): { provenance: string[]; headers: string[]; rows: Record<string, string>[] } {
  const provenance: string[] = [];
  const data: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith("#")) provenance.push(line);
    else if (line.trim() !== "") data.push(line);
  }
  const first = data.shift();
  if (!first) throw new Error("harvest file has a provenance block and no rows");
  const headers = first.split("\t");
  const rows = data.map((line) => {
    const cells = line.split("\t");
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = (cells[i] ?? "").trim();
    });
    return row;
  });
  return { provenance, headers, rows };
}

/** Split a pipe-delimited harvest cell. Empty stays empty — never a placeholder. */
export function pipes(value: string): string[] {
  const out: string[] = [];
  for (const part of value.split("|")) {
    const v = part.trim();
    if (v && !out.includes(v)) out.push(v);
  }
  return out;
}

function load(rel: string) {
  return readHarvestTsv(readFileSync(path.join(DIR, rel), "utf8"));
}

function chunk<T>(rows: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += BATCH) out.push(rows.slice(i, i + BATCH));
  return out;
}

async function main(): Promise<number> {
  const dryRun = process.argv.includes("--dry-run");
  const gate = integrityGate(SOURCES);
  if (!gate.ok) {
    console.error("load-2608-harvest: refused — manifest integrity findings:");
    for (const f of gate.findings) console.error(`  ! ${f}`);
    return 1;
  }

  const apps = load("fiori-apps/apps-2608.tsv");
  const scenarios = load("comm-scenarios/comm-scenarios.tsv");
  const bridge = load("comm-scenarios/scope-item-comm-scenarios.tsv");
  const names = load("comm-scenarios/comm-scenario-name-sources.tsv");
  const restrictions = load("restrictions/not-supported.tsv");

  const nameSource = new Map(names.rows.map((r) => [r["comm_scenario_id"] ?? "", r["source_url"] ?? ""]));

  console.log(`load-2608-harvest — release ${RELEASE}`);
  console.log(`  fiori apps            ${apps.rows.length} (provenance ${apps.provenance.length} lines)`);
  console.log(`  comm scenarios        ${scenarios.rows.length} · named ${scenarios.rows.filter((r) => r["comm_scenario_name"]).length}`);
  console.log(`  scope <-> scenario    ${bridge.rows.length}`);
  console.log(`  not-supported         ${restrictions.rows.length}`);

  for (const [name, file] of [
    ["fiori apps", apps],
    ["comm scenarios", scenarios],
    ["bridge", bridge],
    ["not-supported", restrictions],
  ] as const) {
    if (file.provenance.length === 0) {
      console.error(`  ! refused: ${name} carries no provenance block`);
      return 1;
    }
    if (file.rows.length === 0) {
      console.error(`  ! refused: ${name} parsed to zero rows — the file moved, not the content`);
      return 1;
    }
  }

  // Every bridge row must be PUBLISHED or DERIVED with non-empty evidence.
  // The brief's rule, enforced before anything is written rather than trusted.
  const badLink = bridge.rows.filter((r) => !["PUBLISHED", "DERIVED"].includes(r["link_source"] ?? ""));
  const noEvidence = bridge.rows.filter((r) => !(r["evidence"] ?? "").trim());
  if (badLink.length || noEvidence.length) {
    console.error(`  ! refused: ${badLink.length} row(s) with an unknown link_source, ${noEvidence.length} with no evidence`);
    return 1;
  }
  const blankScope = bridge.rows.filter((r) => !(r["scope_item_id"] ?? "").trim()).length;
  console.log(`  bridge link_source    PUBLISHED ${bridge.rows.filter((r) => r["link_source"] === "PUBLISHED").length} · DERIVED ${bridge.rows.filter((r) => r["link_source"] === "DERIVED").length}`);
  if (blankScope) console.log(`  ! ${blankScope} bridge row(s) carry a BLANK scope_item_id — kept, flagged, not resolvable`);

  if (dryRun) {
    console.log("  dry-run: no database write");
    return 0;
  }

  const prisma = new PrismaClient();
  try {
    const release = await ensureContentRelease(prisma, SOURCES, gate);
    const rid = release.id;

    const catalog = await prisma.scopeCatalogVersion.findFirst({ where: { edition: "PUBLIC", version: RELEASE } });
    const known = new Set(
      catalog
        ? (await prisma.scopeItem.findMany({ where: { catalogVersionId: catalog.id }, select: { scopeCode: true } })).map(
            (s) => s.scopeCode.toUpperCase(),
          )
        : [],
    );
    if (known.size === 0) {
      console.error(`  ! refused: no scope items in PUBLIC/${RELEASE} — resolvesInCatalogue would be false for every row`);
      return 1;
    }

    await prisma.$transaction(async (tx) => {
      await tx.sapFioriApp.deleteMany({ where: { releaseId: rid } });
      for (const b of chunk(apps.rows)) {
        await tx.sapFioriApp.createMany({
          data: b.map((r) => ({
            appId: r["app_id"] ?? "",
            appName: r["app_name"] ?? "",
            appType: r["app_type"] || null,
            lob: r["lob"] || null,
            businessCatalogIds: pipes(r["business_catalog_ids"] ?? ""),
            businessRoleIds: pipes(r["business_role_ids"] ?? ""),
            odataServices: pipes(r["odata_services"] ?? ""),
            scopeItemCodes: pipes(r["required_scope_item_ids"] ?? ""),
            productVersion: r["product_version"] || null,
            availability: r["availability"] || null,
            deviceTypes: pipes(r["device_types"] ?? ""),
            appHubUrl: r["app_hub_url"] || null,
            releaseId: rid,
          })),
          skipDuplicates: true,
        });
      }

      await tx.sapCommScenario.deleteMany({ where: { releaseId: rid } });
      for (const b of chunk(scenarios.rows)) {
        await tx.sapCommScenario.createMany({
          data: b.map((r) => ({
            commScenarioId: r["comm_scenario_id"] ?? "",
            name: r["comm_scenario_name"] || null,
            direction: r["direction"] || null,
            authMethods: pipes(r["auth_methods"] ?? ""),
            inboundServices: pipes(r["inbound_services"] ?? ""),
            outboundServices: pipes(r["outbound_services"] ?? ""),
            apiIds: pipes(r["api_ids"] ?? ""),
            nameSourceUrl: nameSource.get(r["comm_scenario_id"] ?? "") || null,
            releaseId: rid,
          })),
          skipDuplicates: true,
        });
      }

      await tx.scopeItemCommScenario.deleteMany({ where: { releaseId: rid } });
      for (const b of chunk(bridge.rows)) {
        await tx.scopeItemCommScenario.createMany({
          data: b.map((r) => {
            const code = (r["scope_item_id"] ?? "").trim();
            return {
              scopeItemCode: code,
              commScenarioId: r["comm_scenario_id"] ?? "",
              mandatory: r["mandatory"] || null,
              sourceUrl: r["source_url"] ?? "",
              linkSource: r["link_source"] ?? "",
              evidence: r["evidence"] ?? "",
              resolvesInCatalogue: code !== "" && known.has(code.toUpperCase()),
              releaseId: rid,
            };
          }),
          skipDuplicates: true,
        });
      }

      await tx.sapNotSupported.deleteMany({ where: { releaseId: rid } });
      // Number the rows before chunking: sourceRow is the unique key, so it has
      // to be the row's position in the FILE, not in its batch.
      const numbered = restrictions.rows.map((r, n) => ({ row: r, sourceRow: n + 1 }));
      for (const b of chunk(numbered)) {
        await tx.sapNotSupported.createMany({
          data: b.map(({ row: r, sourceRow }) => ({
            capability: r["capability"] ?? "",
            scopeItemCodes: pipes(r["scope_item_ids"] ?? ""),
            country: r["country"] || null,
            whatIsNotSupported: r["what_is_not_supported"] ?? "",
            statementVerbatim: r["sap_statement_verbatim"] ?? "",
            sourceType: r["source_type"] ?? "",
            sourceId: r["source_id"] ?? "",
            sourceUrl: r["source_url"] ?? "",
            releasedOn: r["released_on"] || null,
            futureSupportStated: r["future_support_stated"] || null,
            sourceRow,
            releaseId: rid,
          })),
          skipDuplicates: true,
        });
      }
    }, TX);

    const [dbApps, dbScen, dbBridge, dbResolved, dbNs] = await Promise.all([
      prisma.sapFioriApp.count({ where: { releaseId: rid } }),
      prisma.sapCommScenario.count({ where: { releaseId: rid } }),
      prisma.scopeItemCommScenario.count({ where: { releaseId: rid } }),
      prisma.scopeItemCommScenario.count({ where: { releaseId: rid, resolvesInCatalogue: true } }),
      prisma.sapNotSupported.count({ where: { releaseId: rid } }),
    ]);
    console.log(`  db: apps ${dbApps} · scenarios ${dbScen} · bridge ${dbBridge} (${dbResolved} resolve, ${dbBridge - dbResolved} do not) · not-supported ${dbNs}`);

    /* A row lost to skipDuplicates is a finding, not a tidy-up: the source
     * carries two rows the unique key cannot tell apart. Loud, like WS11. */
    let ok = true;
    for (const [name, parsed, stored] of [
      ["fioriApps", apps.rows.length, dbApps],
      ["commScenarios", scenarios.rows.length, dbScen],
      ["bridge", bridge.rows.length, dbBridge],
      ["notSupported", restrictions.rows.length, dbNs],
    ] as const) {
      if (parsed !== stored) {
        ok = false;
        console.error(`  ! ${name}: parsed ${parsed}, stored ${stored} — ${parsed - stored} row(s) collided on the unique key`);
      }
    }
    return ok ? 0 : 1;
  } finally {
    await prisma.$disconnect();
  }
}

const executedDirectly =
  process.argv[1] !== undefined && path.resolve(process.argv[1]).endsWith("load-2608-harvest.ts");
if (executedDirectly) {
  main().then(
    (code) => {
      process.exitCode = code;
    },
    (err) => {
      console.error(err);
      process.exitCode = 1;
    },
  );
}
