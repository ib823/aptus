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
 * reaches a SAP fetch.
 *
 * HOW "USES THE PIPELINE" IS DECIDED: every mention of a SAP-reaching binding
 * on a handler's path must be either a step of the broker pipeline
 * (src/lib/governed/pipeline.ts: `callSapRead`, `callSapWrite` …) or made
 * inside the callback a console call's `callSap` / `callSapWrite` takes
 * (src/lib/governed/console.ts), which refuses to run until the console's
 * authorise, bind and contain steps have passed (tests/unit/governed/
 * console.test.ts).
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
  keyOf,
  mentionedTargets,
  routeFindings,
  routeReaches,
  type SapGraph,
  type SourceInput,
} from "../../helpers/sap-reach";

const ROOT = path.resolve(__dirname, "../../..");

/** Every binding in server code that sends a request to SAP or Ariba, and what it reaches. */
const SAP_FETCHERS: Record<string, string> = {
  "src/lib/sap-public/tdd-connector.ts#sapFetch": "the Workbench connector: every OData and token request of the console",
  "src/lib/sap-public/ariba-connector.ts#aribaFetch": "the Ariba realm and its OAuth token endpoint",
  "src/lib/northbound/read.ts#readEntitySet": "the broker's read executor (its default fetch)",
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
    reads: "the sign-in, $metadata and one proven read a ROTATED secret must pass before it replaces a working one (P0.14 probe-before-swap)",
    recorded: "the save's ConfigAudit row",
    moves: "cannot bind through the pipeline: the secret under test is not stored yet; P4.1 gives it the dispatcher",
  },
  "src/app/api/studio/connections/[id]/test/route.ts": {
    reads: "a builder's Test of their own stored connection: sign-in and $metadata, no business data",
    recorded: "a ConfigAudit row and the connection's health columns",
    moves: "P4.1 (the probe moves onto the pipeline's transport); by P3 for A.3 #9",
  },
  "src/app/api/studio/interfaces/[id]/verify-service/route.ts": {
    reads: "a customer-built service's $metadata before an interface may name it (P1.1)",
    recorded: "a ConfigAudit row and the service verification",
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
const ROUTES = SOURCES.map((s) => s.file).filter((f) => f.startsWith("src/app/api/") && f.endsWith("/route.ts"));
const isServer = (key: string) => key.startsWith("src/lib/") || key.startsWith("src/app/api/");

const graph = buildSapGraph(SOURCES, { sapFetchers: new Set(Object.keys(SAP_FETCHERS)), cuts: new Set(Object.keys(CUTS)) });

/** What a compliant route writes, or why it does not. Empty when it is audited. */
function auditFindings(g: SapGraph, file: string, src = SOURCES.find((s) => s.file === file)?.src ?? ""): string[] {
  const used = mentionedTargets(g, file);
  const findings: string[] = [];
  if (/\.callSap\s*\(/.test(src) && !used.has(AUDIT.console)) findings.push("calls callSap( without opening the call with openConsoleCall");
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
    const census = graph.fetchers.filter(isServer).sort();
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

  function check(routeSrc: string) {
    const g = buildSapGraph([CONNECTOR, CONSOLE, BARREL, RENAMED, { file: ROUTE, src: routeSrc }], {
      sapFetchers: new Set(["src/lib/sap-public/tdd-connector.ts#sapFetch"]),
      cuts: new Set(),
    });
    return { reaches: routeReaches(g, ROUTE), findings: routeFindings(g, ROUTE, PIPE).map((f) => f.via), audit: auditFindings(g, ROUTE, routeSrc) };
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
    const unaudited = check(`import { previewSapEntitySet } from "@/lib/sap-public/tdd-connector";
      export async function GET(call: { callSap(f: () => unknown): unknown }) { return call.callSap(() => previewSapEntitySet("x")); }`);
    expect(unaudited.findings).toEqual([]);
    expect(unaudited.audit).toContain("calls callSap( without opening the call with openConsoleCall");
  });

  it("ignores a name used only as a type, in a comment or in a string", () => {
    expect(check(`import type { previewSapEntitySet } from "@/lib/sap-public/tdd-connector";
      // previewSapEntitySet("x")
      export async function GET(): Promise<ReturnType<typeof previewSapEntitySet> | string> { return "previewSapEntitySet"; }`).reaches).toBe(false);
  });
});
