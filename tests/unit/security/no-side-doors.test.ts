// @vitest-environment node
/**
 * A.3 #9 — NO SIDE DOORS (roadmap P0.14b).
 *
 * "A static test proves every route reaching SAP uses the pipeline and writes
 * an audit row, or is on a reviewed exemption list." This is that test.
 *
 * HOW "REACHES SAP" IS DECIDED: from the code, not from a list of routes.
 * tests/helpers/sap-reach.ts builds a call graph of src/ with the TypeScript
 * parser. Every binding that calls the global `fetch` is classified below —
 * SAP (or Ariba) or not — and the census is pinned, so a new request to
 * anywhere fails here until someone says what it is. A route reaches SAP when
 * one of its handlers mentions, through any number of modules, a binding that
 * reaches a SAP fetch. A route is every `route.ts` under src/app, route groups
 * included; every other way in — a page, a layout, a server component, a
 * server action, middleware — may not reach SAP at all.
 *
 * HOW "USES THE PIPELINE" IS DECIDED: every mention of a SAP-reaching binding
 * on a handler's path must be either a step of the broker pipeline
 * (src/lib/governed/pipeline.ts: `callSapRead`, `callSapWrite` …) or made
 * inside the callback a console call's `callSap` / `callSapWrite` takes
 * (src/lib/governed/console.ts), which refuses to run until the console's
 * authorise, bind and contain steps have passed (tests/unit/governed/
 * console.test.ts). A SAP-reaching function value that LEAVES that callback
 * (returned, assigned out, pushed onto an outer array) runs after the call
 * was recorded and fails the check; a closure handed out through a call the
 * callback makes, or by a helper it calls, is not followed (sap-reach.ts
 * `escapingFrom` names the limits), so review still reads callSap callbacks.
 *
 * HOW "WRITES AN AUDIT ROW" IS DECIDED: a route on the broker pipeline builds
 * its `GovernedAudit`; a console read's `callSap` writes the organization's
 * console row and the platform-scope row itself, so the route must open its
 * call with `openConsoleCall`; a write-back's `callSapWrite` takes the handle
 * of the row P0.7's fail-closed `beginPlatformAudit` wrote (and
 * sap-write-audit-coverage.test.ts checks the order).
 *
 * THE EXEMPTIONS are the routes that reach SAP outside the pipeline today,
 * each with what it reads, what records it, and when it moves. None is a
 * Workbench console route (/api/sap/*): P0.14b moved all of them. A.3 #9 must
 * pass for the Workbench write-back by P0 (it does: no exemption) and for all
 * routes by P3. An exemption that no longer reaches SAP outside the pipeline
 * fails here too, so the list cannot go stale.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

import {
  buildSapGraph,
  isRouteModule,
  keyOf,
  mentionedTargets,
  routeAliases,
  routeFindings,
  routeReaches,
  routeReachesOwn,
  untracedGovernedCalls,
  type SapGraph,
  type SourceInput,
} from "../../helpers/sap-reach";

const ROOT = path.resolve(__dirname, "../../..");

/** Every binding in server code that sends a request to SAP or Ariba, and what it reaches. */
const SAP_FETCHERS: Record<string, string> = {
  "src/lib/sap-public/tdd-connector.ts#sapFetch": "the Workbench connector: every OData and token request of the console",
  "src/lib/sap-public/ariba-connector.ts#aribaFetch": "the Ariba realm and its OAuth token endpoint",
  "src/lib/northbound/read.ts#readEntitySet": "the broker's read executor (its default fetch)",
  "src/lib/northbound/read.ts#readQuery": "the query surface's read executor (its default fetch, P1.4)",
  "src/lib/northbound/write.ts#writeEntitySet": "the broker's write executor (its default fetch)",
  "src/lib/governed/transport.ts#directFetch": "the pipeline's DIRECT transport",
  "src/lib/sap-public/connection-resolver.ts#fetchOAuthTokenFromConnection": "a stored connection's OAuth token endpoint",
  "src/lib/sap-public/connection-resolver.ts#fetchSamlBearerToken": "a stored connection's SAML bearer token endpoint",
  "src/lib/sap-public/oauth-saml-bearer.ts#exchangeSamlBearerAssertion": "SuccessFactors' token endpoint",
  "src/lib/sap-public/rotation-probe.ts#probeRotation": "the probe of a rotated secret before it is stored (P0.14)",
  "src/lib/studio/connection-health.ts#fetchMetadataDocument": "a connection's $metadata",
  "src/lib/studio/connection-health.ts#probeConnection": "a connection's sign-in and $metadata",
  "src/lib/studio/service-verify.ts#verifyServiceMetadata": "a customer-built service's $metadata (P1.1)",
};

/** Every other binding in server code that calls `fetch`, and where it goes instead. */
const NOT_SAP_FETCHERS: Record<string, string> = {
  "src/app/api/catalog/setup-guide/[scopeItemId]/route.ts#GET": "a setup-guide PDF in Vercel Blob storage",
  "src/app/api/sap/tdd/hub-content/api-reference-import/route.ts#POST":
    "the committed API catalogue file on raw.githubusercontent.com, at the deployed commit",
  "src/lib/sap-public/hub-harvest-remote.ts#fetchHarvestRows": "the committed harvest files on raw.githubusercontent.com",
  "src/app/(external)/c/sign/route.ts#POST":
    "this application's own /api/presales/sign-pdf, then the signed PDF it stored in Vercel Blob storage",
  "src/lib/analyzer/classifier.ts#classifyBatch": "the Anthropic API",
  "src/lib/intelligence/ai-orchestrator.ts#AIOrchestrator": "the configured LLM providers",
  "src/lib/auth/step-up-client.ts#fetchWithStepUp": "this application's own API, from the browser",
  "src/lib/auth/step-up-client.ts#runStepUpCeremony": "this application's own passkey endpoints, from the browser",
  "src/lib/navigation/safe-push.ts#safePush": "this application's own pages, from the browser",
};

/**
 * Bindings that mention a SAP-reaching function only to BUILD something that
 * calls it later — reach does not pass through them. Each is checked below:
 * every such mention must sit inside a closure, never be a call it makes.
 */
const CUTS: Record<string, string> = {
  "src/lib/sap-public/connection-resolver.ts#toSapTenant":
    "projects a stored connection as a Workbench tenant; the credential closures it builds run only when the connector sends — inside a console call's callSap",
};

/** The broker pipeline and the console's: a mention of a binding exported here is a pipeline step. */
const PIPELINE_MODULES = new Set(["src/lib/governed/pipeline.ts", "src/lib/governed/console.ts"]);

const AUDIT = {
  governed: keyOf("src/lib/governed/pipeline.ts", "GovernedAudit"),
  console: keyOf("src/lib/governed/console.ts", "openConsoleCall"),
  begin: keyOf("src/lib/audit/platform-audit.ts", "beginPlatformAudit"),
  complete: keyOf("src/lib/audit/platform-audit.ts", "completePlatformAudit"),
};

/**
 * THE REVIEWED EXEMPTIONS: routes that reach SAP outside the governed pipeline.
 * None reads business data on a person's or an application's behalf; each is a
 * probe of a system's reachability or of a definition, and each is recorded.
 */
const EXEMPT: Record<string, { reads: string; recorded: string; moves: string }> = {
  "src/app/api/studio/connections/route.ts": {
    reads: "the sign-in and $metadata of a ROTATED secret, sent once before it replaces a working one (P0.14 probe-before-swap)",
    recorded:
      "the save's ConfigAudit row (rotationProbe); a refused save's TEST_CONNECT row; and, when a probe reached SAP but the save did not happen, a TEST_CONNECT connection_rotation_probed row",
    moves: "cannot bind through the pipeline: the secret under test is not stored yet; P4.1 gives it the dispatcher",
  },
  "src/app/api/studio/connections/[id]/test/route.ts": {
    reads: "a builder's Test of their own stored connection: sign-in and $metadata, no business data",
    recorded: "a ConfigAudit row and the connection's health columns",
    moves: "P4.1 (the probe moves onto the pipeline's transport); by P3 for A.3 #9",
  },
  "src/app/api/studio/interfaces/[id]/verify-service/route.ts": {
    reads: "a customer-built service's $metadata before an interface may name it (P1.1); the Contract Compiler parses that same answer in its worker, with no request of its own (P1.3)",
    recorded: "a ConfigAudit row and the service verification, and the contract compiled from the answer (a ContractSnapshot, P1.3)",
    moves: "P4.1; by P3 for A.3 #9",
  },
  "src/app/api/coreedge/lanes/recheck/route.ts": {
    reads: "one proven read per lane, through the lane sweep's own binding (P0.2 predicate)",
    recorded: "a ConfigAudit row and the lane evidence",
    moves: "P3 (the sweep runs as a pipeline principal of its own)",
  },
  "src/app/api/cron/lane-checks/route.ts": {
    reads: "the nightly lane sweep: the same proven reads, for every live lane",
    recorded: "recordCronRun and the lane evidence",
    moves: "P3, with the manual re-check",
  },
  "src/app/api/cron/connection-probes/route.ts": {
    reads: "the nightly connection probe: sign-in and $metadata",
    recorded: "recordCronRun and a SapConnectionProbeEvent per connection",
    moves: "P4.1, with the connection Test",
  },
  "src/app/api/ops/connections-health/probe/route.ts": {
    reads: "Probe now: the nightly connection probe, on demand",
    recorded: "a SapConnectionProbeEvent (source manual)",
    moves: "P4.1, with the connection Test",
  },
};

/** Workbench routes that import a SAP connector and must NOT reach SAP: they serve configuration. */
const CONFIG_ONLY = [
  "src/app/api/sap/tdd/catalog/route.ts",
  "src/app/api/sap/ariba/catalog/route.ts",
  "src/app/api/sap/tdd/hub-content/seed/route.ts",
];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(name) && !name.endsWith(".d.ts") ? [p] : [];
  });
}

const SOURCES: SourceInput[] = walk(path.join(ROOT, "src")).map((f) => ({
  file: path.relative(ROOT, f).split(path.sep).join("/"),
  src: readFileSync(f, "utf8"),
}));

/**
 * A Next.js route handler: `route.ts` ANYWHERE under src/app. A route group —
 * src/app/(external)/c/sign/route.ts — is as much a route as src/app/api/ is,
 * and this test scanned only the latter (P0.14b review).
 */
const isRouteFile = isRouteModule;

const fileOf = (key: string) => key.slice(0, key.indexOf("#"));

/** The directive prologue a module opens with: "use client", "use server". */
function directives(g: SapGraph, file: string): Set<string> {
  const out = new Set<string>();
  for (const stmt of g.modules.get(file)?.sf.statements ?? []) {
    if (!ts.isExpressionStatement(stmt) || !ts.isStringLiteral(stmt.expression)) break;
    out.add(stmt.expression.text);
  }
  return out;
}

/**
 * Server code: every module that is not a "use client" one, wherever it lives
 * — a page, a layout, a route in a route group, middleware.ts. A client
 * module's `fetch` runs in the browser, with no credential to send to SAP.
 */
const serverFetchers = (g: SapGraph) => g.fetchers.filter((k) => !directives(g, fileOf(k)).has("use client"));

/**
 * A way into SAP that is not a route handler: a SAP-reaching binding in a page,
 * a layout or any other server component, a server action ("use server"),
 * middleware.ts or instrumentation.ts. A route's handlers are checked against
 * the pipeline above; nothing else may reach SAP at all. Shared code that
 * reaches SAP lives in src/lib (outside a "use server" module), where every
 * route that mentions it is checked.
 */
function sideEntrances(g: SapGraph): string[] {
  return [...g.reaching]
    .filter((key) => {
      const file = fileOf(key);
      if (isRouteFile(file)) return false;
      return !file.startsWith("src/lib/") || directives(g, file).has("use server");
    })
    .sort();
}

const ROUTES = SOURCES.map((s) => s.file).filter(isRouteFile);

const graph = buildSapGraph(SOURCES, { sapFetchers: new Set(Object.keys(SAP_FETCHERS)), cuts: new Set(Object.keys(CUTS)) });

/**
 * What a compliant route writes, or why it does not. Empty when it is audited.
 *
 * A route that re-exports another route's handler (P1.10's v1 aliases) writes
 * what that route writes: it is judged by that route's findings, and by its
 * own only where it reaches SAP through code of its own (review round 5).
 */
function auditFindings(g: SapGraph, file: string, judging: ReadonlySet<string> = new Set()): string[] {
  if (judging.has(file)) return [];
  const findings: string[] = [];
  const aliases = routeAliases(g, file);
  for (const source of new Set(aliases.map((a) => a.source))) {
    for (const f of auditFindings(g, source, new Set([...judging, file]))) findings.push(`${f} (in ${source}, whose handler this route re-exports)`);
  }
  if (aliases.length > 0 && !routeReachesOwn(g, file)) return findings;
  const src = g.modules.get(file)?.sf.text ?? "";
  const used = mentionedTargets(g, file);
  if (/\.callSap\s*\(/.test(src) && !used.has(AUDIT.console)) findings.push("calls callSap( without opening the call with openConsoleCall");
  // Each call, not the file: a mention of openConsoleCall elsewhere does not
  // make `{ callSap: (fn) => fn() }.callSap(...)` a console call (review round 3).
  for (const c of untracedGovernedCalls(g, file, PIPELINE_MODULES)) {
    findings.push(`calls ${c.method}( on ${c.receiver} (line ${c.line}), which is not a console call opened with openConsoleCall`);
  }
  if (/\.callSapWrite\s*\(/.test(src) && !(used.has(AUDIT.begin) && used.has(AUDIT.complete))) {
    findings.push("sends a write without P0.7's beginPlatformAudit / completePlatformAudit");
  }
  if (![AUDIT.governed, AUDIT.console, AUDIT.begin].some((a) => used.has(a))) {
    findings.push("writes no audit row: no GovernedAudit, no console call, no platform audit");
  }
  return findings;
}

describe("every request CoreEdge's server code sends is classified", () => {
  it("the census of `fetch` callers is exactly the two tables", () => {
    const census = serverFetchers(graph).sort();
    expect(
      census,
      "A server binding calls fetch and is not classified. If it reaches SAP or Ariba, add it to SAP_FETCHERS (its routes\n" +
        "must then use the pipeline or be exempted); otherwise add it to NOT_SAP_FETCHERS with where it goes.",
    ).toEqual([...Object.keys(SAP_FETCHERS), ...Object.keys(NOT_SAP_FETCHERS)].sort());
  });

  it("each cut only builds a closure: every mention of a reaching binding is inside a function it returns", () => {
    const uncut = graph;
    for (const cut of Object.keys(CUTS)) {
      expect(uncut.reachingIgnoringCuts.has(cut), `${cut} does not reach SAP even uncut: remove the cut`).toBe(true);
      const file = cut.slice(0, cut.indexOf("#"));
      for (const { ref, at } of uncut.refs(cut)) {
        if (!uncut.targets(file, ref).some((t) => uncut.reachingIgnoringCuts.has(t))) continue;
        let inClosure = false;
        for (let n: ts.Node | undefined = at.parent; n && n !== uncut.modules.get(file)!.bindings.get(cut.split("#")[1]!)!.node; n = n.parent) {
          if (ts.isArrowFunction(n) || ts.isFunctionExpression(n)) inClosure = true;
        }
        expect(inClosure, `${cut} calls a SAP-reaching binding directly; it is not a builder, so it cannot be cut`).toBe(true);
      }
    }
  });
});

/*
 * P1.4: the query surface's executor has one binding, callSapQuery in the
 * pipeline, which reports its outcome to the breaker by the query's rule and
 * is handed a URL compiled from the checked AST. Nothing else in src/ may
 * mention readQuery, so no route can send a query the pipeline did not build.
 */
describe("the query surface's executor is reached only through the pipeline", () => {
  it("only src/lib/governed/pipeline.ts mentions readQuery", () => {
    const executor = "src/lib/northbound/read.ts#readQuery";
    const mentioning = [...graph.modules.keys()].filter((file) => file !== "src/lib/northbound/read.ts" && mentionedTargets(graph, file).has(executor));
    expect(mentioning).toEqual(["src/lib/governed/pipeline.ts"]);
  });
});

describe("A.3 #9: every route that reaches SAP uses the pipeline and writes an audit row", () => {
  const reaching = ROUTES.filter((r) => routeReaches(graph, r)).sort();

  it("finds the routes that reach SAP — the check is not vacuous", () => {
    for (const known of [
      "src/app/api/northbound/interfaces/[id]/data/route.ts",
      "src/app/api/northbound/interfaces/[id]/data/write/route.ts",
      "src/app/api/studio/test/broker-run/route.ts",
      "src/app/api/sap/tdd/preview/route.ts",
      "src/app/api/sap/tdd/write/route.ts",
      "src/app/api/sap/ariba/call/route.ts",
    ]) {
      expect(reaching, known).toContain(known);
    }
  });

  it("scans every route handler under src/app, route groups included (P0.14b review)", () => {
    expect(ROUTES).toContain("src/app/(external)/c/sign/route.ts");
    expect(ROUTES.some((r) => !r.startsWith("src/app/api/"))).toBe(true);
  });

  it("nothing but a route handler reaches SAP: no page, layout, server action, middleware or instrumentation", () => {
    expect(
      sideEntrances(graph),
      "These bindings reach SAP from outside a route handler, where no pipeline and no audit row is checked. Make the\n" +
        "call from a route handler on the pipeline, or move shared SAP code into src/lib (not a \"use server\" module).",
    ).toEqual([]);
  });

  it("the Workbench's catalogue and seed routes make no live call (they serve configuration)", () => {
    for (const file of CONFIG_ONLY) expect(routeReaches(graph, file), file).toBe(false);
  });

  it("every reaching route is on the pipeline, or on the reviewed exemption list", () => {
    const offenders = reaching
      .filter((r) => !(r in EXEMPT))
      .map((r) => ({ route: r, findings: routeFindings(graph, r, PIPELINE_MODULES) }))
      .filter((o) => o.findings.length > 0);
    expect(
      offenders,
      "These routes reach SAP outside the governed pipeline:\n" +
        offenders
          .map((o) => `  ${o.route}\n${o.findings.map((f) => `    ${f.handler} line ${f.line}: ${f.via} -> ${f.target}`).join("\n")}`)
          .join("\n") +
        "\nMake the SAP call inside a console call's callSap (src/lib/governed/console.ts) or a pipeline step, or add the\n" +
        "route to EXEMPT with what it reads, what records it and when it moves.",
    ).toEqual([]);
  });

  it("every route on the pipeline writes an audit row", () => {
    const unaudited = reaching
      .filter((r) => !(r in EXEMPT))
      .map((r) => ({ route: r, findings: auditFindings(graph, r) }))
      .filter((o) => o.findings.length > 0);
    expect(unaudited).toEqual([]);
  });

  it("every exemption still reaches SAP outside the pipeline — the list cannot go stale", () => {
    for (const route of Object.keys(EXEMPT)) {
      expect(ROUTES, `${route} no longer exists: remove its exemption`).toContain(route);
      expect(routeFindings(graph, route, PIPELINE_MODULES).length, `${route} is on the pipeline now: remove its exemption`).toBeGreaterThan(0);
    }
  });

  /*
   * AN EXEMPT ROUTE KEEPS A TWIN CONNECTION OFF THE CUSTOMER'S SAP (wave 2
   * integration review round 4). An exemption fetches with the platform's own
   * fetch and a stored connection's credentials, outside the pipeline's bind
   * step, so each must ask transport.ts `reachedDirectly` itself: Verify
   * service did not, and sent a TWIN connection's credentials to its base URL
   * and recorded the answer as the write gate's verification. Each chain is
   * the route, then each module it imports on the way to the check; the
   * behaviour is tests/integration/twin-transport-consumers.test.ts.
   */
  const TWIN_GUARD: Record<keyof typeof EXEMPT, readonly string[]> = {
    "src/app/api/studio/connections/route.ts": ["src/lib/sap-public/rotation-probe.ts"],
    "src/app/api/studio/connections/[id]/test/route.ts": [],
    "src/app/api/studio/interfaces/[id]/verify-service/route.ts": [],
    "src/app/api/coreedge/lanes/recheck/route.ts": ["src/lib/ops/lane-check-sweep.ts", "src/lib/coreedge/lane-authorisation.ts"],
    "src/app/api/cron/lane-checks/route.ts": ["src/lib/ops/lane-check-sweep.ts", "src/lib/coreedge/lane-authorisation.ts"],
    "src/app/api/cron/connection-probes/route.ts": ["src/lib/ops/connection-probe-sweep.ts"],
    "src/app/api/ops/connections-health/probe/route.ts": ["src/lib/ops/connection-probe-sweep.ts"],
  };

  it("every exemption asks reachedDirectly before it sends a stored connection's credentials (review round 4)", () => {
    expect(Object.keys(TWIN_GUARD).sort()).toEqual(Object.keys(EXEMPT).sort());
    const code = (file: string) => {
      const src = SOURCES.find((s) => s.file === file)?.src;
      expect(src, `${file} is not in src`).toBeDefined();
      return src!.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    };
    for (const [route, chain] of Object.entries(TWIN_GUARD)) {
      const files = [route, ...chain];
      for (let i = 0; i + 1 < files.length; i++) {
        const next = files[i + 1]!.replace(/^src\//, "@/").replace(/\.ts$/, "");
        expect(code(files[i]!), `${files[i]} does not import ${next}`).toContain(`"${next}"`);
      }
      expect(code(files.at(-1)!), `${route}: ${files.at(-1)} does not ask reachedDirectly`).toMatch(/\breachedDirectly\(/);
    }
  });

  it("no Workbench console route and no broker route is exempt (P0.14b)", () => {
    for (const route of Object.keys(EXEMPT)) {
      expect(route.startsWith("src/app/api/sap/"), route).toBe(false);
      expect(route.startsWith("src/app/api/northbound/"), route).toBe(false);
    }
    // Every Workbench route that reaches SAP is on the pipeline.
    const workbench = reaching.filter((r) => r.startsWith("src/app/api/sap/"));
    expect(workbench).toEqual([
      "src/app/api/sap/ariba/call/route.ts",
      "src/app/api/sap/tdd/capabilities/route.ts",
      "src/app/api/sap/tdd/entities/route.ts",
      "src/app/api/sap/tdd/hub-content/[id]/route.ts",
      "src/app/api/sap/tdd/hub-content/probe-all/route.ts",
      "src/app/api/sap/tdd/hub-content/route.ts",
      "src/app/api/sap/tdd/hub-content/write-test/route.ts",
      "src/app/api/sap/tdd/operations/route.ts",
      "src/app/api/sap/tdd/preview/route.ts",
      // P1.2: the tenant's own Gateway catalogue, listed inside callSap.
      "src/app/api/sap/tdd/tenant-services/route.ts",
      "src/app/api/sap/tdd/write/route.ts",
    ]);
  });
});

/* ── the check itself, on sources written to fail it ─────────────────── */

describe("the check itself", () => {
  const CONNECTOR = {
    file: "src/lib/sap-public/tdd-connector.ts",
    src: `
      async function sapFetch(url: string) { return fetch(url); }
      export async function previewSapEntitySet(t: string) { return sapFetch(t); }
      export function getSapProduct(key: string) { return key ? { key } : null; }
      export type Tenant = { key: string };
    `,
  };
  const CONSOLE = {
    file: "src/lib/governed/console.ts",
    src: `
      export function openConsoleCall() {
        return { async callSap<T>(fn: () => Promise<T>) { return fn(); } };
      }
    `,
  };
  const BARREL = { file: "src/lib/sap-public/index.ts", src: `export * from "./tdd-connector";` };
  const RENAMED = { file: "src/lib/sap-public/reads.ts", src: `export { previewSapEntitySet as peek } from "./tdd-connector";` };
  const ROUTE = "src/app/api/sap/tdd/new/route.ts";
  const PIPE = new Set(["src/lib/governed/console.ts"]);

  function check(routeSrc: string, extra: readonly SourceInput[] = []) {
    const g = buildSapGraph([CONNECTOR, CONSOLE, BARREL, RENAMED, ...extra, { file: ROUTE, src: routeSrc }], {
      sapFetchers: new Set(["src/lib/sap-public/tdd-connector.ts#sapFetch"]),
      cuts: new Set(),
    });
    return { reaches: routeReaches(g, ROUTE), findings: routeFindings(g, ROUTE, PIPE).map((f) => f.via), audit: auditFindings(g, ROUTE) };
  }

  it("fails a route that calls the connector directly", () => {
    const r = check(`import { previewSapEntitySet } from "@/lib/sap-public/tdd-connector";
      export async function GET() { return previewSapEntitySet("x"); }`);
    expect(r.reaches).toBe(true);
    expect(r.findings).toEqual(["previewSapEntitySet"]);
  });

  it("passes the same call made inside a console call's callSap, and requires its audit", () => {
    const r = check(`import { previewSapEntitySet } from "@/lib/sap-public/tdd-connector";
      import { openConsoleCall } from "@/lib/governed/console";
      export async function GET() { const call = openConsoleCall(); return call.callSap(() => previewSapEntitySet("x")); }`);
    expect(r).toEqual({ reaches: true, findings: [], audit: [] });
  });

  it("does not count a route that only reads configuration from the connector", () => {
    expect(check(`import { getSapProduct, type Tenant } from "@/lib/sap-public/tdd-connector";
      export async function GET() { const t: Tenant = { key: "a" }; return getSapProduct(t.key); }`).reaches).toBe(false);
  });

  it("follows a module-local helper, and an inner function, onto the handler's path", () => {
    const helper = check(`import { previewSapEntitySet } from "@/lib/sap-public/tdd-connector";
      async function load() { return previewSapEntitySet("x"); }
      export async function GET() { return load(); }`);
    expect(helper.findings).toEqual(["previewSapEntitySet"]);
    const inner = check(`import { previewSapEntitySet } from "@/lib/sap-public/tdd-connector";
      export async function GET() { async function worker() { return previewSapEntitySet("x"); } return worker(); }`);
    expect(inner.findings).toEqual(["previewSapEntitySet"]);
    // The same inner function, run only inside callSap, is governed.
    const governed = check(`import { previewSapEntitySet } from "@/lib/sap-public/tdd-connector";
      import { openConsoleCall } from "@/lib/governed/console";
      export async function GET() {
        async function worker() { return previewSapEntitySet("x"); }
        const call = openConsoleCall();
        return call.callSap(() => worker());
      }`);
    expect(governed.findings).toEqual([]);
  });

  it("sees through a namespace import, a barrel, a renamed re-export and a dynamic import", () => {
    expect(check(`import * as sap from "@/lib/sap-public/tdd-connector";
      export async function GET() { return sap.previewSapEntitySet("x"); }`).findings).toEqual(["sap.previewSapEntitySet"]);
    expect(check(`import { previewSapEntitySet } from "@/lib/sap-public";
      export async function GET() { return previewSapEntitySet("x"); }`).findings).toEqual(["previewSapEntitySet"]);
    expect(check(`import { peek } from "../../../../../lib/sap-public/reads";
      export async function GET() { return peek("x"); }`).findings).toEqual(["peek"]);
    expect(check(`export async function GET() { const m = await import("@/lib/sap-public/tdd-connector"); return m; }`).reaches).toBe(true);
  });

  it("fails a route that calls fetch itself, and one on the pipeline that writes no row", () => {
    expect(check(`export async function POST() { return fetch("https://my000001-api.s4hana.cloud.sap/x"); }`).findings).toEqual(["fetch"]);
    // A receiver that is not a console call is not the pipeline (review round 3):
    // the call inside it is a finding, and so is the receiver.
    const unaudited = check(`import { previewSapEntitySet } from "@/lib/sap-public/tdd-connector";
      export async function GET(call: { callSap(f: () => unknown): unknown }) { return call.callSap(() => previewSapEntitySet("x")); }`);
    expect(unaudited.findings).toEqual(["previewSapEntitySet"]);
    expect(unaudited.audit).toContain("calls callSap( without opening the call with openConsoleCall");
  });

  /*
   * P0.14b review round 3: two shapes the check reported compliant once the
   * file mentioned openConsoleCall anywhere.
   */
  describe("only a console call opened in the route is the pipeline", () => {
    const head = `import { previewSapEntitySet } from "@/lib/sap-public/tdd-connector";
      import { openConsoleCall } from "@/lib/governed/console";`;
    const governedPost = `export async function POST() { const call = openConsoleCall(); return call.callSap(() => previewSapEntitySet("x")); }`;
    const HANDLERS: SourceInput = {
      file: "src/lib/sap-public/handlers.ts",
      src: `import { previewSapEntitySet } from "./tdd-connector";
        export async function GET() { return previewSapEntitySet("x"); }`,
    };

    it.each([
      ["re-exported with export { GET } from", `export { GET } from "@/lib/sap-public/handlers";`],
      ["imported, then exported", `import { GET } from "@/lib/sap-public/handlers";\nexport { GET };`],
      ["imported under another name, then exported as GET", `import { GET as handler } from "@/lib/sap-public/handlers";\nexport { handler as GET };`],
    ])("fails a SAP-reaching handler from src/lib %s, beside a governed POST", (_name, exportLine) => {
      const r = check(`${head}\n${exportLine}\n${governedPost}`, [HANDLERS]);
      expect(r.reaches).toBe(true);
      expect(r.findings.length).toBeGreaterThan(0);
    });

    it("passes a handler re-exported from src/lib that does not reach SAP", () => {
      const QUIET: SourceInput = { file: "src/lib/health/handlers.ts", src: `export async function GET() { return new Response("ok"); }` };
      const r = check(`${head}\nexport { GET } from "@/lib/health/handlers";\n${governedPost}`, [QUIET]);
      expect(r).toEqual({ reaches: true, findings: [], audit: [] });
    });

    it.each([
      [
        "an object literal with a callSap method",
        `const direct = { callSap: (fn: () => Promise<unknown>) => fn() };
         return direct.callSap(() => previewSapEntitySet("x"));`,
      ],
      [
        "a let first opened as a console call, then replaced",
        `let other = openConsoleCall();
         other = { callSap: (fn: () => Promise<unknown>) => fn() } as never;
         return other.callSap(() => previewSapEntitySet("x"));`,
      ],
      [
        "a name a console call is assigned to in one handler and something else in another",
        `return call.callSap(() => previewSapEntitySet("x")); }
         export async function PUT() { const call = { callSap: (fn: () => Promise<unknown>) => fn() };
         return call.callSap(() => previewSapEntitySet("y"));`,
      ],
    ])("fails a callSap on %s, in a file that opens a console call elsewhere", (_name, body) => {
      const r = check(`${head}\nexport async function GET() { const call = openConsoleCall(); await call.callSap(async () => 1); ${body} }`);
      expect(r.reaches).toBe(true);
      expect(r.findings).toContain("previewSapEntitySet");
      expect(r.audit.some((f) => /not a console call opened with openConsoleCall/.test(f))).toBe(true);
    });

    /*
     * P0.14b review round 4: a const opened as a console call whose method is
     * then replaced is no console call. A const stops the NAME being rebound,
     * not its methods.
     */
    it.each([
      ["its callSap assigned", `(call as any).callSap = (fn: () => unknown) => fn();`],
      ["its callSap assigned by element access", `(call as Record<string, unknown>)["callSap"] = (fn: () => unknown) => fn();`],
      ["Object.assign over it", `Object.assign(call, { callSap: (fn: () => unknown) => fn() });`],
      ["Object.defineProperty on it", `Object.defineProperty(call, "callSap", { value: (fn: () => unknown) => fn() });`],
      ["Reflect.set on it", `Reflect.set(call, "callSap", (fn: () => unknown) => fn());`],
      ["a destructuring assignment into it", `[(call as any).callSap] = [(fn: () => unknown) => fn()];`],
    ])("fails a callSap on a console call with %s", (_name, mutate) => {
      const r = check(`${head}\nexport async function GET() { const call = openConsoleCall(); ${mutate} return call.callSap(() => previewSapEntitySet("x")); }`);
      expect(r.reaches).toBe(true);
      expect(r.findings).toContain("previewSapEntitySet");
      expect(r.audit.some((f) => /not a console call opened with openConsoleCall/.test(f))).toBe(true);
    });

    it("still passes a console call whose properties are only read", () => {
      expect(
        check(`${head}\nexport async function GET() { const call = openConsoleCall(); const id = (call as any).correlationId; return call.callSap(() => previewSapEntitySet(id)); }`),
      ).toEqual({ reaches: true, findings: [], audit: [] });
    });

    it("still passes a console call awaited, or opened through a namespace import", () => {
      expect(
        check(`import { previewSapEntitySet } from "@/lib/sap-public/tdd-connector";
          import * as governed from "@/lib/governed/console";
          export async function GET() { const call = await governed.openConsoleCall(); return call.callSap(() => previewSapEntitySet("x")); }`),
      ).toEqual({ reaches: true, findings: [], audit: [] });
    });
  });

  /*
   * P0.14b review: a SAP-reaching closure that leaves callSap runs after the
   * call has been recorded, with no row and no circuit. Each of these was
   * reported compliant ({ reaches: true, findings: [] }) before.
   */
  describe("a SAP-reaching function value that escapes callSap fails the check", () => {
    const head = `import { previewSapEntitySet } from "@/lib/sap-public/tdd-connector";
      import * as sap from "@/lib/sap-public/tdd-connector";
      import { openConsoleCall } from "@/lib/governed/console";`;
    const escapes = (body: string) => check(`${head}\nexport async function GET() { const call = openConsoleCall(); ${body} }`).findings;

    it.each([
      [
        "assigned to a variable declared outside the callback",
        `let again: () => Promise<unknown> = async () => 1;
         await call.callSap(async () => { again = () => previewSapEntitySet("y"); return previewSapEntitySet("x"); });
         return again();`,
      ],
      ["returned from the callback", `const r = await call.callSap(async () => () => previewSapEntitySet("x")); return r;`],
      ["returned by a return statement", `return call.callSap(async () => { const x = 1; return x ? () => previewSapEntitySet("x") : null; });`],
      ["returned inside an object", `return call.callSap(async () => ({ later: () => previewSapEntitySet("x") }));`],
      ["the function itself, assigned to a property", `const holder: Record<string, unknown> = {}; await call.callSap(async () => { holder.fn = previewSapEntitySet; }); return holder;`],
      ["bound and assigned out", `let f: unknown; await call.callSap(async () => { f = previewSapEntitySet.bind(null, "x"); }); return f;`],
      ["pushed onto an outer array", `const later: Array<() => unknown> = []; await call.callSap(async () => { later.push(() => sap.previewSapEntitySet("x")); }); return later;`],
      [
        "stored in a local of the callback first",
        `let out: unknown; await call.callSap(async () => { const f = () => previewSapEntitySet("x"); const g = f; out = g; }); return out;`,
      ],
      [
        "an inner function of the handler, handed out",
        `async function worker() { return previewSapEntitySet("x"); }
         let out: unknown; await call.callSap(async () => { out = worker; }); return out;`,
      ],
    ])("%s", (_name, body) => {
      expect(escapes(body).length).toBeGreaterThan(0);
    });

    it("passes what runs inside the callback, values handed to calls it makes, and data it hands out", () => {
      expect(
        escapes(`let total = 0; let rows: unknown = null;
          async function worker() { total++; return previewSapEntitySet("w"); }
          const r = await call.callSap(async () => {
            const read = await previewSapEntitySet("x");
            rows = read;
            await Promise.all(["a", "b"].map((k) => previewSapEntitySet(k)));
            await Promise.all(Array.from({ length: 2 }, worker));
            const local = () => previewSapEntitySet("z");
            await local();
            return read;
          });
          return [r, rows, total];`),
      ).toEqual([]);
    });
  });

  /*
   * P0.14b review round 4: only the function `callSap` (or `callSapWrite`)
   * runs is inside the pipeline. Its other arguments are ordinary handler code:
   * an argument expression is evaluated before the call is entered, and
   * `describe`'s callbacks run after its outcome is recorded. Each of these
   * was reported compliant before.
   */
  describe("a SAP call beside the governed callback, not in it, fails the check", () => {
    const head = `import { previewSapEntitySet } from "@/lib/sap-public/tdd-connector";
      import { openConsoleCall } from "@/lib/governed/console";`;
    const run = (body: string) => check(`${head}\nexport async function GET() { const call = openConsoleCall(); ${body} }`);

    it.each([
      ["evaluated eagerly in the callback's place", `return call.callSap(((v: unknown) => async () => v)(await previewSapEntitySet("x")));`],
      ["in describe's answered", `return call.callSap(async () => 1, { answered: () => previewSapEntitySet("x"), failed: () => null });`],
      ["in describe's failed", `return call.callSap(async () => 1, { answered: () => null, failed() { return previewSapEntitySet("x"); } });`],
      ["in describe, built before the call", `const describe = { answered: () => previewSapEntitySet("x") }; return call.callSap(async () => 1, describe);`],
      ["in a write's handle argument", `return call.callSapWrite(await previewSapEntitySet("x"), async () => 1);`],
      ["an inner function as describe's callback", `async function after() { return previewSapEntitySet("x"); } return call.callSap(async () => 1, { answered: after, failed: () => null });`],
    ])("%s", (_name, body) => {
      const r = run(body);
      expect(r.reaches).toBe(true);
      expect(r.findings.length).toBeGreaterThan(0);
    });

    it("passes the callback given by name, an inner function or an import, and a write's callback", () => {
      expect(run(`return call.callSap(previewSapEntitySet as never, { answered: () => null, failed: () => null });`).findings).toEqual([]);
      expect(run(`async function worker() { return previewSapEntitySet("x"); } return call.callSap(worker, { answered: () => null, failed: () => null });`).findings).toEqual([]);
      expect(run(`const handle = { id: "a" }; return call.callSapWrite(handle, () => previewSapEntitySet("x"));`).findings).toEqual([]);
    });
  });

  /*
   * P0.14b review: the scan covered only src/app/api. A route in a route group,
   * a page or a server action that called the connector passed every check.
   */
  describe("outside src/app/api", () => {
    const sources = (extra: SourceInput[]) =>
      buildSapGraph([CONNECTOR, CONSOLE, BARREL, ...extra], {
        sapFetchers: new Set(["src/lib/sap-public/tdd-connector.ts#sapFetch"]),
        cuts: new Set(),
      });
    const PEEK = `import { previewSapEntitySet } from "@/lib/sap-public/tdd-connector";`;

    it("a route in a route group is a route, and fails the check like any other", () => {
      const file = "src/app/(studio)/studio/peek/route.ts";
      expect(isRouteFile(file)).toBe(true);
      expect(isRouteFile("src/app/(external)/x/route.tsx")).toBe(true);
      const g = sources([{ file, src: `${PEEK}\nexport async function GET() { return previewSapEntitySet("x"); }` }]);
      expect(routeReaches(g, file)).toBe(true);
      expect(routeFindings(g, file, PIPE).map((f) => f.via)).toEqual(["previewSapEntitySet"]);
    });

    it.each([
      ["a page (a server component)", "src/app/(studio)/studio/peek/page.tsx#Page", `export default async function Page() { return previewSapEntitySet("x"); }`],
      ["a layout", "src/app/(studio)/layout.tsx#Layout", `export default async function Layout() { await previewSapEntitySet("x"); return null; }`],
      ["a server component outside src/app", "src/components/sap/Peek.tsx#Peek", `export async function Peek() { return previewSapEntitySet("x"); }`],
      ["a server action, even in src/lib", "src/lib/actions/peek.ts#peek", `export async function peek() { return previewSapEntitySet("x"); }`, `"use server";\n`],
      ["middleware", "src/middleware.ts#middleware", `export async function middleware() { await previewSapEntitySet("x"); }`],
      ["a route's helper kept beside it", "src/app/api/sap/tdd/peek/load.ts#load", `export const load = () => previewSapEntitySet("x");`],
    ])("%s that reaches SAP is a side entrance", (_name, key, body, prologue = "") => {
      const file = fileOf(key);
      expect(sideEntrances(sources([{ file, src: `${prologue}${PEEK}\n${body}` }]))).toEqual([key]);
    });

    it("but shared code in src/lib, and the routes themselves, are not", () => {
      expect(sideEntrances(sources([]))).toEqual([]);
    });

    it("counts a server component's fetch in the census, and not a client component's", () => {
      const g = sources([
        { file: "src/app/(external)/x/route.ts", src: `export async function POST() { return fetch("https://example.invalid"); }` },
        { file: "src/app/(studio)/x/page.tsx", src: `export default async function Page() { return fetch("https://example.invalid"); }` },
        { file: "src/app/(studio)/x/Client.tsx", src: `"use client";\nexport function Client() { return fetch("/api/x"); }` },
      ]);
      expect(serverFetchers(g)).toEqual([
        "src/app/(external)/x/route.ts#POST",
        "src/app/(studio)/x/page.tsx#Page",
        "src/lib/sap-public/tdd-connector.ts#sapFetch",
      ]);
    });
  });

  /*
   * P0.14b review round 5: a route module's top-level code runs when the
   * route is imported — on every cold start — with no role gate, no ceiling,
   * no circuit and no row. Only HTTP exports and bare statements were walked,
   * so an initializer that called SAP passed every check.
   */
  describe("a route's module-scope code runs on import, and is checked as the handler's", () => {
    const head = `import { previewSapEntitySet } from "@/lib/sap-public/tdd-connector";
      import { openConsoleCall } from "@/lib/governed/console";`;
    const quietGet = `export async function GET() { return Response.json({ ok: true }); }`;

    it.each([
      ["an unused const initialised with a SAP call", `const _warmed = previewSapEntitySet("x").catch(() => null);`],
      ["export const dynamic with a SAP call beside its value", `export const dynamic = (void previewSapEntitySet("x"), "force-dynamic");`],
      ["an immediately invoked function", `const _warm = (async () => previewSapEntitySet("x"))();`],
      ["a closure handed to a call made on import", `const _timer = setTimeout(() => previewSapEntitySet("x"), 0);`],
      ["an object handed to a call made on import", `const _reg = new Map([["warm", { run: () => previewSapEntitySet("x") }]]).forEach((v) => v.run());`],
      ["a class's static initializer", `class Warm { static ready = previewSapEntitySet("x"); }`],
      ["a class's static block", `class Warm { static { void previewSapEntitySet("x"); } }`],
      ["an export default value", `export default previewSapEntitySet("x");`],
      // Review round 6: a default in a binding pattern runs when the value is undefined.
      ["a default in an object binding pattern", `const { warmed = previewSapEntitySet("x") } = {} as { warmed?: unknown };`],
      ["a default in an array binding pattern", `const [w = previewSapEntitySet("x")] = [] as unknown[];`],
      ["a default in a nested binding pattern", `const { a: { b = previewSapEntitySet("x") } = {} } = {} as { a?: { b?: unknown } };`],
      ["a computed key in a binding pattern", `const { [String(previewSapEntitySet("x"))]: k } = {} as Record<string, unknown>;`],
    ])("fails %s", (_name, moduleCode) => {
      const r = check(`${head}\n${moduleCode}\n${quietGet}`);
      expect(r.reaches).toBe(true);
      expect(r.findings).toContain("previewSapEntitySet");
    });

    it("a module-scope helper that only holds a function is followed where a handler mentions it, not on import", () => {
      const helpers = `const ops = { read: (k: string) => previewSapEntitySet(k), other() { return previewSapEntitySet("o"); } };
        const load = (k: string) => previewSapEntitySet(k);
        class Reader { read(k: string) { return previewSapEntitySet(k); } }
        const { later = (k: string) => previewSapEntitySet(k) } = {} as { later?: (k: string) => unknown };`;
      // Not mentioned by any handler: nothing runs, the route does not reach SAP.
      const unused = check(`${head}\n${helpers}\n${quietGet}`);
      expect(unused.reaches).toBe(false);
      expect(unused.findings).toEqual([]);
      // Called inside callSap: governed.
      expect(
        check(`${head}\n${helpers}
          export async function GET() {
            const call = openConsoleCall();
            await call.callSap(() => ops.read("x"), { answered: () => null as never, failed: () => null as never });
            await call.callSap(() => new Reader().read("r"), { answered: () => null as never, failed: () => null as never });
            return call.callSap(() => load("y"), { answered: () => null as never, failed: () => null as never });
          }`),
      ).toEqual({ reaches: true, findings: [], audit: [] });
      // Called by the handler outside callSap: a finding, as before.
      expect(check(`${head}\n${helpers}\nexport async function GET() { return ops.read("x"); }`).findings).toContain("previewSapEntitySet");
      expect(check(`${head}\n${helpers}\nexport async function GET() { return new Reader().read("x"); }`).findings).toContain("previewSapEntitySet");
    });
  });

  /*
   * P0.14b review round 5: a route that re-exports ANOTHER ROUTE's handler —
   * P1.10's /api/northbound/v1/* aliases, `export { GET } from
   * "@/app/api/northbound/interfaces/[id]/data/route"` — is that route, and is
   * judged by its verdict. Only a handler re-exported from a module that is
   * not a route (src/lib) goes unwalked and stays a finding.
   */
  describe("a route that re-exports another route's handler is judged by that route", () => {
    const head = `import { previewSapEntitySet } from "@/lib/sap-public/tdd-connector";
      import { openConsoleCall } from "@/lib/governed/console";`;
    const GOVERNED: SourceInput = {
      file: "src/app/api/sap/tdd/governed/route.ts",
      src: `${head}\nexport async function GET() { const call = openConsoleCall(); return call.callSap(() => previewSapEntitySet("x")); }`,
    };
    const SIDE_DOOR: SourceInput = {
      file: "src/app/api/sap/tdd/side/route.ts",
      src: `${head}\nexport async function GET() { return previewSapEntitySet("x"); }`,
    };
    const WARMING: SourceInput = {
      file: "src/app/api/sap/tdd/warming/route.ts",
      src: `${head}\nconst _warm = previewSapEntitySet("w");\nexport async function GET() { const call = openConsoleCall(); return call.callSap(() => previewSapEntitySet("x")); }`,
    };

    it.each([
      ["export { GET } from", `export { GET } from "@/app/api/sap/tdd/governed/route";`],
      ["imported, then exported", `import { GET } from "@/app/api/sap/tdd/governed/route";\nexport { GET };`],
      ["a relative path", `export { GET } from "../governed/route";`],
    ])("passes a governed route's handler re-exported with %s", (_name, exportLine) => {
      expect(check(exportLine, [GOVERNED])).toEqual({ reaches: true, findings: [], audit: [] });
    });

    it("fails a route that re-exports a route's ungoverned handler, with that route's findings", () => {
      const r = check(`export { GET } from "@/app/api/sap/tdd/side/route";`, [SIDE_DOOR]);
      expect(r.reaches).toBe(true);
      expect(r.findings).toEqual(["previewSapEntitySet"]);
    });

    it("carries the source route's import-time findings: importing it runs them", () => {
      expect(check(`export { GET } from "@/app/api/sap/tdd/warming/route";`, [WARMING]).findings).toEqual(["previewSapEntitySet"]);
    });

    it("judges its own handlers beside the alias on their own", () => {
      const r = check(`${head}\nexport { GET } from "@/app/api/sap/tdd/governed/route";\nexport async function POST() { return previewSapEntitySet("p"); }`, [GOVERNED]);
      expect(r.findings).toEqual(["previewSapEntitySet"]);
      expect(r.audit).toContain("writes no audit row: no GovernedAudit, no console call, no platform audit");
    });

    it("the broker's own read and write routes may be aliased (P1.10's /api/northbound/v1/*)", () => {
      const aliases: SourceInput[] = [
        { file: "src/app/api/northbound/v1/interfaces/[id]/data/route.ts", src: `export { GET } from "@/app/api/northbound/interfaces/[id]/data/route";\nexport const dynamic = "force-dynamic";` },
        { file: "src/app/api/northbound/v1/interfaces/[id]/data/write/route.ts", src: `export { POST } from "@/app/api/northbound/interfaces/[id]/data/write/route";\nexport const dynamic = "force-dynamic";` },
      ];
      // As the aliases land with P1.10, the tree carries them already: each is added once.
      const g = buildSapGraph([...SOURCES.filter((s) => !aliases.some((a) => a.file === s.file)), ...aliases], { sapFetchers: new Set(Object.keys(SAP_FETCHERS)), cuts: new Set(Object.keys(CUTS)) });
      for (const { file } of aliases) {
        expect(routeReaches(g, file), file).toBe(true);
        expect(routeFindings(g, file, PIPELINE_MODULES), file).toEqual([]);
        expect(auditFindings(g, file), file).toEqual([]);
      }
      // It parses all of src/ again: seconds on an idle machine, more under a full parallel run.
    }, 60_000);
  });

  it("ignores a name used only as a type, in a comment or in a string", () => {
    expect(check(`import type { previewSapEntitySet } from "@/lib/sap-public/tdd-connector";
      // previewSapEntitySet("x")
      export async function GET(): Promise<ReturnType<typeof previewSapEntitySet> | string> { return "previewSapEntitySet"; }`).reaches).toBe(false);
  });
});
