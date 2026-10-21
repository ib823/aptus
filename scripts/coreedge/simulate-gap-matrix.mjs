#!/usr/bin/env node
/**
 * Re-runs the CoreEdge gap simulation.
 *
 *   node scripts/coreedge/simulate-gap-matrix.mjs            # human summary
 *   node scripts/coreedge/simulate-gap-matrix.mjs --json     # full results as JSON
 *
 * INPUTS. docs/coreedge/gap-matrix.json holds the dimensions, the SAP
 * feasibility tables, Integration Suite's cells and the roadmap phases.
 * CoreEdge's cells TODAY come from docs/coreedge/capability-registry.json,
 * which `pnpm coreedge:registry` generates from the code
 * (src/lib/coreedge/capability-registry.ts, P0.15); they are no longer rated by
 * hand in the matrix.
 *
 * A scenario is one value from each of eight dimensions (target, tech, pattern,
 * origin, network, sapAuth, consumer, consumerAuth). It is VALID when SAP itself
 * makes it possible (every sapFeasibility cell is yes or partial). A platform
 * supports a valid scenario FULLY when every cell the scenario touches is full,
 * and AT LEAST PARTLY when every such cell is at least partial (the min rule).
 *
 * Roadmap phases apply their cellUpgrades cumulatively to CoreEdge today; an
 * upgrade never lowers a cell. sapAuth may be rated per target (row = target,
 * col = auth) or for every target at once (row = auth, col = "").
 *
 * HOSTING (caveat 8d). Network reach depends on where CoreEdge runs. The
 * headline is the registry's `headlineHosting` (the hosted instance); the run
 * also reports CoreEdge today under each hosting mode.
 *
 * EXTENDED MODEL (caveat 8a-c). The matrix's `extendedModel` adds targets,
 * technologies and consumer types. It is simulated separately (no blockers)
 * and never mixed into the headline figures.
 *
 * Blocker leverage: for every valid scenario a platform does not fully support,
 * each of its below-full cells gets an equal share (1/k of the scenario). A cell's
 * leverage is the sum of its shares; "sole" counts scenarios where it is the only
 * thing below full. Both rank what to build next.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const docs = join(here, "..", "..", "docs", "coreedge");
export const MATRIX_PATH = join(docs, "gap-matrix.json");
export const REGISTRY_PATH = join(docs, "capability-registry.json");

const SCORE = { full: 2, partial: 1, none: 0, yes: 2, no: 0 };
const TABLES = ["targetTech", "techPattern", "network", "origin", "sapAuth", "consumerAuth", "lifecycle"];

export function loadInputs() {
  return {
    matrix: JSON.parse(readFileSync(MATRIX_PATH, "utf8")),
    registry: JSON.parse(readFileSync(REGISTRY_PATH, "utf8")),
  };
}

const pct = (n, d) => (d ? Math.round((1000 * n) / d) / 10 : 0);

/**
 * The whole simulation as one pure function of its two inputs. With
 * `withCellLevels`, also returns every CoreEdge cell's level after each step
 * (today, then each phase), for "reaches full in" columns.
 */
export function simulateAll({ matrix, registry }, { withCellLevels = false } = {}) {
  const problems = [];
  const core = matrix.dimensions;

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
  function sapAuthMap(cells, D, label) {
    const m = new Map();
    for (const c of cells ?? []) {
      if (c.col) m.set(`${c.row}|${c.col}`, SCORE[c.status] ?? 0);
      else for (const t of D.target) if (!m.has(`${t}|${c.row}`)) m.set(`${t}|${c.row}`, SCORE[c.status] ?? 0);
    }
    for (const t of D.target) for (const a of D.sapAuth) if (!m.has(`${t}|${a}`)) { m.set(`${t}|${a}`, 0); problems.push(`missing ${label} ${t}|${a}`) }
    return m;
  }
  function platform(p, D, label) {
    return {
      targetTech: pairMap(p.targetTech, D.target, D.tech, `${label}.targetTech`),
      techPattern: pairMap(p.techPattern, D.tech, D.pattern, `${label}.techPattern`),
      network: singleMap(p.network, D.network, `${label}.network`),
      origin: singleMap(p.origin, D.origin, `${label}.origin`),
      sapAuth: sapAuthMap(p.sapAuth, D, `${label}.sapAuth`),
      consumerAuth: pairMap(p.consumerAuth, D.consumer, D.consumerAuth, `${label}.consumerAuth`),
      lifecycle: singleMap(p.lifecycle, D.lifecycle, `${label}.lifecycle`),
    };
  }

  function model(D, sap, label) {
    const S = {
      avail: pairMap(sap.avail, D.target, D.tech, `${label}sap.avail`),
      authAvail: pairMap(sap.authAvail, D.target, D.sapAuth, `${label}sap.authAvail`),
      techPattern: pairMap(sap.techPattern, D.tech, D.pattern, `${label}sap.techPattern`),
      originAvail: pairMap(sap.originAvail, D.target, D.origin, `${label}sap.originAvail`),
      netApplicable: pairMap(sap.netApplicable, D.target, D.network, `${label}sap.netApplicable`),
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
    return { D, valid, consumerPairs, totalPermutations };
  }

  function simulate(M, P, { blockers = false } = {}) {
    const { D, valid, consumerPairs } = M;
    let n = 0, full = 0, part = 0;
    const by = { target: {}, tech: {}, pattern: {}, origin: {}, network: {}, consumer: {} };
    const leverage = new Map();
    const sole = new Map();
    const bump = (o, k, v, f, p) => { const e = (o[k] ??= { valid: 0, full: 0, partial: 0 }); e.valid += v; e.full += f; e.partial += p };
    /*
     * The consumer side never affects validity, so each SAP-side tuple is
     * counted against every consumer at once: per consumer, how many of its
     * logins are full and how many at least partial. The min rule then needs
     * only the SAP side's own minimum. Same counts as one scenario at a time,
     * about thirty times fewer steps.
     */
    const perConsumer = D.consumer.map((c) => {
      const logins = consumerPairs.filter(([cc]) => cc === c).map(([, a]) => [`consumerAuth:${c}|${a}`, P.consumerAuth.get(`${c}|${a}`)]);
      return { c, logins, total: logins.length, full: logins.filter((l) => l[1] === 2).length, partial: logins.filter((l) => l[1] >= 1).length };
    });
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
      let tv = 0, tf = 0, tp = 0;
      for (const pc of perConsumer) {
        const f = baseMin === 2 ? pc.full : 0;
        const p = baseMin >= 1 ? pc.partial : 0;
        tv += pc.total; tf += f; tp += p;
        bump(by.consumer, pc.c, pc.total, f, p);
        if (blockers && f < pc.total) {
          for (const [key, ca] of pc.logins) {
            if (baseMin === 2 && ca === 2) continue;
            const k = baseWeak.length + (ca < 2 ? 1 : 0);
            const share = 1 / k;
            for (const [bk] of baseWeak) leverage.set(bk, (leverage.get(bk) ?? 0) + share);
            if (ca < 2) leverage.set(key, (leverage.get(key) ?? 0) + share);
            if (k === 1) {
              const only = ca < 2 ? key : baseWeak[0][0];
              sole.set(only, (sole.get(only) ?? 0) + 1);
            }
          }
        }
      }
      n += tv; full += tf; part += tp;
      bump(by.target, t, tv, tf, tp); bump(by.tech, tech, tv, tf, tp); bump(by.pattern, pat, tv, tf, tp);
      bump(by.origin, org, tv, tf, tp); bump(by.network, net, tv, tf, tp);
    }
    const shape = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { valid: v.valid, fullPct: pct(v.full, v.valid), partialPct: pct(v.partial, v.valid) }]));
    const lifecycle = Object.fromEntries(D.lifecycle.map((s) => [s, P.lifecycle.get(s)]));
    return {
      validScenarios: n, fullySupported: full, atLeastPartial: part, fullPct: pct(full, n), partialPct: pct(part, n),
      lifecycleFull: Object.values(lifecycle).filter((v) => v === 2).length,
      by: Object.fromEntries(Object.entries(by).map(([k, v]) => [k, shape(v)])),
      lifecycle,
      topBlockers: blockers
        ? [...leverage.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, 30)
            .map(([cell, lev]) => ({ cell, level: levelOf(P, cell), leverage: Math.round(lev), leveragePct: pct(lev, n), soleBlocker: sole.get(cell) ?? 0 }))
        : undefined,
    };
  }

  function levelOf(P, key) {
    const [table, rest] = key.split(/:(.*)/s);
    return ["none", "partial", "full"][P[table].get(rest)];
  }

  function applyUpgrades(CE, D, ph) {
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
  }

  const today = registry.coreedgeToday;
  for (const t of TABLES) if (!Array.isArray(today?.[t])) problems.push(`registry: coreedgeToday.${t} missing`);
  const headlineHosting = registry.headlineHosting;

  /* ── the core model: the headline ── */
  const M = model(core, matrix.sapFeasibility, "");
  const IS = platform(matrix.integrationSuite, core, "integrationSuite");
  const results = {
    totalPermutations: M.totalPermutations,
    lifecycleStages: core.lifecycle.length,
    headlineHosting,
    integrationSuite: simulate(M, IS),
    coreedgeToday: simulate(M, platform(today, core, "coreedgeToday"), { blockers: true }),
    coreedgeTodayByHosting: {},
    phases: [],
  };
  for (const [hosting, network] of Object.entries(registry.networkByHosting ?? {})) {
    const s = simulate(M, platform({ ...today, network }, core, `coreedgeToday[${hosting}]`));
    results.coreedgeTodayByHosting[hosting] = {
      fullySupported: s.fullySupported, atLeastPartial: s.atLeastPartial, fullPct: s.fullPct, partialPct: s.partialPct,
      network: Object.fromEntries(network.map((c) => [c.row, c.status])),
    };
  }
  const CE = platform(today, core, "coreedgeToday");
  const snapshot = (id) => ({
    id,
    levels: Object.fromEntries(Object.entries(CE).flatMap(([t, m]) => [...m.entries()].map(([k, v]) => [`${t}:${k}`, v]))),
  });
  const cellLevelsByPhase = withCellLevels ? [snapshot("Today")] : [];
  for (const ph of matrix.roadmapPhases ?? []) {
    applyUpgrades(CE, core, ph);
    results.phases.push({ id: ph.id, name: ph.name, ...simulate(M, CE, { blockers: true }) });
    if (withCellLevels) cellLevelsByPhase.push(snapshot(ph.id));
  }
  if (withCellLevels) results.cellLevelsByPhase = cellLevelsByPhase;

  /* ── the extended model (caveat 8a-c), never mixed into the headline ── */
  const ext = matrix.extendedModel;
  if (ext) {
    const XD = {
      ...core,
      target: [...core.target, ...ext.dimensions.target],
      tech: [...core.tech, ...ext.dimensions.tech],
      consumer: [...core.consumer, ...ext.dimensions.consumer],
    };
    const join2 = (a, b) => [...(a ?? []), ...(b ?? [])];
    const XS = Object.fromEntries(
      ["avail", "authAvail", "techPattern", "originAvail", "netApplicable"].map((k) => [k, join2(matrix.sapFeasibility[k], ext.sapFeasibility[k])]),
    );
    const XM = model(XD, XS, "extended.");
    const xIS = { ...matrix.integrationSuite };
    for (const k of ["targetTech", "techPattern", "consumerAuth"]) xIS[k] = join2(matrix.integrationSuite[k], ext.integrationSuite[k]);
    const xToday = { ...today };
    for (const k of ["targetTech", "techPattern", "consumerAuth"]) xToday[k] = join2(today[k], registry.extended?.[k]);
    const summary = (s) => ({ validScenarios: s.validScenarios, fullySupported: s.fullySupported, atLeastPartial: s.atLeastPartial, fullPct: s.fullPct, partialPct: s.partialPct, by: s.by });
    const xCE = platform(xToday, XD, "extended.coreedgeToday");
    results.extended = {
      dimensions: ext.dimensions,
      totalPermutations: XM.totalPermutations,
      integrationSuite: summary(simulate(XM, platform(xIS, XD, "extended.integrationSuite"))),
      coreedgeToday: summary(simulate(XM, xCE)),
      phases: [],
    };
    for (const ph of matrix.roadmapPhases ?? []) {
      applyUpgrades(xCE, XD, ph);
      const s = simulate(XM, xCE);
      results.extended.phases.push({ id: ph.id, fullySupported: s.fullySupported, atLeastPartial: s.atLeastPartial, fullPct: s.fullPct, partialPct: s.partialPct });
    }
  }

  results.problems = problems;
  return results;
}

function main() {
  const results = simulateAll(loadInputs());
  if (process.argv.includes("--json")) {
    process.stdout.write(`${JSON.stringify(results, null, 1)}\n`);
    return;
  }
  const L = results.lifecycleStages;
  const line = (label, s) => `${label.padEnd(44)} full ${String(s.fullPct).padStart(5)}%  partial ${String(s.partialPct).padStart(5)}%  lifecycle full ${s.lifecycleFull}/${L}`;
  console.log(`Permutations ${results.totalPermutations.toLocaleString("en")}; valid scenarios ${results.coreedgeToday.validScenarios.toLocaleString("en")}`);
  console.log(line("SAP Integration Suite", results.integrationSuite));
  console.log(line(`CoreEdge today (${results.headlineHosting})`, results.coreedgeToday));
  for (const p of results.phases) console.log(line(`CoreEdge after ${p.id} ${p.name}`.slice(0, 44), p));
  console.log("\nCoreEdge today by hosting mode:");
  for (const [h, s] of Object.entries(results.coreedgeTodayByHosting)) console.log(`  ${h.padEnd(12)} full ${String(s.fullPct).padStart(5)}%  partial ${String(s.partialPct).padStart(5)}%`);
  if (results.extended) {
    const x = results.extended;
    console.log(`\nExtended model (caveat 8): permutations ${x.totalPermutations.toLocaleString("en")}; valid ${x.coreedgeToday.validScenarios.toLocaleString("en")}`);
    console.log(`  Integration Suite full ${x.integrationSuite.fullPct}% partial ${x.integrationSuite.partialPct}%; CoreEdge today full ${x.coreedgeToday.fullPct}% partial ${x.coreedgeToday.partialPct}%`);
  }
  console.log("\nTop blockers today (leverage = share of not-fully-supported scenarios):");
  for (const b of results.coreedgeToday.topBlockers.slice(0, 15)) console.log(`  ${b.cell.padEnd(48)} ${String(b.leveragePct).padStart(5)}%  sole ${b.soleBlocker}`);
  if (results.problems.length) console.log(`\n${results.problems.length} matrix problems:\n  ${results.problems.slice(0, 20).join("\n  ")}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();
