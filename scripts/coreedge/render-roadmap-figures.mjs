#!/usr/bin/env node
/**
 * Regenerates the simulated figures in the gap study (P0.15) and the parity
 * scorecard Control Tower renders (P1.9).
 *
 *   node scripts/coreedge/render-roadmap-figures.mjs                    # rewrite the blocks and the scorecard
 *   node scripts/coreedge/render-roadmap-figures.mjs --check            # exit 1 if any block or the scorecard is stale
 *   node scripts/coreedge/render-roadmap-figures.mjs --check-scorecard  # the scorecard only (what the build runs)
 *
 * Every simulated table in docs/coreedge/CoreEdge-Gap-Study-and-Roadmap.md
 * (sections 1.1, 1.4, 2.4, 3 and 8.1) sits between two markers:
 *
 *   <!-- figures:begin ID -->
 *   ...generated...
 *   <!-- figures:end ID -->
 *
 * or, inside a sentence or a list item, on one line:
 *
 *   ... the simulator gives <!-- figures:begin value-full-P5 -->4.9%<!-- figures:end value-full-P5 -->.
 *
 * This script runs the simulator (scripts/coreedge/simulate-gap-matrix.mjs) on
 * the matrix and the code-generated capability registry, and writes each block
 * from its output. CI runs --check, so the document cannot quote a figure the
 * code and the matrix no longer produce. Text outside the markers is a
 * person's to write; a block whose table carries prose columns (1.4, 3.9)
 * keeps the prose and has only its figure columns rewritten. Every block the
 * script renders must appear in the document, except the `value-*` family
 * (one figure each, for quoting inside a sentence), which a sentence uses as
 * it needs.
 *
 * FIGURES IN PROSE. A number typed into a sentence goes stale silently when the
 * code changes. So the script also reads the prose of sections 1 and 3 and
 * fails on any coverage figure there (a percentage, a count with thousands
 * separators, or "N of M") that is not inside a block. A sentence quotes a
 * figure through a `value-*` block. A figure that is not simulator output, or
 * that records a past result on purpose, is wrapped in one of
 *
 *   <!-- figures:historical begin --> ... <!-- figures:historical end -->
 *   <!-- figures:not-simulated begin --> ... <!-- figures:not-simulated end -->
 *
 * and is not checked. What a sentence says around a figure is still a
 * person's to keep true; a whole claim that depends on the cells (the
 * supported shape in 3.1, say) is a block of its own.
 *
 * THE PARITY SCORECARD (P1.9). The same run also writes
 * docs/coreedge/parity-scorecard.json, which Control Tower's parity page
 * renders (/control-tower/parity). It is built from the same results as the
 * roadmap's blocks and with the same helpers, so the page and this document
 * cannot word a blocker or a phase differently. It holds no timestamp and no
 * commit: the figures are a function of the two committed inputs, whose
 * digests it carries, and the page takes the commit from the deployment.
 * --check fails when the file is stale, as it does for a block, and prints
 * the input digests (to the GitHub step summary too, when there is one) so a
 * CI run can be compared with the page served from the same commit.
 *
 *   node scripts/coreedge/render-roadmap-figures.mjs --check-scorecard
 *
 * checks the scorecard alone, without the roadmap or its what-if runs. That
 * is what `vercel-build` runs before anything else: plain Node, the two
 * committed inputs, no network, no database, no tenant. A prose slip in the
 * roadmap therefore never blocks a deploy, and a stale scorecard fails the
 * build before the database is migrated rather than after.
 */
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { loadInputs, MATRIX_PATH, REGISTRY_PATH, simulateAll } from "./simulate-gap-matrix.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..");
export const DOC_PATH = join(repoRoot, "docs", "coreedge", "CoreEdge-Gap-Study-and-Roadmap.md");
export const SCORECARD_PATH = join(repoRoot, "docs", "coreedge", "parity-scorecard.json");

const n = (x) => x.toLocaleString("en");
const p = (x) => `${x.toFixed(1)}%`;
const LEVEL = ["none", "partial", "full"];
const table = (head, rows) =>
  [`| ${head.join(" | ")} |`, `|${head.map(() => "---").join("|")}|`, ...rows.map((r) => `| ${r.join(" | ")} |`)].join("\n");

function firstFull(levelsByPhase, key) {
  for (const s of levelsByPhase) if (s.levels[key] === 2) return s.id === "Today" ? "Today" : s.id;
  return null;
}

/** "Reaches full in" for a cell: the first phase that makes it full, else how far it gets. */
function raisedIn(levelsByPhase, key) {
  const full = firstFull(levelsByPhase, key);
  if (full) return `Full in ${full}`;
  const last = levelsByPhase[levelsByPhase.length - 1].levels[key];
  if (last === 1) {
    const firstPartial = levelsByPhase.find((s) => s.levels[key] >= 1);
    return firstPartial.id === "Today" ? "Partial today; never full" : `Partial from ${firstPartial.id}; never full`;
  }
  return "Never raised";
}

/** "CoreEdge reaches full in" for a lifecycle stage: the first step that makes it full, else how far it gets. */
function reachesFullIn(levelsByPhase, key) {
  const full = firstFull(levelsByPhase, key);
  if (full) return full;
  const last = levelsByPhase[levelsByPhase.length - 1].levels[key];
  return last === 1 ? "Never; partial at most (no item delivers the rest)" : "Never";
}

function prettyCell(key) {
  const [t, rest] = key.split(/:(.*)/s);
  return `${t} ${rest.replace("|", " / ")}`;
}

/** "a or b", "a, b or c". */
const orList = (xs) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} or ${xs[xs.length - 1]}`);

/**
 * The native-B2B what-if of section 1.1 (Appendix B): a phase after the last
 * that makes B2B_EDI full for every technology; and a second that also makes
 * the IDoc and file adapters full on every target.
 */
function b2bVariants(matrix, registry) {
  const D = matrix.dimensions;
  const run = (cellUpgrades) => {
    const m = structuredClone(matrix);
    m.roadmapPhases.push({ id: "WHAT_IF", name: "what if", cellUpgrades });
    const r = simulateAll({ matrix: m, registry });
    return r.phases[r.phases.length - 1];
  };
  const native = D.tech.map((t) => ({ table: "techPattern", row: t, col: "B2B_EDI", status: "full" }));
  const adapters = D.target.flatMap((t) => ["IDOC", "FILE_SFTP"].map((tech) => ({ table: "targetTech", row: t, col: tech, status: "full" })));
  return { native: run(native), adapters: run([...native, ...adapters]) };
}

/** The four section 1.1 blocks for pairing with Integration Suite against native B2B. */
function renderWhatIf(blocks, R, matrix, registry) {
  const IS = R.integrationSuite;
  const last = R.phases[R.phases.length - 1];
  const b2b = last.by.pattern.B2B_EDI;
  const { native, adapters } = b2bVariants(matrix, registry);
  const gain = (v) => v.fullySupported - last.fullySupported;
  const points = (v) => (v.fullPct - last.fullPct).toFixed(1);
  blocks["b2b-pairing"] =
    `Pairing already takes the B2B_EDI pattern (${n(b2b.valid)} valid scenarios, ${p((100 * b2b.valid) / last.validScenarios)}) to ${p(b2b.partialPct)} partial after Phase 6, with ${p(b2b.fullPct)} full.`;
  blocks["b2b-native"] =
    `Making the B2B pattern natively full for every technology SAP allows (SOAP, REST, IDoc, files) would add ${n(gain(native))} fully supported scenarios: +${points(native)} points, ` +
    `from ${p(last.fullPct)} to ${p(native.fullPct)}, with the B2B row at ${p(native.by.pattern.B2B_EDI.fullPct)} full. The gain is small because the IDoc and file cells it rides on are still partial.`;
  blocks["b2b-native-adapters"] =
    `Making the IDoc and file adapters full on every target as well would add ${n(gain(adapters))} in total: +${points(adapters)} points, to ${p(adapters.fullPct)}. ` +
    `That takes the B2B row to ${p(adapters.by.pattern.B2B_EDI.fullPct)} full, against Integration Suite's ${p(IS.by.pattern.B2B_EDI.fullPct)}.`;
  blocks["b2b-partial"] =
    `The first variant leaves the partial figure at ${p(native.partialPct)}. The second ` +
    (adapters.atLeastPartial > native.atLeastPartial
      ? `raises it to ${p(adapters.partialPct)} (${n(adapters.atLeastPartial)}), because it also makes IDoc and file cells full that no phase credits.`
      : `leaves it at ${p(adapters.partialPct)}.`);
}

/**
 * Each block id -> its markdown, from one simulation run (made with
 * `withCellLevels`). The registry is needed for the section 1.1 what-if runs;
 * `withWhatIf: false` skips them (and their four blocks), for a caller that
 * reads other blocks only.
 */
export function renderBlocks(results, matrix, registry, { withWhatIf = true } = {}) {
  if (withWhatIf && !registry) throw new Error("renderBlocks needs the registry (the section 1.1 what-if runs simulate again)");
  const R = results;
  const IS = R.integrationSuite;
  const CE = R.coreedgeToday;
  const last = R.phases[R.phases.length - 1];
  const L = R.lifecycleStages;
  const blocks = {};
  const fp = (s) => `${n(s.fullySupported)} (${p(s.fullPct)})`;
  const pp = (s) => `${n(s.atLeastPartial)} (${p(s.partialPct)})`;

  blocks.headline = table(
    ["Measure", "SAP Integration Suite", "CoreEdge today (hosted)", `CoreEdge after the whole roadmap (${last.id})`],
    [
      ["Valid scenarios fully supported", fp(IS), fp(CE), fp(last)],
      ["Valid scenarios at least partly supported", pp(IS), pp(CE), pp(last)],
      [
        "AI-agent consumers, fully supported",
        p(IS.by.consumer.AI_AGENT.fullPct),
        p(CE.by.consumer.AI_AGENT.fullPct),
        `${p(last.by.consumer.AI_AGENT.fullPct)}, only if P6.1 clears SAP API Policy §2.2.2 (D2)`,
      ],
      [`Lifecycle stages rated "full", out of ${L}`, String(IS.lifecycleFull), String(CE.lifecycleFull), String(last.lifecycleFull)],
    ],
  );

  blocks.totals = table(
    ["", "Integration Suite", "CoreEdge today (hosted)", `CoreEdge after ${last.id}`],
    [
      ["Total permutations", n(R.totalPermutations), n(R.totalPermutations), n(R.totalPermutations)],
      ["Valid scenarios", n(IS.validScenarios), n(CE.validScenarios), n(last.validScenarios)],
      ["Fully supported", fp(IS), fp(CE), fp(last)],
      ["At least partly supported", pp(IS), pp(CE), pp(last)],
      [`Lifecycle stages full (of ${L})`, String(IS.lifecycleFull), String(CE.lifecycleFull), String(last.lifecycleFull)],
    ],
  );

  blocks.overall = table(
    ["", "Integration Suite full", "Integration Suite partial", "CoreEdge today full", "CoreEdge today partial", `CoreEdge after ${last.id} full`, `CoreEdge after ${last.id} partial`],
    [[`All valid scenarios (${n(CE.validScenarios)})`, p(IS.fullPct), p(IS.partialPct), fp(CE), pp(CE), fp(last), pp(last)]],
  );

  const dimTitles = { target: "Target", tech: "Technology", pattern: "Pattern", origin: "Origin", network: "Network", consumer: "Consumer" };
  for (const dim of Object.keys(dimTitles)) {
    blocks[`by-${dim}`] = table(
      [dimTitles[dim], "Valid", "IS full", "IS partial", "CoreEdge today full", "CoreEdge today partial", `CoreEdge after ${last.id} full`, `CoreEdge after ${last.id} partial`],
      matrix.dimensions[dim].map((v) => {
        const i = IS.by[dim][v], c = CE.by[dim][v], z = last.by[dim][v];
        return [v, n(c.valid), p(i.fullPct), p(i.partialPct), p(c.fullPct), p(c.partialPct), p(z.fullPct), p(z.partialPct)];
      }),
    );
  }

  const levels = R.cellLevelsByPhase;
  blocks.lifecycle = table(
    ["Stage", "What it means", "IS", "CoreEdge today", "CoreEdge reaches full in"],
    matrix.dimensions.lifecycle.map((s) => [
      s,
      matrix.dimensions.lifecycleMeaning?.[s] ?? "",
      String(IS.lifecycle[s]),
      String(CE.lifecycle[s]),
      reachesFullIn(levels, `lifecycle:${s}`),
    ]),
  );

  blocks["blockers-today"] = table(
    ["Rank", "Cell", "Rating today", "Leverage", "Sole", "Raised in"],
    CE.topBlockers.map((b, i) => [String(i + 1), prettyCell(b.cell), b.level, `${n(b.leverage)} (${p(b.leveragePct)})`, n(b.soleBlocker), raisedIn(levels, b.cell)]),
  );

  blocks["blockers-phases"] = table(
    ["After", "Not fully supported", "Biggest remaining blockers: leverage (sole)"],
    R.phases.map((ph) => [
      ph.id,
      n(ph.validScenarios - ph.fullySupported),
      ph.topBlockers.slice(0, 5).map((b) => `${prettyCell(b.cell)} ${p(b.leveragePct)} (${n(b.soleBlocker)})`).join("; "),
    ]),
  );

  const hostingRows = Object.entries(R.coreedgeTodayByHosting).map(([h, s]) => [
    h === R.headlineHosting ? `${h} (headline)` : h,
    ...matrix.dimensions.network.map((net) => s.network[net] ?? "none"),
    `${n(s.fullySupported)} (${p(s.fullPct)})`,
    `${n(s.atLeastPartial)} (${p(s.partialPct)})`,
  ]);
  blocks.hosting = table(["Hosting", ...matrix.dimensions.network, "Full today", "Partial today"], hostingRows);

  if (R.extended) {
    const X = R.extended;
    const xl = X.phases[X.phases.length - 1];
    const rows = [
      ["All valid scenarios", n(X.coreedgeToday.validScenarios), p(X.integrationSuite.fullPct), p(X.integrationSuite.partialPct), p(X.coreedgeToday.fullPct), p(X.coreedgeToday.partialPct), p(xl.fullPct), p(xl.partialPct)],
    ];
    for (const [dim, values] of Object.entries(X.dimensions)) {
      for (const v of values) {
        const i = X.integrationSuite.by[dim][v], c = X.coreedgeToday.by[dim][v];
        rows.push([`${dim} ${v}`, n(c.valid), p(i.fullPct), p(i.partialPct), p(c.fullPct), p(c.partialPct), "", ""]);
      }
    }
    blocks.extended = [
      `Permutations ${n(X.totalPermutations)}; valid scenarios ${n(X.coreedgeToday.validScenarios)}. CoreEdge after ${xl.id}: ${n(xl.fullySupported)} full (${p(xl.fullPct)}), ${n(xl.atLeastPartial)} partial (${p(xl.partialPct)}).`,
      "",
      table(["Slice", "Valid", "IS full", "IS partial", "CoreEdge today full", "CoreEdge today partial", `CoreEdge after ${xl.id} full`, `CoreEdge after ${xl.id} partial`], rows),
    ].join("\n");
  }

  // 8.1: every phase, with the movers computed rather than written by hand.
  const steps = [{ id: "Today", ...CE }, ...R.phases];
  const movers = (prev, cur) => {
    if (!prev) return "";
    const deltas = [];
    for (const dim of Object.keys(dimTitles)) {
      for (const [v, s] of Object.entries(cur.by[dim])) {
        const o = prev.by[dim][v];
        deltas.push({ v, df: s.fullPct - o.fullPct, dp: s.partialPct - o.partialPct, s, o });
      }
    }
    const top = (key, k) => deltas.filter((d) => d[key] > 0.05).sort((a, b) => b[key] - a[key] || (a.v < b.v ? -1 : 1)).slice(0, k);
    const parts = [];
    const tp = top("dp", 4);
    if (tp.length) parts.push(`Partial: ${tp.map((d) => `${d.v} ${p(d.o.partialPct)} to ${p(d.s.partialPct)}`).join(", ")}`);
    const tf = top("df", 3);
    if (tf.length) parts.push(`Full: ${tf.map((d) => `${d.v} ${p(d.o.fullPct)} to ${p(d.s.fullPct)}`).join(", ")}`);
    const stages = Object.keys(cur.lifecycle).filter((s) => cur.lifecycle[s] === 2 && prev.lifecycle[s] !== 2);
    if (stages.length) parts.push(`Stages now full: ${stages.join(", ")}`);
    return parts.join(". ") || "No coverage change";
  };
  blocks.phases = table(
    ["After", "Full", "Partial", `Lifecycle stages full (of ${L})`, "Biggest movers [computed]"],
    [
      ...steps.map((s, i) => [s.id, fp(s), pp(s), String(s.lifecycleFull), movers(steps[i - 1], s)]),
      ["IS (for reference)", fp(IS), pp(IS), String(IS.lifecycleFull), ""],
    ],
  );

  // The one-line summary closing each phase's section in 8.2-8.8.
  for (const [i, ph] of R.phases.entries()) {
    const prev = steps[i];
    const added = Object.keys(ph.lifecycle).filter((s) => ph.lifecycle[s] === 2 && prev.lifecycle[s] !== 2);
    blocks[`after-${ph.id}`] =
      `**After ${ph.id}:** full ${p(ph.fullPct)} (${n(ph.fullySupported)} scenarios), partial ${p(ph.partialPct)} (${n(ph.atLeastPartial)}); ` +
      `lifecycle stages full: ${ph.lifecycleFull} of ${L}${added.length ? ` (${added.join(", ")} added)` : ""} [simulated].`;
  }

  // 1.4 keeps its prose columns; these are the figure columns, keyed by the row's first word.
  blocks["phases-glance"] = {
    columns: {
      "Full / partial after": Object.fromEntries(steps.map((s) => [s.id, `${p(s.fullPct)} / ${p(s.partialPct)}`])),
      "Lifecycle stages full": Object.fromEntries(steps.map((s) => [s.id, String(s.lifecycleFull)])),
    },
  };

  /* ── figures quoted inside sentences ─────────────────────────────────── */

  // One figure each, for a sentence to quote (optional: see the header).
  for (const s of [...steps, { id: "IS", ...IS }]) {
    blocks[`value-full-${s.id}`] = p(s.fullPct);
    blocks[`value-partial-${s.id}`] = p(s.partialPct);
    blocks[`value-lifecycle-${s.id}`] = String(s.lifecycleFull);
  }
  blocks["value-lifecycle-stages"] = String(L);
  blocks["value-permutations"] = n(R.totalPermutations);
  blocks["value-valid"] = n(CE.validScenarios);
  // Per dimension value: value-{full|partial}-{step}-{dim}-{value}.
  for (const s of [...steps, { id: "IS", ...IS }]) {
    for (const [dim, values] of Object.entries(s.by)) {
      for (const [v, x] of Object.entries(values)) {
        blocks[`value-full-${s.id}-${dim}-${v}`] = p(x.fullPct);
        blocks[`value-partial-${s.id}-${dim}-${v}`] = p(x.partialPct);
      }
    }
  }
  if (R.extended) {
    for (const [dim, values] of Object.entries(R.extended.coreedgeToday.by)) {
      for (const [v, x] of Object.entries(values)) blocks[`value-partial-Today-extended-${dim}-${v}`] = p(x.partialPct);
    }
  }
  // A ranked cell's sole count: value-sole-{step}-{table}-{row}[-{col}].
  const slug = (cell) => cell.replace(/[:|]/g, "-").replace(/-$/, "");
  for (const s of steps) {
    for (const b of s.topBlockers ?? []) blocks[`value-sole-${s.id}-${slug(b.cell)}`] = n(b.soleBlocker);
    const best = Math.max(0, ...(s.topBlockers ?? []).map((b) => b.soleBlocker));
    blocks[`value-max-sole-${s.id}`] = n(best);
    blocks[`value-max-sole-points-${s.id}`] = ((100 * best) / CE.validScenarios).toFixed(1);
  }

  // 1.1: breadth by phase, for the phases section 1.1 names.
  const phase = (id) => R.phases.find((x) => x.id === id);
  const half = last.partialPct > 50 ? "more than half" : "under half";
  blocks["breadth-partial"] =
    `**Partial support:** ${p(CE.partialPct)} today, ${p(phase("P4").partialPct)} after Phase 4, ${p(phase("P5").partialPct)} after Phase 5 (new protocols and patterns), ` +
    `${p(last.partialPct)} after Phase 6 (user-delegated login and principal propagation). That is ${half} of the valid scenarios, against Integration Suite's ${p(IS.partialPct)}.` +
    (last.partialPct > 50 ? ` So the "barely moves breadth" reading no longer holds for partial support.` : "");
  const share = last.fullPct / IS.fullPct;
  const shareWords = share < 0.25 ? "under a quarter of" : share < 0.5 ? "under half of" : share < 1 ? "below" : "at or above";
  blocks["breadth-full"] =
    `**Full support:** ${p(last.fullPct)} after Phase 6, ${shareWords} Integration Suite's ${p(IS.fullPct)}.` +
    (share < 0.5 ? " So for full support it still largely holds." : "");

  // 1.1: pairing with Integration Suite against native B2B (Appendix B).
  if (withWhatIf) renderWhatIf(blocks, R, matrix, registry);

  /* ── section 3: today's supported shape, read from the cells ───────── */

  const today = levels?.[0]?.levels;
  if (!today) throw new Error("renderBlocks needs results made with withCellLevels");
  const D = matrix.dimensions;
  const level = (key) => today[key] ?? 0;
  const loginsUsed = D.consumerAuth.filter((a) => D.consumer.some((c) => level(`consumerAuth:${c}|${a}`) > 0));
  const loginsNone = D.consumerAuth.filter((a) => D.consumer.every((c) => level(`consumerAuth:${c}|${a}`) === 0));
  const dimWords = { tech: "technology", pattern: "pattern", target: "target", origin: "origin", network: "network" };
  if (CE.atLeastPartial === 0) {
    blocks["today-partial-shape"] = "CoreEdge partly supports no valid scenario today.";
  } else {
    const lines = Object.entries(dimWords).map(([dim, word]) => {
      const vs = D[dim].filter((v) => CE.by[dim][v].partialPct > 0);
      return `- ${word} ${orList(vs)}${vs.length === D[dim].length ? ` (every ${word})` : ""};`;
    });
    loginsUsed.forEach((a, i) => {
      const consumers = D.consumer.filter((c) => level(`consumerAuth:${c}|${a}`) > 0);
      const who = consumers.length === D.consumer.length ? "for every consumer type" : `for ${orList(consumers)}`;
      lines.push(`- consumer login ${a}, ${who}${i === loginsUsed.length - 1 ? "." : ";"}`);
    });
    const others =
      loginsNone.length === 0
        ? ""
        : ` Every other consumer login (${loginsNone.join(", ")}) is scored none for every consumer type` +
          (loginsUsed.length === 1 ? `: the broker accepts one consumer login, ${loginsUsed[0]}.` : ".");
    blocks["today-partial-shape"] = [
      `The ${n(CE.atLeastPartial)} scenarios CoreEdge partly supports today all have:`,
      ...lines,
      "",
      `These are the only values with non-zero partial coverage in the per-dimension results.${others} ` +
        "The registry's note on each cell says why (`docs/coreedge/capability-registry.json`).",
    ].join("\n");
  }

  // 3.8: the stages the whole roadmap leaves below full.
  const missed = D.lifecycle.filter((s) => last.lifecycle[s] !== 2);
  blocks["lifecycle-summary"] =
    `So after the whole roadmap CoreEdge is full on ${last.lifecycleFull} of ${L} stages` +
    (missed.length ? `; the ${missed.length} it misses (${missed.join(", ")}) are the ones no roadmap item takes to full.` : ".");

  // 3.9: the structural gaps' counts, keyed by the row's number. "Outside"
  // the supported shape is a value with no partial coverage today.
  const outside = (dim) => D[dim].filter((v) => !(CE.by[dim][v].partialPct > 0)).reduce((sum, v) => sum + CE.by[dim][v].valid, 0);
  const ofValid = (k) => `${n(k)} (${p((100 * k) / CE.validScenarios)})`;
  // The consumer side never affects validity, so every (consumer, login) pair holds the same share.
  const pairs = D.consumer.length * D.consumerAuth.length;
  const nonePairs = D.consumer.flatMap((c) => D.consumerAuth.map((a) => level(`consumerAuth:${c}|${a}`))).filter((v) => v === 0).length;
  const loginOutside = Math.round((CE.validScenarios * nonePairs) / pairs);
  const uniform = loginsUsed.length + loginsNone.length === D.consumerAuth.length;
  const sapNone = D.sapAuth.filter((a) => D.target.every((t) => level(`sapAuth:${t}|${a}`) === 0));
  blocks["structural-gaps"] = {
    columns: {
      "Valid scenarios outside": {
        1: ofValid(outside("pattern")),
        2: ofValid(outside("tech")),
        4:
          `${ofValid(loginOutside)}: ` +
          (uniform
            ? `${loginsNone.length} of the ${D.consumerAuth.length} consumer logins, which never affect validity`
            : `${nonePairs} of the ${pairs} consumer-type and login pairs, which never affect validity`),
        5: ofValid(outside("target")),
        6: `${ofValid(outside("network"))} for the hosted instance`,
        7: `${sapNone.length} of the ${D.sapAuth.length} SAP login methods scored none on every target today`,
        8:
          CE.fullySupported === 0
            ? `All ${n(CE.atLeastPartial)} supported scenarios`
            : `${n(CE.atLeastPartial - CE.fullySupported)} of the ${n(CE.atLeastPartial)} supported scenarios`,
      },
    },
  };
  return blocks;
}

/* ── the parity scorecard (P1.9) ─────────────────────────────────────── */

const RANK = { none: 0, partial: 1, full: 2 };

/**
 * The registry's own cell for a simulator key, for its note. sapAuth is rated
 * per target or for every target at once, and a per-target rating wins, as it
 * does in the simulator.
 */
function registryCell(registry, key) {
  const [table, rest] = key.split(/:(.*)/s);
  const [row, col = ""] = rest.split("|");
  const cells = registry.coreedgeToday?.[table] ?? [];
  return (
    cells.find((c) => c.row === row && (c.col ?? "") === col) ??
    (table === "sapAuth" ? cells.find((c) => c.row === col && !c.col) : undefined)
  );
}

/**
 * How many of a phase's matrix upgrades the code already credits: the cells
 * the registry scores at or above the upgrade's status today. An all-target
 * sapAuth upgrade counts only when every target meets it. Coverage stays flat
 * inside a phase (one partial cell holds a scenario at partial, section 8.1),
 * so this is the within-phase progress the coverage columns cannot show.
 */
function upgradesCredited(phase, D, today) {
  const upgrades = phase?.cellUpgrades ?? [];
  const credited = upgrades.filter((u) => {
    const keys =
      u.table === "sapAuth" && !u.col
        ? D.target.map((t) => `sapAuth:${t}|${u.row}`)
        : [`${u.table}:${u.col ? `${u.row}|${u.col}` : u.row}`];
    return keys.every((k) => (today[k] ?? -1) >= RANK[u.status]);
  });
  return { total: upgrades.length, creditedToday: credited.length };
}

/**
 * A committed input's fingerprint. Taken over the parsed JSON re-serialised,
 * so a checkout that rewrote line endings has the same digest as CI.
 */
const digest = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

/** The repository-relative path, with forward slashes, for the file's provenance. */
const repoPath = (file) => relative(repoRoot, file).split("\\").join("/");

/** The number of each step's remaining blockers the scorecard names. */
const STEP_BLOCKERS = 3;

/**
 * The scorecard, from one simulation run made with `withCellLevels` and the
 * inputs it was made from. Everything the page shows is in here, already
 * computed; the page formats and lays it out and does no arithmetic of its
 * own, so "the page matches the file" and "the file matches the simulator"
 * are the whole claim. The extended model (caveat 8) is left out, as it is
 * from the roadmap's headline (D13).
 */
export function buildScorecard(results, { matrix, registry }) {
  const R = results;
  const levels = R.cellLevelsByPhase;
  if (!levels) throw new Error("buildScorecard needs results made with withCellLevels");
  const D = matrix.dimensions;
  const today = levels[0].levels;
  const IS = R.integrationSuite;

  const figures = (s) => ({
    fullySupported: s.fullySupported,
    atLeastPartial: s.atLeastPartial,
    fullPct: s.fullPct,
    partialPct: s.partialPct,
    lifecycleFull: s.lifecycleFull,
  });
  // One decimal place, like every percentage here; rounding keeps 26.9 - 0.1 from reading 26.799999.
  const points = (a, b) => Math.round(10 * (a - b)) / 10;
  const step = (id, name, s, upgrades) => ({
    id,
    name,
    ...figures(s),
    behindIntegrationSuite: { fullPoints: points(IS.fullPct, s.fullPct), partialPoints: points(IS.partialPct, s.partialPct) },
    upgrades,
    topBlockers: s.topBlockers.slice(0, STEP_BLOCKERS).map((b) => ({
      cell: b.cell,
      label: prettyCell(b.cell),
      leveragePct: b.leveragePct,
      soleBlocker: b.soleBlocker,
    })),
  });

  // Cells full today, with a sapAuth method full on every target as one entry
  // (the registry rates it once), not nine.
  const fullToday = [];
  const everyTarget = new Set();
  for (const key of Object.keys(today).filter((k) => today[k] === 2)) {
    const note = registryCell(registry, key)?.note ?? null;
    if (key.startsWith("sapAuth:")) {
      const auth = key.split("|")[1];
      if (D.target.every((t) => today[`sapAuth:${t}|${auth}`] === 2)) {
        if (!everyTarget.has(auth)) {
          everyTarget.add(auth);
          fullToday.push({ cell: `sapAuth:${auth}`, label: `sapAuth ${auth} (every target)`, note });
        }
        continue;
      }
    }
    fullToday.push({ cell: key, label: prettyCell(key), note });
  }

  return {
    generatedBy: "scripts/coreedge/render-roadmap-figures.mjs (pnpm coreedge:figures)",
    schemaVersion: 1,
    inputs: {
      matrix: { path: repoPath(MATRIX_PATH), sha256: digest(matrix), revisedOn: matrix.generatedAt ?? null },
      registry: { path: repoPath(REGISTRY_PATH), sha256: digest(registry) },
    },
    model: {
      totalPermutations: R.totalPermutations,
      validScenarios: R.coreedgeToday.validScenarios,
      lifecycleStages: R.lifecycleStages,
      headlineHosting: R.headlineHosting,
      networks: [...D.network],
    },
    integrationSuite: figures(IS),
    steps: [
      step("Today", "CoreEdge today", R.coreedgeToday, null),
      ...R.phases.map((ph) =>
        step(ph.id, ph.name, ph, upgradesCredited(matrix.roadmapPhases.find((x) => x.id === ph.id), D, today)),
      ),
    ],
    blockersToday: R.coreedgeToday.topBlockers.map((b, i) => ({
      rank: i + 1,
      cell: b.cell,
      label: prettyCell(b.cell),
      level: b.level,
      leverage: b.leverage,
      leveragePct: b.leveragePct,
      soleBlocker: b.soleBlocker,
      raisedIn: raisedIn(levels, b.cell),
      note: registryCell(registry, b.cell)?.note ?? null,
    })),
    lifecycle: D.lifecycle.map((s) => ({
      stage: s,
      meaning: D.lifecycleMeaning?.[s] ?? "",
      integrationSuite: LEVEL[IS.lifecycle[s]],
      today: LEVEL[R.coreedgeToday.lifecycle[s]],
      reachesFullIn: reachesFullIn(levels, `lifecycle:${s}`),
    })),
    hosting: Object.entries(R.coreedgeTodayByHosting).map(([h, s]) => ({
      hosting: h,
      headline: h === R.headlineHosting,
      network: Object.fromEntries(D.network.map((net) => [net, s.network[net] ?? "none"])),
      fullySupported: s.fullySupported,
      atLeastPartial: s.atLeastPartial,
      fullPct: s.fullPct,
      partialPct: s.partialPct,
    })),
    fullToday,
    problems: R.problems,
  };
}

/** The scorecard file's exact bytes; --check compares them with the committed file. */
export const serializeScorecard = (scorecard) => `${JSON.stringify(scorecard, null, 2)}\n`;

/** The two input digests, as a CI log line and the page's provenance both print them. */
function fingerprintLine(scorecard) {
  const { matrix, registry } = scorecard.inputs;
  return (
    `Scorecard inputs: ${matrix.path} sha256 ${matrix.sha256} (revised ${matrix.revisedOn ?? "undated"}); ` +
    `${registry.path} sha256 ${registry.sha256}.`
  );
}

/** Print the digests, and add them to the GitHub step summary when CI provides one. */
function reportFingerprints(scorecard) {
  console.log(fingerprintLine(scorecard));
  const summary = process.env.GITHUB_STEP_SUMMARY;
  if (!summary) return;
  const { matrix, registry } = scorecard.inputs;
  appendFileSync(
    summary,
    [
      "### Parity scorecard inputs",
      "",
      "Compare with the provenance on /control-tower/parity for the same commit.",
      "",
      "| Input | sha256 |",
      "|---|---|",
      `| \`${matrix.path}\` (revised ${matrix.revisedOn ?? "undated"}) | \`${matrix.sha256}\` |`,
      `| \`${registry.path}\` | \`${registry.sha256}\` |`,
      "",
    ].join("\n"),
  );
}

/** Rewrite only the named columns of a markdown table; rows are keyed by the first word of their first cell. */
function patchColumns(body, columns) {
  const lines = body.split("\n");
  const split = (l) => l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
  const head = split(lines[0]);
  return lines
    .map((line, i) => {
      if (i < 2 || !line.trim().startsWith("|")) return line;
      const cells = split(line);
      const key = cells[0].split(/\s+/)[0];
      for (const [col, values] of Object.entries(columns)) {
        const at = head.indexOf(col);
        if (at < 0) throw new Error(`column "${col}" not found`);
        if (values[key] !== undefined) cells[at] = values[key];
      }
      return `| ${cells.join(" | ")} |`;
    })
    .join("\n");
}

/**
 * A block on its own lines, or inline (begin and end on the line of the text
 * around them). A marker quoted in a code span (after a backtick) is text
 * about markers, not a marker.
 */
const MARKER = /(?<!`)<!-- figures:begin ([a-zA-Z0-9_-]+) -->(\n?)([\s\S]*?)\n?<!-- figures:end \1 -->/g;

/** Blocks a sentence may quote or not: the one-figure `value-*` family. */
const isOptional = (id) => id.startsWith("value-");

export function renderDocument(doc, blocks) {
  const seen = new Set();
  const out = doc.replace(MARKER, (_all, id, newline, body) => {
    seen.add(id);
    const b = blocks[id];
    if (b === undefined) throw new Error(`unknown figures block "${id}"`);
    const next = typeof b === "string" ? b : patchColumns(body, b.columns);
    if (!newline) {
      if (next.includes("\n")) throw new Error(`figures block "${id}" is inline but renders several lines`);
      return `<!-- figures:begin ${id} -->${next}<!-- figures:end ${id} -->`;
    }
    return `<!-- figures:begin ${id} -->\n${next}\n<!-- figures:end ${id} -->`;
  });
  const missing = Object.keys(blocks).filter((id) => !seen.has(id) && !isOptional(id));
  return { out, seen: [...seen], missing };
}

/** The sections whose prose figures are checked (see the header). */
export const CHECKED_SECTIONS = ["1", "3"];

/** A coverage figure: a count with thousands separators, a percentage, or "N of M". */
const FIGURE = /\d{1,3}(?:,\d{3})+(?![\d.])|\d+(?:\.\d+)?%|\b\d+ of \d+\b(?![,.]\d)/g;

const EXEMPT = /(?<!`)<!-- figures:(historical|not-simulated) begin -->[\s\S]*?<!-- figures:\1 end -->/g;

/**
 * Figures typed into the prose of the checked sections, outside every block
 * and exempt span, each as { line, figure }.
 */
export function bareProseFigures(doc) {
  // Blank out the blocks and the exempt spans, keeping line breaks so line numbers hold.
  const blank = (text) => text.replace(/[^\n]/g, " ");
  const prose = doc.replace(MARKER, blank).replace(EXEMPT, blank);
  const problems = [];
  let section = null;
  prose.split("\n").forEach((line, i) => {
    const heading = line.match(/^## ([^.\s]+)/);
    if (heading) section = heading[1];
    if (!CHECKED_SECTIONS.includes(section)) return;
    for (const f of line.match(FIGURE) ?? []) problems.push({ line: i + 1, figure: f });
  });
  return problems;
}

/** Why the committed scorecard is not the simulator's, or null when it is. */
function scorecardProblem(expected) {
  if (!existsSync(SCORECARD_PATH)) {
    return (
      "docs/coreedge/parity-scorecard.json is missing. Run `pnpm coreedge:figures` and commit it with the roadmap " +
      "(in a Vercel build, check that .vercelignore keeps it)."
    );
  }
  return readFileSync(SCORECARD_PATH, "utf8") === expected
    ? null
    : "docs/coreedge/parity-scorecard.json is stale: it is not what the simulator gives for this commit. " +
        "Run `pnpm coreedge:figures` and commit it with the roadmap.";
}

function main() {
  const checkScorecardOnly = process.argv.includes("--check-scorecard");
  const check = checkScorecardOnly || process.argv.includes("--check");

  // In a Vercel build these come from the filtered upload, so a .vercelignore
  // rule that drops one fails here, by name, rather than as a stack trace.
  const absent = [MATRIX_PATH, REGISTRY_PATH].filter((f) => !existsSync(f));
  if (absent.length) {
    console.error(
      `Missing ${absent.map(repoPath).join(" and ")}. In a Vercel build, check that .vercelignore keeps ` +
        "docs/coreedge/gap-matrix.json, capability-registry.json and parity-scorecard.json.",
    );
    process.exit(1);
  }

  const inputs = loadInputs();
  const results = simulateAll(inputs, { withCellLevels: true });
  if (results.problems.length) {
    console.error(`The matrix has ${results.problems.length} problems; fix them first:\n  ${results.problems.slice(0, 20).join("\n  ")}`);
    process.exit(1);
  }
  const scorecard = buildScorecard(results, inputs);
  const scorecardOut = serializeScorecard(scorecard);
  const scorecardStale = scorecardProblem(scorecardOut);

  // What the build runs: the scorecard alone, so the roadmap's prose rules and
  // its what-if runs (two more simulations) stay out of every deploy.
  if (checkScorecardOnly) {
    if (scorecardStale) {
      console.error(scorecardStale);
      process.exit(1);
    }
    console.log("The parity scorecard matches the simulator.");
    reportFingerprints(scorecard);
    return;
  }

  const doc = readFileSync(DOC_PATH, "utf8");
  const { out, missing } = renderDocument(doc, renderBlocks(results, inputs.matrix, inputs.registry));
  if (missing.length) {
    console.error(`The document has no markers for: ${missing.join(", ")}`);
    process.exit(1);
  }
  const bare = bareProseFigures(out);
  if (bare.length) {
    console.error(
      `Sections ${CHECKED_SECTIONS.join(" and ")} type ${bare.length} figure(s) into prose, where nothing regenerates them:\n  ` +
        bare.map((s) => `line ${s.line}: ${s.figure}`).join("\n  ") +
        "\nQuote each through a figures block (a `value-*` block inside a sentence). A figure that is not simulator output, " +
        "or that records a past result, goes inside <!-- figures:not-simulated begin/end --> or <!-- figures:historical begin/end -->.",
    );
    if (check) process.exit(1);
  }
  if (check) {
    // Both artefacts are checked before failing, so one run names everything stale.
    let stale = false;
    if (out !== doc) {
      const a = doc.split("\n"), b = out.split("\n");
      const at = a.findIndex((l, i) => l !== b[i]);
      console.error(
        `The roadmap's simulated figures are stale (first difference at line ${at + 1}):\n  doc:       ${a[at]}\n  simulator: ${b[at]}\n` +
          "Run `pnpm coreedge:figures`, explain any change in the text around the block, and commit.",
      );
      stale = true;
    }
    if (scorecardStale) {
      console.error(scorecardStale);
      stale = true;
    }
    if (stale) process.exit(1);
    console.log("The roadmap's simulated figures and the parity scorecard match the simulator.");
    reportFingerprints(scorecard);
    return;
  }
  writeFileSync(DOC_PATH, out);
  writeFileSync(SCORECARD_PATH, scorecardOut);
  console.log(out === doc ? "Figures already current." : `Rewrote the figures in ${DOC_PATH}`);
  console.log(scorecardStale ? `Wrote ${SCORECARD_PATH}` : "Parity scorecard already current.");
  if (bare.length) process.exit(1);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();
