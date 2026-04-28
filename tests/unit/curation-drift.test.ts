/**
 * Curation drift CI gate (Phase 0 deliverable per AD-3 + AD-6 + AD-10).
 *
 * Walks every TypeScript-locked source of scope-item IDs in /src and asserts
 * each cited ID exists in the live SAP 2602 catalog (snapshotted at
 * `tests/fixtures/catalog/scope-items.snapshot.json`).
 *
 * Catches:
 *   - Stale IDs introduced when SAP renames or deprecates scope items
 *   - Typos in curated content
 *   - References to IDs that haven't been ingested into the current catalog
 *
 * To refresh the snapshot after a deliberate catalog ingest:
 *   $ pnpm catalog:snapshot
 *
 * Failure mode: this test failing means either (a) you typed the wrong ID,
 * or (b) the catalog snapshot is out-of-date. Verify which case you're in
 * before refreshing the snapshot.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

import { SCOPE_ITEM_METADATA } from "@/constants/scope-item-metadata";
import { PROCESS_LANDSCAPES } from "@/constants/process-chains";
import { PRESETS } from "@/constants/presets";

interface CatalogSnapshot {
  snapshotAt: string;
  versions: Record<string, Array<{ id: string; name: string; country: string }>>;
  totalIds: number;
}

const SNAPSHOT_PATH = join(__dirname, "..", "fixtures", "catalog", "scope-items.snapshot.json");

function loadCatalogIds(): { all: Set<string>; perVersion: Record<string, Set<string>> } {
  const raw = readFileSync(SNAPSHOT_PATH, "utf8");
  const snap = JSON.parse(raw) as CatalogSnapshot;
  const all = new Set<string>();
  const perVersion: Record<string, Set<string>> = {};
  for (const [v, items] of Object.entries(snap.versions)) {
    perVersion[v] = new Set();
    for (const it of items) {
      all.add(it.id);
      perVersion[v]!.add(it.id);
    }
  }
  return { all, perVersion };
}

const { all: CATALOG_IDS, perVersion: CATALOG_BY_VERSION } = loadCatalogIds();

// ── Mirror of the heuristic ID sets in upgrade-triggers.ts ──────────────────
// Inlined here because the Set is private to the module; if these sets get
// promoted to DB tables in Phase 9, this mirror gets removed and the test
// reads directly from the curation tables.
const FINANCIAL_SERVICES_TREASURY_IDS = [
  "1WV", "1X1", "1X3", "1X7", "1X9", "1XB", "1XD", "1XN", "1MN",
  "2NZ", "2O0", "1YI", "16R", "1EG", "4X8", "1S2",
  "2F2", "2OI", "2HU", "2O2", "2RW", "2UF", "2UN", "3WY",
];

// ── Drift baseline ──────────────────────────────────────────────────────────
// Known-stale references from the pre-Phase-0 codebase. These reference IDs
// that existed in older SAP catalogs (likely 2508) but were renamed/deprecated
// in 2602. The drift CI gate accepts these specific entries today and fails
// on any NEW drift. Remove from the baseline as Phase 11 cleanup proceeds —
// the goal is an empty baseline.
const KNOWN_STALE_DEPENDENCY_REFS = new Set<string>([
  "1NT→J63",
]);

const KNOWN_STALE_PROCESS_CHAIN_REFS = new Set<string>([
  "Finance/Record to Report→J63",
  "Finance/Record to Report→J58A",
  "Finance/Treasury & Cash Management→J61",
  "Sourcing and Procurement/Procure to Pay→1FC",
  "Sourcing and Procurement/Travel & Expense→BD2",
  "Sourcing and Procurement/Strategic Sourcing→BNL",
  "Sales/Order to Cash→J56",
  "Sales/Returns & Credits→BEF",
  "Manufacturing/Plan to Produce→J46",
  "Asset Management/Maintain to Operate→BHR",
  "Service/Service Management→BKC",
  "Supply Chain/Supply Chain Planning→1B5",
  "Supply Chain/Supply Chain Planning→2K3",
  "Organization/Enterprise Structure Setup→J01",
]);

const KNOWN_STALE_UI_TEXT_LABELS = new Set<string>([
  "SAP Best Practices 2508",
]);

describe("curation drift — scope-item ID references vs live catalog", () => {
  it("loads a non-empty catalog snapshot", () => {
    expect(CATALOG_IDS.size).toBeGreaterThan(100);
    expect(CATALOG_BY_VERSION["2602"]).toBeDefined();
    expect(CATALOG_BY_VERSION["2602"]!.size).toBeGreaterThan(100);
  });

  describe("scope-item-metadata.ts", () => {
    it("every top-level scopeItemId key exists in catalog", () => {
      const missing: string[] = [];
      for (const id of Object.keys(SCOPE_ITEM_METADATA)) {
        if (!CATALOG_IDS.has(id)) missing.push(id);
      }
      expect(missing, `These scope-item-metadata keys do not exist in the catalog: ${missing.join(", ")}`).toEqual([]);
    });

    it("every dependency.scopeItemId reference exists in catalog (modulo baseline)", () => {
      const newlyMissing: Array<{ owner: string; ref: string }> = [];
      for (const [ownerId, meta] of Object.entries(SCOPE_ITEM_METADATA)) {
        const deps = (meta as { dependencies?: Array<{ scopeItemId: string }> }).dependencies ?? [];
        for (const dep of deps) {
          if (!CATALOG_IDS.has(dep.scopeItemId)) {
            const key = `${ownerId}→${dep.scopeItemId}`;
            if (!KNOWN_STALE_DEPENDENCY_REFS.has(key)) {
              newlyMissing.push({ owner: ownerId, ref: dep.scopeItemId });
            }
          }
        }
      }
      const summary = newlyMissing.map((m) => `${m.owner} → ${m.ref}`).join(", ");
      expect(newlyMissing, `NEW stale dependency references in scope-item-metadata (not in baseline): ${summary}. Either fix the citation or add to KNOWN_STALE_DEPENDENCY_REFS with a tracking comment.`).toEqual([]);
    });
  });

  describe("process-chains.ts", () => {
    it("every chain step's scopeItemId exists in catalog (modulo baseline)", () => {
      const newlyMissing: Array<{ area: string; chain: string; step: string }> = [];
      for (const landscape of PROCESS_LANDSCAPES) {
        for (const chain of landscape.chains) {
          for (const step of chain.steps) {
            if (!CATALOG_IDS.has(step.scopeItemId)) {
              const key = `${landscape.area}/${chain.name}→${step.scopeItemId}`;
              if (!KNOWN_STALE_PROCESS_CHAIN_REFS.has(key)) {
                newlyMissing.push({ area: landscape.area, chain: chain.name, step: step.scopeItemId });
              }
            }
          }
        }
      }
      const summary = newlyMissing.map((m) => `${m.area}/${m.chain} → ${m.step}`).join(", ");
      expect(newlyMissing, `NEW stale references in process-chains (not in baseline): ${summary}. Either fix the citation or add to KNOWN_STALE_PROCESS_CHAIN_REFS with a tracking comment.`).toEqual([]);
    });
  });

  describe("presets.ts", () => {
    it("every preset's scope-item ID exists in catalog", () => {
      const missing: Array<{ preset: string; id: string }> = [];
      for (const [presetKey, preset] of Object.entries(PRESETS)) {
        for (const item of preset.scopeItems) {
          if (!CATALOG_IDS.has(item.id)) {
            missing.push({ preset: presetKey, id: item.id });
          }
        }
      }
      const summary = missing.map((m) => `${m.preset} → ${m.id}`).join(", ");
      expect(missing, `Stale references in presets: ${summary}`).toEqual([]);
    });
  });

  describe("upgrade-triggers.ts heuristic ID sets", () => {
    it("FINANCIAL_SERVICES_TREASURY_IDS — every ID exists in catalog", () => {
      const missing = FINANCIAL_SERVICES_TREASURY_IDS.filter((id) => !CATALOG_IDS.has(id));
      expect(missing, `Stale treasury IDs: ${missing.join(", ")}`).toEqual([]);
    });
  });
});

describe("curation drift — stale version labels", () => {
  it("ui-text.ts does not reference deprecated SAP versions (modulo baseline)", () => {
    const uiTextRaw = readFileSync(join(__dirname, "..", "..", "src", "constants", "ui-text.ts"), "utf8");
    // The sapVersion in APP_CONFIG is the source of truth. Any other version
    // string in ui-text.ts (e.g. a stale "SAP Best Practices 2508" label)
    // is a drift bug.
    const stale = uiTextRaw.match(/SAP Best Practices 25\d\d/g) ?? [];
    const expected = ["SAP Best Practices 2602"];
    const newlyDrifted = stale.filter((s) => !expected.includes(s) && !KNOWN_STALE_UI_TEXT_LABELS.has(s));
    expect(newlyDrifted, `NEW stale SAP version labels in ui-text.ts (not in baseline): ${newlyDrifted.join(", ")}. Update to read from APP_CONFIG.sapVersion or add to KNOWN_STALE_UI_TEXT_LABELS.`).toEqual([]);
  });
});
