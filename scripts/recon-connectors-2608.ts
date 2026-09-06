#!/usr/bin/env tsx
/**
 * 2608 WS8 — RECON for the non-S/4 connectors.
 *
 * Answers one question and fails the build on the wrong answer: **is anything
 * this product calls no longer ACTIVE on the SAP Business Accelerator Hub?**
 *
 * WS2 taught the importers to read an artefact's State and WS3 put DEPRECATED
 * in the catalogue UI, but neither joined a connector's endpoint to a Hub
 * artefact. So the Ariba connector called `sourcing_event` v1 and
 * `sourcing_project_management` v1 — both DEPRECATED — for a full release,
 * while a catalogue that knew they were deprecated sat in the same repository.
 * `src/lib/sap-public/wired-apis.ts` is that join; this is the check.
 *
 * SOURCE OF TRUTH. `sap-references/api-hub-catalog.json`, harvested from the
 * Hub (anonymous ContentPackages → Artifacts navigation). No live call: the
 * check must run in CI, and a network dependency would make it flaky in
 * exactly the way that gets checks disabled. Re-harvest to refresh.
 *
 * TWO GRANULARITIES, because the wiring has two. An Ariba REST endpoint is a
 * Hub artefact, so it is checked exactly and a non-ACTIVE state fails. A
 * SuccessFactors OData entity set is not an artefact — the Hub documents
 * several entities per artefact — so those are checked at package level and
 * reported as unmapped rather than silently passed. A package-level entry
 * cannot fail the build on its own; claiming otherwise would mean asserting a
 * mapping nobody has verified.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  WIRED_APIS,
  WIRED_PACKAGES,
  artefactBoundApis,
  packageBoundApis,
  type HubArtefactState,
} from "../src/lib/sap-public/wired-apis";

interface HubArtefact {
  apiId: string;
  apiName?: string;
  packageId?: string;
  version?: string;
  status?: string;
  hubState?: string;
}

interface HubCatalogue {
  _provenance?: { source?: string; harvestedAt?: string };
  apis: HubArtefact[];
}

const CATALOGUE = path.join(process.cwd(), "sap-references", "api-hub-catalog.json");

function stateOf(a: HubArtefact): string {
  return (a.hubState ?? a.status ?? "UNKNOWN").toUpperCase();
}

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + " ".repeat(n - s.length);
}

function main(): number {
  const cat = JSON.parse(readFileSync(CATALOGUE, "utf8")) as HubCatalogue;
  const byId = new Map(cat.apis.map((a) => [a.apiId, a]));
  const failures: string[] = [];
  const notes: string[] = [];

  console.log("RECON connectors 2608 — wired non-S/4 APIs vs the Hub");
  console.log(
    `  catalogue: sap-references/api-hub-catalog.json · ${cat.apis.length.toLocaleString("en-GB")} artefacts` +
      `${cat._provenance?.harvestedAt ? ` · harvested ${cat._provenance.harvestedAt}` : ""}`,
  );
  console.log(`  wired:     ${WIRED_APIS.length} dependencies across ${WIRED_PACKAGES.length} package(s)`);
  console.log("");
  console.log("  exact (the wired thing IS a Hub artefact):");

  for (const w of artefactBoundApis()) {
    const a = byId.get(w.apiId!);
    if (!a) {
      failures.push(`${w.key}: apiId "${w.apiId}" is not in the harvested catalogue`);
      console.log(`    MISS ${pad(w.key, 36)} ${w.apiId}  — not in catalogue`);
      continue;
    }
    const state = stateOf(a);
    const ok = state === ("ACTIVE" satisfies HubArtefactState);
    console.log(
      `    ${ok ? "OK  " : "FAIL"} ${pad(w.key, 36)} ${pad(w.apiId!, 34)} ${pad(state, 15)} v${a.version ?? "?"}`,
    );
    if (!ok) {
      failures.push(
        `${w.key}: ${w.apiId} is ${state}` +
          (w.successorApiId ? ` — successor ${w.successorApiId}` : " — no successor recorded"),
      );
    }
  }

  console.log("");
  console.log("  package-level (an OData entity set, not an artefact — reported, never a build failure):");
  for (const w of packageBoundApis()) {
    const inPkg = cat.apis.filter((a) => a.packageId === w.packageId);
    const deprecated = inPkg.filter((a) => stateOf(a) !== "ACTIVE");
    console.log(
      `    ..   ${pad(w.key, 36)} ${pad(`${w.packageId}/${w.entitySet ?? "?"}`, 50)} ` +
        `${inPkg.length} artefact(s), ${deprecated.length} not ACTIVE`,
    );
    if (deprecated.length) {
      notes.push(
        `${w.packageId}: ${deprecated.length} artefact(s) not ACTIVE ` +
          `(${deprecated.map((d) => `${d.apiId} ${stateOf(d)}`).join(", ")}) — ` +
          `confirm none documents ${w.entitySet ?? "the wired entity set"}`,
      );
    }
  }

  if (notes.length) {
    console.log("");
    console.log("  notes:");
    for (const n of [...new Set(notes)]) console.log(`    · ${n}`);
  }

  console.log("");
  if (failures.length) {
    console.log("  findings:");
    for (const f of failures) console.log(`    ! ${f}`);
    console.log("");
    console.log("  result:    RED — a wired API is not ACTIVE on the Hub");
    console.log("             Migrate the connector, then update src/lib/sap-public/wired-apis.ts.");
    return 1;
  }
  console.log("  result:    GREEN — every exactly-bound wired API is ACTIVE");
  return 0;
}

try {
  process.exitCode = main();
} catch (err) {
  console.error(`recon-connectors-2608: ${(err as Error).message}`);
  process.exitCode = 1;
}
