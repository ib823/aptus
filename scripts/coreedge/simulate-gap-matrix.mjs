#!/usr/bin/env node
/**
 * Re-runs the CoreEdge gap simulation from docs/coreedge/gap-matrix.json.
 *
 *   node scripts/coreedge/simulate-gap-matrix.mjs            # human summary
 *   node scripts/coreedge/simulate-gap-matrix.mjs --json     # full results as JSON
 *
 * A scenario is one value from each of eight dimensions (target, tech, pattern,
 * origin, network, sapAuth, consumer, consumerAuth). It is VALID when SAP itself
 * makes it possible (every sapFeasibility cell is yes or partial). A platform
 * supports a valid scenario FULLY when every cell the scenario touches is full,
 * and AT LEAST PARTLY when every such cell is at least partial (the min rule).
 *
 * Roadmap phases apply their cellUpgrades cumulatively to coreedgeToday; an
 * upgrade never lowers a cell. sapAuth may be rated per target (row = target,
 * col = auth) or for every target at once (row = auth, col = "").
 *
 * Blocker leverage: for every valid scenario a platform does not fully support,
 * each of its below-full cells gets an equal share (1/k of the scenario). A cell's
 * leverage is the sum of its shares; "sole" counts scenarios where it is the only
 * thing below full. Both rank what to build next.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const matrixPath = join(here, "..", "..", "docs", "coreedge", "gap-matrix.json");
const data = JSON.parse(readFileSync(matrixPath, "utf8"));
const D = data.dimensions;
const SCORE = { full: 2, partial: 1, none: 0, yes: 2, no: 0 };

const problems = [];

function pairMap(cells, rows, cols, label) {
  const m = new Map();
  for (const c of cells ?? []) m.set(`${c.row}|${c.col}`, SCORE[c.status] ?? 0);
  for (const r of rows) for (const c of cols) if (!m.has(`${r}|${c}`)) { m.set(`${r}|${c}`, 0); problems.push(`missing ${label} ${r}|${c}`) }
  return m;
}

function singleMap(cells, rows, label) {
  const m = new Map();
  for (const c of cells ?? []) m.set(c.row, SCORE[c.status] ?? 0);
  for (const r of rows) if (!m.has(r)) { m.set(r, 0); problems.push(`missing ${label} ${r}`) }
  return m;
}

/** sapAuth rated per target; single-value ratings apply to every target. */
function sapAuthMap(cells, label) {
  const m = new Map();
  for (const c of cells ?? []) {
    if (c.col) m.set(`${c.row}|${c.col}`, SCORE[c.status] ?? 0);
    else for (const t of D.target) if (!m.has(`${t}|${c.row}`)) m.set(`${t}|${c.row}`, SCORE[c.status] ?? 0);
  }
  for (const t of D.target) for (const a of D.sapAuth) if (!m.has(`${t}|${a}`)) { m.set(`${t}|${a}`, 0); problems.push(`missing ${label} ${t}|${a}`) }
  return m;
}

function platform(p, label) {
  return {
    targetTech: pairMap(p.targetTech, D.target, D.tech, `${label}.targetTech`),
    techPattern: pairMap(p.techPattern, D.tech, D.pattern, `${label}.techPattern`),
    network: singleMap(p.network, D.network, `${label}.network`),
    origin: singleMap(p.origin, D.origin, `${label}.origin`),
    sapAuth: sapAuthMap(p.sapAuth, `${label}.sapAuth`),
    consumerAuth: pairMap(p.consumerAuth, D.consumer, D.consumerAuth, `${label}.consumerAuth`),
    lifecycle: singleMap(p.lifecycle, D.lifecycle, `${label}.lifecycle`),
  };
}

const sap = data.sapFeasibility;
const S = {
  avail: pairMap(sap.avail, D.target, D.tech, "sap.avail"),
  authAvail: pairMap(sap.authAvail, D.target, D.sapAuth, "sap.authAvail"),
  techPattern: pairMap(sap.techPattern, D.tech, D.pattern, "sap.techPattern"),
  originAvail: pairMap(sap.originAvail, D.target, D.origin, "sap.originAvail"),
  netApplicable: pairMap(sap.netApplicable, D.target, D.network, "sap.netApplicable"),
};

const valid = [];
for (const t of D.target) for (const tech of D.tech) {
  if (!S.avail.get(`${t}|${tech}`)) continue;
  for (const pat of D.pattern) {
    if (!S.techPattern.get(`${tech}|${pat}`)) continue;
    for (const org of D.origin) {
      if (!S.originAvail.get(`${t}|${org}`)) continue;
      for (const net of D.network) {
        if (!S.netApplicable.get(`${t}|${net}`)) continue;
        for (const sa of D.sapAuth) if (S.authAvail.get(`${t}|${sa}`)) valid.push([t, tech, pat, org, net, sa]);
      }
    }
  }
}
const consumerPairs = D.consumer.flatMap((c) => D.consumerAuth.map((a) => [c, a]));
const totalPermutations = [D.target, D.tech, D.pattern, D.origin, D.network, D.sapAuth, D.consumer, D.consumerAuth]
  .reduce((n, dim) => n * dim.length, 1);

const pct = (n, d) => (d ? Math.round((1000 * n) / d) / 10 : 0);

function simulate(P, { blockers = false } = {}) {
  let n = 0, full = 0, part = 0;
  const by = { target: {}, tech: {}, pattern: {}, origin: {}, network: {}, consumer: {} };
  const leverage = new Map();
  const sole = new Map();
  const bump = (o, k, f, p) => { const e = (o[k] ??= { valid: 0, full: 0, partial: 0 }); e.valid++; if (f) e.full++; if (p) e.partial++ };
  for (const [t, tech, pat, org, net, sa] of valid) {
    const base = [
      [`targetTech:${t}|${tech}`, P.targetTech.get(`${t}|${tech}`)],
      [`techPattern:${tech}|${pat}`, P.techPattern.get(`${tech}|${pat}`)],
      [`network:${net}`, P.network.get(net)],
      [`origin:${org}`, P.origin.get(org)],
      [`sapAuth:${t}|${sa}`, P.sapAuth.get(`${t}|${sa}`)],
    ];
    const baseMin = Math.min(...base.map((b) => b[1]));
    const baseWeak = base.filter((b) => b[1] < 2);
    for (const [c, a] of consumerPairs) {
      const ca = P.consumerAuth.get(`${c}|${a}`);
      const m = Math.min(baseMin, ca);
      const f = m === 2, p = m >= 1;
      n++; if (f) full++; if (p) part++;
      bump(by.target, t, f, p); bump(by.tech, tech, f, p); bump(by.pattern, pat, f, p);
      bump(by.origin, org, f, p); bump(by.network, net, f, p); bump(by.consumer, c, f, p);
      if (blockers && !f) {
        const weak = ca < 2 ? [...baseWeak, [`consumerAuth:${c}|${a}`, ca]] : baseWeak;
        const share = 1 / weak.length;
        for (const [k] of weak) leverage.set(k, (leverage.get(k) ?? 0) + share);
        if (weak.length === 1) sole.set(weak[0][0], (sole.get(weak[0][0]) ?? 0) + 1);
      }
    }
  }
  const shape = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { valid: v.valid, fullPct: pct(v.full, v.valid), partialPct: pct(v.partial, v.valid) }]));
  const lifecycle = Object.fromEntries(D.lifecycle.map((s) => [s, P.lifecycle.get(s)]));
  return {
    validScenarios: n, fullySupported: full, atLeastPartial: part, fullPct: pct(full, n), partialPct: pct(part, n),
    lifecycleFull: Object.values(lifecycle).filter((v) => v === 2).length,
    by: Object.fromEntries(Object.entries(by).map(([k, v]) => [k, shape(v)])),
    lifecycle,
    topBlockers: blockers
      ? [...leverage.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30)
          .map(([cell, lev]) => ({ cell, leverage: Math.round(lev), leveragePct: pct(lev, n), soleBlocker: sole.get(cell) ?? 0 }))
      : undefined,
  };
}

const IS = platform(data.integrationSuite, "integrationSuite");
const CE = platform(data.coreedgeToday, "coreedgeToday");
const results = {
  totalPermutations,
  integrationSuite: simulate(IS),
  coreedgeToday: simulate(CE, { blockers: true }),
  phases: [],
};

for (const ph of data.roadmapPhases ?? []) {
  for (const u of ph.cellUpgrades ?? []) {
    const table = CE[u.table];
    const key = u.table === "sapAuth"
      ? (u.col ? `${u.row}|${u.col}` : null)
      : u.col ? `${u.row}|${u.col}` : u.row;
    const target = SCORE[u.status];
    if (!table) { problems.push(`${ph.id}: unknown table ${u.table}`); continue }
    if (u.table === "sapAuth" && !u.col) {
      if (!D.sapAuth.includes(u.row)) { problems.push(`${ph.id}: unknown sapAuth ${u.row}`); continue }
      for (const t of D.target) table.set(`${t}|${u.row}`, Math.max(table.get(`${t}|${u.row}`), target));
      continue;
    }
    if (!table.has(key)) { problems.push(`${ph.id}: unknown cell ${u.table}:${key}`); continue }
    table.set(key, Math.max(table.get(key), target));
  }
  const s = simulate(CE, { blockers: true });
  results.phases.push({ id: ph.id, name: ph.name, ...s });
}
results.problems = problems;

if (process.argv.includes("--json")) {
  process.stdout.write(`${JSON.stringify(results, null, 1)}\n`);
} else {
  const line = (label, s) => `${label.padEnd(44)} full ${String(s.fullPct).padStart(5)}%  partial ${String(s.partialPct).padStart(5)}%  lifecycle full ${s.lifecycleFull}/${D.lifecycle.length}`;
  console.log(`Permutations ${totalPermutations.toLocaleString("en")}; valid scenarios ${results.coreedgeToday.validScenarios.toLocaleString("en")}`);
  console.log(line("SAP Integration Suite", results.integrationSuite));
  console.log(line("CoreEdge today", results.coreedgeToday));
  for (const p of results.phases) console.log(line(`CoreEdge after ${p.id} ${p.name}`.slice(0, 44), p));
  console.log("\nTop blockers today (leverage = share of not-fully-supported scenarios):");
  for (const b of results.coreedgeToday.topBlockers.slice(0, 15)) console.log(`  ${b.cell.padEnd(48)} ${String(b.leveragePct).padStart(5)}%  sole ${b.soleBlocker}`);
  if (problems.length) console.log(`\n${problems.length} matrix problems:\n  ${problems.slice(0, 20).join("\n  ")}`);
}
