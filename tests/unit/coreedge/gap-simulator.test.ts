// @vitest-environment node
/**
 * The gap simulator and the roadmap's figures (P0.15).
 *
 * - The simulator counts scenarios the way roadmap Appendix B describes,
 *   checked against a slow reference that walks every scenario one at a time.
 * - The roadmap quotes exactly what the simulator produces: every generated
 *   block in docs/coreedge/CoreEdge-Gap-Study-and-Roadmap.md is current, and
 *   the prose of sections 1 and 3 types no coverage figure outside a block.
 *   CI runs the same check as `pnpm coreedge:check`; this makes `pnpm test`
 *   catch it too.
 * - The parity scorecard Control Tower renders (P1.9) is the committed file
 *   the same run writes, in the roadmap's own words, and carries nothing that
 *   would make it differ from one commit to the next but the figures.
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  bareProseFigures,
  buildScorecard,
  DOC_PATH,
  renderBlocks,
  renderDocument,
  SCORECARD_PATH,
  serializeScorecard,
} from "../../../scripts/coreedge/render-roadmap-figures.mjs";
import { loadInputs, MATRIX_PATH, REGISTRY_PATH, simulateAll } from "../../../scripts/coreedge/simulate-gap-matrix.mjs";

type Cell = { row: string; col?: string; status: string };
type Dims = Record<string, string[]>;

/** The parts of the simulator's (untyped, plain-Node) output this test reads. */
interface Summary {
  validScenarios: number;
  fullySupported: number;
  atLeastPartial: number;
  lifecycle: Record<string, number>;
  by: Record<string, Record<string, { valid: number; fullPct: number; partialPct: number }>>;
}
interface SimResults {
  totalPermutations: number;
  lifecycleStages: number;
  headlineHosting: string;
  integrationSuite: Summary;
  coreedgeToday: Summary;
  coreedgeTodayByHosting: Record<string, { atLeastPartial: number }>;
  cellLevelsByPhase: { id: string; levels: Record<string, number> }[];
  extended: { totalPermutations: number };
  problems: string[];
}

const inputs = loadInputs();
const results = simulateAll(inputs, { withCellLevels: true }) as unknown as SimResults;

const LEVEL: Record<string, number> = { full: 2, partial: 1, none: 0, yes: 2, no: 0 };

/** Appendix B's algorithm, one scenario at a time, with no shortcuts. */
function reference(platformCells: Record<string, Cell[]>, D: Dims, sap: Record<string, Cell[]>) {
  const index = new Map<Cell[] | undefined, Map<string, number>>();
  const lookup = (cells: Cell[] | undefined, key: string) => {
    let m = index.get(cells);
    if (!m) {
      m = new Map((cells ?? []).map((x) => [`${x.row}|${x.col ?? ""}`, LEVEL[x.status] ?? 0]));
      index.set(cells, m);
    }
    return m.get(key) ?? 0;
  };
  const pair = (cells: Cell[] | undefined, r: string, c: string) => lookup(cells, `${r}|${c}`);
  const single = (cells: Cell[] | undefined, r: string) => lookup(cells, `${r}|`);
  // A per-target rating wins over the all-targets one (Appendix B).
  const sapAuth = platformCells.sapAuth ?? [];
  const auth = (t: string, a: string) =>
    sapAuth.some((x) => x.row === t && x.col === a) ? pair(sapAuth, t, a) : single(sapAuth, a);
  let valid = 0, full = 0, partial = 0;
  for (const t of D.target!) for (const tech of D.tech!) for (const pat of D.pattern!) for (const org of D.origin!) for (const net of D.network!) for (const sa of D.sapAuth!) {
    if (!pair(sap.avail, t, tech) || !pair(sap.techPattern, tech, pat) || !pair(sap.originAvail, t, org) || !pair(sap.netApplicable, t, net) || !pair(sap.authAvail, t, sa)) continue;
    for (const c of D.consumer!) for (const a of D.consumerAuth!) {
      valid++;
      const level = Math.min(
        pair(platformCells.targetTech, t, tech),
        pair(platformCells.techPattern, tech, pat),
        single(platformCells.network, net),
        single(platformCells.origin, org),
        auth(t, sa),
        pair(platformCells.consumerAuth, c, a),
      );
      if (level === 2) full++;
      if (level >= 1) partial++;
    }
  }
  return { valid, full, partial };
}

describe("the gap simulator", () => {
  it("reports no matrix or registry problems", () => {
    expect(results.problems).toEqual([]);
  });

  it("keeps the published permutation and valid counts", () => {
    expect(results.totalPermutations).toBe(1_119_744);
    expect(results.coreedgeToday.validScenarios).toBe(497_340);
    for (const c of Object.values(results.coreedgeToday.by.consumer!)) expect(c.valid).toBe(497_340 / 9);
  });

  it("counts the same as the one-scenario-at-a-time reference, for both platforms", () => {
    const { matrix, registry } = inputs;
    const D = matrix.dimensions as Dims;
    const sap = matrix.sapFeasibility as Record<string, Cell[]>;
    const ce = reference(registry.coreedgeToday, D, sap);
    expect([ce.valid, ce.full, ce.partial]).toEqual([
      results.coreedgeToday.validScenarios,
      results.coreedgeToday.fullySupported,
      results.coreedgeToday.atLeastPartial,
    ]);
    const is = reference(matrix.integrationSuite, D, sap);
    expect([is.valid, is.full, is.partial]).toEqual([
      results.integrationSuite.validScenarios,
      results.integrationSuite.fullySupported,
      results.integrationSuite.atLeastPartial,
    ]);
  });

  it("scores the headline on the hosted instance, and no hosting mode below it but the connector", () => {
    expect(results.headlineHosting).toBe("SHARED");
    const by = results.coreedgeTodayByHosting as Record<string, { atLeastPartial: number }>;
    expect(by.SHARED!.atLeastPartial).toBe(results.coreedgeToday.atLeastPartial);
    expect(by.SELF_HOSTED!.atLeastPartial).toBeGreaterThan(by.SHARED!.atLeastPartial);
    expect(by.CONNECTOR!.atLeastPartial).toBe(0);
  });

  it("never lowers a cell across phases", () => {
    const steps = results.cellLevelsByPhase as { id: string; levels: Record<string, number> }[];
    for (let i = 1; i < steps.length; i++) {
      for (const [key, level] of Object.entries(steps[i]!.levels)) expect(level, `${steps[i]!.id} ${key}`).toBeGreaterThanOrEqual(steps[i - 1]!.levels[key]!);
    }
  });

  it("scores the five lifecycle stages section 3.8 said were missing, for both platforms", () => {
    for (const s of ["PROVIDER_BUILD_TRANSPORT", "API_VERSIONING", "PERFORMANCE_TEST", "SUPPORT_INCIDENT", "RETIRE"]) {
      expect(results.integrationSuite.lifecycle[s], s).toBeDefined();
      expect(results.coreedgeToday.lifecycle[s], s).toBeDefined();
    }
    expect(results.lifecycleStages).toBe(18);
  });

  it("no longer scores Integration Suite 0% full for AI agents (section 3.7)", () => {
    expect(results.integrationSuite.by.consumer!.AI_AGENT!.fullPct).toBeGreaterThan(0);
  });

  it("keeps the extended model out of the headline", () => {
    expect(results.extended.totalPermutations).toBeGreaterThan(results.totalPermutations);
    expect(results.coreedgeToday.validScenarios).toBe(497_340);
  });
});

describe("the roadmap's simulated figures", () => {
  it("match the simulator (run `pnpm coreedge:figures`)", () => {
    const doc = readFileSync(DOC_PATH, "utf8");
    const { out, missing } = renderDocument(doc, renderBlocks(results, inputs.matrix, inputs.registry));
    expect(missing).toEqual([]);
    expect(out === doc, "a figures block in the roadmap is stale").toBe(true);
    // The section 1.1 what-if runs simulate twice more.
  }, 30_000);

  it("are never typed into the prose of sections 1 and 3", () => {
    expect(bareProseFigures(readFileSync(DOC_PATH, "utf8"))).toEqual([]);
  });

  it("catch a figure typed into a checked section, and leave exempt spans and other sections alone", () => {
    const doc = [
      "## 1. Summary",
      "Partial support is 0.3% today, on 1,512 scenarios, and 12 of 18 stages.",
      "Quoted: <!-- figures:begin value-full-P5 -->4.9%<!-- figures:end value-full-P5 -->.",
      "Once <!-- figures:historical begin -->3.3% full<!-- figures:historical end -->; a target of <!-- figures:not-simulated begin -->100%<!-- figures:not-simulated end -->.",
      "## 2. Method",
      "Typed here: 6.1%.",
      "## 3. Results",
      "Typed again: 53.4%.",
    ].join("\n");
    expect(bareProseFigures(doc)).toEqual([
      { line: 2, figure: "0.3%" },
      { line: 2, figure: "1,512" },
      { line: 2, figure: "12 of 18" },
      { line: 8, figure: "53.4%" },
    ]);
  });

  it("write section 3.1's supported shape from the cells, not by hand", () => {
    const shape = (registry: typeof inputs.registry) => {
      const r = simulateAll({ matrix: inputs.matrix, registry }, { withCellLevels: true });
      return renderBlocks(r, inputs.matrix, registry, { withWhatIf: false })["today-partial-shape"] as string;
    };
    const today = shape(inputs.registry);
    expect(today).toContain(`The ${results.coreedgeToday.atLeastPartial.toLocaleString("en")} scenarios`);
    expect(today).toContain("the broker accepts one consumer login, STATIC_BEARER");

    // A northbound token endpoint lands: OAuth client credentials become partial for every consumer.
    const withOAuth = structuredClone(inputs.registry);
    for (const c of withOAuth.coreedgeToday.consumerAuth as Cell[]) if (c.col === "OAUTH_CLIENT_CREDENTIALS") c.status = "partial";
    const after = shape(withOAuth);
    expect(after).toContain("- consumer login OAUTH_CLIENT_CREDENTIALS, for every consumer type.");
    expect(after).not.toContain("accepts one consumer login");
    expect(after).not.toContain(`The ${results.coreedgeToday.atLeastPartial.toLocaleString("en")} scenarios`);
  }, 30_000);

  it("are the document in docs/coreedge", () => {
    expect(path.relative(process.cwd(), DOC_PATH)).toBe(path.join("docs", "coreedge", "CoreEdge-Gap-Study-and-Roadmap.md"));
  });
});

describe("the parity scorecard (P1.9)", () => {
  /** The parts of the scorecard (untyped, from plain Node) these tests read. */
  interface Scorecard {
    inputs: { matrix: { sha256: string; revisedOn: string | null }; registry: { sha256: string } };
    steps: { id: string; upgrades: { total: number; creditedToday: number } | null }[];
    blockersToday: { rank: number; label: string; level: string; leverage: number; leveragePct: number; soleBlocker: number; raisedIn: string; note: string | null }[];
    lifecycle: { stage: string; reachesFullIn: string }[];
    problems: string[];
  }
  const scorecard = buildScorecard(results, inputs) as unknown as Scorecard;
  const blocks = renderBlocks(results, inputs.matrix, inputs.registry, { withWhatIf: false });
  /** A generated markdown table's body rows, as cells. */
  const tableRows = (markdown: string) =>
    markdown.split("\n").slice(2).map((line) => line.replace(/^\| | \|$/g, "").split(" | "));

  it("is the committed file, byte for byte (run `pnpm coreedge:figures`)", () => {
    const committed = readFileSync(SCORECARD_PATH, "utf8");
    expect(serializeScorecard(scorecard) === committed, "docs/coreedge/parity-scorecard.json is stale").toBe(true);
    expect(scorecard.problems).toEqual([]);
  });

  it("fingerprints the two committed inputs it was computed from", () => {
    // Canonical: the parsed file re-serialised, so a CRLF checkout has CI's digest.
    const canonical = (file: string) =>
      createHash("sha256").update(JSON.stringify(JSON.parse(readFileSync(file, "utf8")))).digest("hex");
    expect(scorecard.inputs.matrix.sha256).toBe(canonical(MATRIX_PATH));
    expect(scorecard.inputs.registry.sha256).toBe(canonical(REGISTRY_PATH));
    expect(scorecard.inputs.matrix.revisedOn).toBe(inputs.matrix.generatedAt);
  });

  it("words every ranked blocker as the roadmap's blockers-today table does", () => {
    const rows = tableRows(blocks["blockers-today"] as string);
    expect(rows).toHaveLength(scorecard.blockersToday.length);
    scorecard.blockersToday.forEach((b, i) => {
      const [rank, label, level, leverage, sole, raised] = rows[i]!;
      expect([rank, label, level, raised], `rank ${b.rank}`).toEqual([String(b.rank), b.label, b.level, b.raisedIn]);
      expect(leverage).toBe(`${b.leverage.toLocaleString("en")} (${b.leveragePct.toFixed(1)}%)`);
      expect(sole).toBe(b.soleBlocker.toLocaleString("en"));
      // The page prints the registry's reason beside each one.
      expect(b.note, b.label).toBeTruthy();
    });
  });

  it("gives every lifecycle stage the roadmap's \"reaches full in\"", () => {
    const rows = tableRows(blocks.lifecycle as string);
    expect(rows.map((r) => [r[0], r[4]])).toEqual(scorecard.lifecycle.map((l) => [l.stage, l.reachesFullIn]));
  });

  it("holds no timestamp and no commit, so the check is stable from one commit to the next", () => {
    const keys: string[] = [];
    const strings: string[] = [];
    const walk = (v: unknown): void => {
      if (typeof v === "string") strings.push(v);
      else if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === "object") {
        for (const [k, x] of Object.entries(v)) {
          keys.push(k);
          walk(x);
        }
      }
    };
    walk(JSON.parse(readFileSync(SCORECARD_PATH, "utf8")));
    expect(keys.filter((k) => /time|stamp|commit|build|deploy|generatedAt|At$/i.test(k))).toEqual([]);
    // A date is the matrix's own revision date, never a moment; a hash is an input's sha256, never a 40-character commit.
    expect(strings.filter((v) => /\d{4}-\d{2}-\d{2}T\d/.test(v) || /^[0-9a-f]{40}$/.test(v))).toEqual([]);
  });

  it("credits a phase upgrade only once the code scores its cell at the upgrade's level", () => {
    // P0's first upgrade the code does not yet meet; raising that one registry cell credits it, and nothing else moves.
    const today = results.cellLevelsByPhase[0]!.levels;
    const rank: Record<string, number> = { none: 0, partial: 1, full: 2 };
    type Upgrade = { table: string; row: string; col: string; status: string };
    const p0 = (inputs.matrix.roadmapPhases as { id: string; cellUpgrades: Upgrade[] }[]).find((p) => p.id === "P0")!;
    const open = p0.cellUpgrades.find(
      (u) => u.table !== "sapAuth" && (today[`${u.table}:${u.col ? `${u.row}|${u.col}` : u.row}`] ?? -1) < rank[u.status]!,
    );
    expect(open, "every P0 upgrade is credited: pick another phase for this test").toBeDefined();
    const registry = structuredClone(inputs.registry);
    const cell = (registry.coreedgeToday[open!.table] as Cell[]).find((c) => c.row === open!.row && (c.col ?? "") === (open!.col ?? ""))!;
    cell.status = open!.status;
    const after = buildScorecard(simulateAll({ matrix: inputs.matrix, registry }, { withCellLevels: true }), {
      matrix: inputs.matrix,
      registry,
    }) as unknown as Scorecard;
    const credited = (s: Scorecard) => Object.fromEntries(s.steps.map((x) => [x.id, x.upgrades?.creditedToday ?? null]));
    expect(credited(after)).toEqual({ ...credited(scorecard), P0: credited(scorecard).P0! + 1 });
  }, 30_000);
});
