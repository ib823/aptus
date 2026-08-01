/**
 * The two process taxonomies are a SUPERSET, not a drifted copy.
 *
 * An audit read Affirm's 672 scope items against Discovery's 742 processes,
 * saw per-stream counts disagree (26 vs 24, 141 vs 140, 11 vs 21, 7 vs 24…),
 * and concluded there were two copies of one master that had drifted apart —
 * recommending consolidation.
 *
 * Reconciled on `scope_id`, the picture is different and much better:
 *
 *   654  in both            — origin "sap-base", the shared SAP core
 *    88  Discovery only     — origin "overlay", ABeam-authored (AB018…)
 *    18  Affirm only        — exactly Discovery's `parked` list
 *
 * 654 + 88 = 742. 654 + 18 = 672. The counts are SUPPOSED to differ, and the
 * data already carries the distinction in a field called `origin`. Those 88
 * overlay processes are what make the Discovery library more than a reskinned
 * SAP catalogue; consolidating would delete the differentiator to fix a
 * cosmetic inconsistency.
 *
 * So this test does not demand the numbers match. It pins the RELATIONSHIP, so
 * that if the two ever do drift for a real reason, the failure says which of
 * the three buckets moved instead of leaving someone to rediscover the join.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

interface DiscoveryProcess {
  scope_id: string;
  name: string;
  tier: string;
  origin: string;
  industry: string | null;
}

interface DiscoveryStream {
  id: string;
  name: string;
  process_count: number;
  workflows?: Array<{ processes?: DiscoveryProcess[] }>;
}

function read<T>(rel: string): T {
  return JSON.parse(readFileSync(path.resolve(process.cwd(), rel), "utf8")) as T;
}

const discovery = read<{
  meta: { total_processes: number };
  value_streams: DiscoveryStream[];
  parked: Array<{ scope_id?: string; id?: string }>;
}>("src/data/discovery/discovery-library.consultant.json");

const affirm = read<{ scopeItems: Array<{ id: string }> }>(
  "prisma/seeds/value-stream/dataset.json",
);

const discoveryProcesses: DiscoveryProcess[] = discovery.value_streams.flatMap(
  (s) => (s.workflows ?? []).flatMap((w) => w.processes ?? []),
);

const discoveryIds = new Set(discoveryProcesses.map((p) => p.scope_id));
const affirmIds = new Set(affirm.scopeItems.map((s) => s.id));

const inBoth = [...discoveryIds].filter((id) => affirmIds.has(id));
const discoveryOnly = discoveryProcesses.filter((p) => !affirmIds.has(p.scope_id));
const affirmOnly = [...affirmIds].filter((id) => !discoveryIds.has(id));

describe("the join key holds", () => {
  it("every Discovery process carries a scope_id", () => {
    expect(discoveryProcesses.filter((p) => !p.scope_id)).toEqual([]);
  });

  it("the walked process list matches the library's own total", () => {
    expect(discoveryProcesses.length).toBe(discovery.meta.total_processes);
  });

  it("declared per-stream counts match the processes actually present", () => {
    const mismatches = discovery.value_streams
      .map((s) => ({
        id: s.id,
        declared: s.process_count,
        actual: (s.workflows ?? []).flatMap((w) => w.processes ?? []).length,
      }))
      .filter((r) => r.declared !== r.actual);
    expect(mismatches).toEqual([]);
  });
});

describe("the three buckets reconcile", () => {
  it("Discovery = shared core + ABeam overlay", () => {
    expect(inBoth.length + discoveryOnly.length).toBe(discoveryProcesses.length);
  });

  it("Affirm = shared core + the items Discovery parks", () => {
    expect(inBoth.length + affirmOnly.length).toBe(affirmIds.size);
  });

  it("everything Discovery adds is ABeam-authored, not drifted SAP content", () => {
    // This is the claim that makes consolidation the wrong call. If an item
    // ever lands here with origin "sap-base", the two really HAVE diverged on
    // shared content and that is worth a human look.
    const notOverlay = discoveryOnly.filter((p) => p.origin !== "overlay");
    expect(
      notOverlay.map((p) => `${p.scope_id} (${p.origin})`),
      "Discovery-only items must be overlay content",
    ).toEqual([]);
  });

  it("everything Affirm has and Discovery lacks is parked, not lost", () => {
    const parkedIds = new Set(
      discovery.parked.map((p) => p.scope_id ?? p.id).filter(Boolean) as string[],
    );
    const unexplained = affirmOnly.filter((id) => !parkedIds.has(id));
    expect(
      unexplained,
      "Affirm-only scope items must appear in Discovery's parked list",
    ).toEqual([]);
  });
});

describe("the overlay is a real asset, and stays one", () => {
  it("carries enough content to be worth claiming", () => {
    // Stated as a floor rather than an exact number so adding overlay
    // processes is not a test failure — losing them is.
    expect(discoveryOnly.length).toBeGreaterThanOrEqual(80);
  });

  it("every stream Affirm has no equivalent for is overlay-heavy", () => {
    // Serve-to-Retain and Strategize-to-Govern exist only in Discovery. If one
    // ever fills with sap-base content, the libraries are converging in a way
    // the mapping table would need to describe.
    const affirmless = discovery.value_streams.filter((s) =>
      (s.workflows ?? [])
        .flatMap((w) => w.processes ?? [])
        .every((p) => !affirmIds.has(p.scope_id)),
    );
    for (const s of affirmless) {
      const procs = (s.workflows ?? []).flatMap((w) => w.processes ?? []);
      expect(procs.every((p) => p.origin === "overlay"), `${s.name}`).toBe(true);
    }
  });
});
