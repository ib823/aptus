#!/usr/bin/env node
/**
 * Regenerates the simulated figures in the gap study (P0.15).
 *
 *   node scripts/coreedge/render-roadmap-figures.mjs           # rewrite the blocks
 *   node scripts/coreedge/render-roadmap-figures.mjs --check   # exit 1 if any block is stale
 *
 * Every simulated table in docs/coreedge/CoreEdge-Gap-Study-and-Roadmap.md
 * (sections 1.1, 1.4, 2.4, 3 and 8.1) sits between two markers:
 *
 *   <!-- figures:begin ID -->
 *   ...generated...
 *   <!-- figures:end ID -->
 *
 * This script runs the simulator (scripts/coreedge/simulate-gap-matrix.mjs) on
 * the matrix and the code-generated capability registry, and writes each block
 * from its output. CI runs --check, so the document cannot quote a figure the
 * code and the matrix no longer produce. Text outside the markers is a
 * person's to write; a block whose table carries prose columns (1.4) keeps the
 * prose and has only its figure columns rewritten.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { loadInputs, simulateAll } from "./simulate-gap-matrix.mjs";

const here = dirname(fileURLToPath(import.meta.url));
export const DOC_PATH = join(here, "..", "..", "docs", "coreedge", "CoreEdge-Gap-Study-and-Roadmap.md");

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

function prettyCell(key) {
  const [t, rest] = key.split(/:(.*)/s);
  return `${t} ${rest.replace("|", " / ")}`;
}

/** Each block id -> its markdown, from one simulation run. */
export function renderBlocks(results, matrix) {
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
    matrix.dimensions.lifecycle.map((s) => {
      const full = firstFull(levels, `lifecycle:${s}`);
      const lastLevel = levels[levels.length - 1].levels[`lifecycle:${s}`];
      return [
        s,
        matrix.dimensions.lifecycleMeaning?.[s] ?? "",
        String(IS.lifecycle[s]),
        String(CE.lifecycle[s]),
        full ?? (lastLevel === 1 ? "Never; partial at most (no item delivers the rest)" : "Never"),
      ];
    }),
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
  return blocks;
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

const MARKER = /<!-- figures:begin ([a-zA-Z0-9-]+) -->\n([\s\S]*?)\n?<!-- figures:end \1 -->/g;

export function renderDocument(doc, blocks) {
  const seen = new Set();
  const out = doc.replace(MARKER, (_all, id, body) => {
    seen.add(id);
    const b = blocks[id];
    if (b === undefined) throw new Error(`unknown figures block "${id}"`);
    const next = typeof b === "string" ? b : patchColumns(body, b.columns);
    return `<!-- figures:begin ${id} -->\n${next}\n<!-- figures:end ${id} -->`;
  });
  const missing = Object.keys(blocks).filter((id) => !seen.has(id));
  return { out, seen: [...seen], missing };
}

function main() {
  const inputs = loadInputs();
  const results = simulateAll(inputs, { withCellLevels: true });
  if (results.problems.length) {
    console.error(`The matrix has ${results.problems.length} problems; fix them first:\n  ${results.problems.slice(0, 20).join("\n  ")}`);
    process.exit(1);
  }
  const doc = readFileSync(DOC_PATH, "utf8");
  const { out, missing } = renderDocument(doc, renderBlocks(results, inputs.matrix));
  if (missing.length) {
    console.error(`The document has no markers for: ${missing.join(", ")}`);
    process.exit(1);
  }
  if (process.argv.includes("--check")) {
    if (out !== doc) {
      const a = doc.split("\n"), b = out.split("\n");
      const at = a.findIndex((l, i) => l !== b[i]);
      console.error(
        `The roadmap's simulated figures are stale (first difference at line ${at + 1}):\n  doc:       ${a[at]}\n  simulator: ${b[at]}\n` +
          "Run `pnpm coreedge:figures`, explain any change in the text around the block, and commit.",
      );
      process.exit(1);
    }
    console.log("The roadmap's simulated figures match the simulator.");
    return;
  }
  writeFileSync(DOC_PATH, out);
  console.log(out === doc ? "Figures already current." : `Rewrote the figures in ${DOC_PATH}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();
