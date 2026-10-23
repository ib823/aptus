// @vitest-environment node
/**
 * The governed pipeline's own contract (P0.14): named steps, one refusal
 * table, the containment setting, the transport, and no transaction held
 * open across a call to SAP.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  circuitBreakerMode,
  circuitKeyForConnection,
  circuitKeyForConsoleRead,
  circuitKeyForDeploymentTenant,
} from "@/lib/governed/containment";
import {
  circuitOutcomeForConsoleRead,
  circuitOutcomeForQuery,
  circuitOutcomeForRead,
  circuitOutcomeForWrite,
  northboundRefusalResponse,
  PIPELINE_STEPS,
  queryRefusalOf,
  refusal,
  REFUSAL_STATUS,
} from "@/lib/governed/pipeline";
import { QUERY_READ_STATUSES, type QueryReadStatus } from "@/lib/odata/query-status";
import { queryRefusal } from "@/lib/odata/rules";
import {
  DIRECT_TRANSPORT,
  parseTransportKind,
  registerTwinEngine,
  transportFor,
  TWIN_TRANSPORT,
  TwinUnavailableError,
} from "@/lib/governed/transport";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(path.join(ROOT, p), "utf8");
/** Comments out, so a sentence about a transaction is not mistaken for one. */
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1 ");

const PORTED = [
  "src/app/api/northbound/interfaces/[id]/data/route.ts",
  "src/app/api/northbound/interfaces/[id]/data/write/route.ts",
  "src/app/api/studio/test/broker-run/route.ts",
  "src/app/api/sap/tdd/preview/route.ts",
];

describe("the steps", () => {
  it("are named in the order a governed call meets them", () => {
    expect(PIPELINE_STEPS).toEqual([
      "authenticate",
      "rateLimit",
      "resolveInterface",
      "authorise",
      "bindConnection",
      "contain",
      "callSap",
      "audit",
    ]);
  });

  it("every ported route runs on them", () => {
    for (const file of PORTED) expect(read(file)).toContain('from "@/lib/governed/pipeline"');
  });
});

describe("one refusal table", () => {
  it("a refusal takes its status from the table, whatever the step", () => {
    for (const reason of Object.keys(REFUSAL_STATUS) as (keyof typeof REFUSAL_STATUS)[]) {
      expect(refusal("authorise", reason, "m").status).toBe(REFUSAL_STATUS[reason]);
    }
  });

  it("gives each reason the code a client branches on", () => {
    expect(refusal("authenticate", "UNAUTHENTICATED", "m").code).toBe("UNAUTHENTICATED");
    expect(refusal("rateLimit", "RATE_LIMITED", "m").code).toBe("RATE_LIMITED");
    expect(refusal("rateLimit", "LIMITER_UNAVAILABLE", "m").code).toBe("LIMITER_UNAVAILABLE");
    expect(refusal("resolveInterface", "INTERFACE_NOT_FOUND", "m").code).toBe("NOT_FOUND");
    expect(refusal("authorise", "OPERATION_NOT_SUPPORTED", "m").code).toBe("VALIDATION_ERROR");
    expect(refusal("authorise", "NO_APPROVED_GRANT", "m").code).toBe("FORBIDDEN");
    expect(refusal("bindConnection", "NO_CONNECTION", "m").code).toBe("CONNECTION_NOT_CONFIGURED");
    expect(refusal("bindConnection", "WRITES_DISABLED", "m").code).toBe("FORBIDDEN");
    expect(refusal("contain", "CIRCUIT_OPEN", "m").code).toBe("CIRCUIT_OPEN");
    expect(refusal("resolveInterface", "IDEMPOTENCY_IN_FLIGHT", "m").code).toBe("CONFLICT");
  });

  /*
   * P1.4: the query surface's six reasons are rows of the same table, and
   * three of them have codes of their own. PIPELINE_STEPS above is unchanged:
   * a query is refused at resolveInterface (what the request names) or
   * authorise (what the grant's interface allows), never at a new step.
   */
  it("gives the query surface's reasons their statuses and codes", () => {
    const answers = Object.fromEntries(
      (["QUERY_INVALID", "QUERY_NOT_AVAILABLE", "CURSOR_INVALID", "POLICY_FIELD_NOT_GRANTED", "CURSOR_STALE", "QUERY_SURFACE_MISCONFIGURED"] as const).map((r) => {
        const x = refusal("authorise", r, "m");
        return [r, `${x.status} ${x.code}`];
      }),
    );
    expect(answers).toEqual({
      QUERY_INVALID: "400 VALIDATION_ERROR",
      QUERY_NOT_AVAILABLE: "400 VALIDATION_ERROR",
      CURSOR_INVALID: "400 VALIDATION_ERROR",
      POLICY_FIELD_NOT_GRANTED: "400 POLICY_FIELD_NOT_GRANTED",
      CURSOR_STALE: "409 CURSOR_STALE",
      QUERY_SURFACE_MISCONFIGURED: "500 INTERNAL",
    });
  });

  it("carries a query refusal's detail to error.query, and its finer rule to the audit row only", async () => {
    const r = queryRefusalOf(
      "resolveInterface",
      queryRefusal("CURSOR_INVALID", "CURSOR_INVALID", "This cursor cannot be used.", { parameter: "cursor", auditRule: "CURSOR_UNOPENED" }),
      { query: { kind: "PAGE" } },
    );
    expect(r).toMatchObject({ status: 400, code: "VALIDATION_ERROR", detail: { rule: "CURSOR_INVALID", parameter: "cursor" } });
    // The caller is told one thing for every unusable cursor; operations sees which check failed.
    expect(r.audit.query).toEqual({ kind: "PAGE", rule: "CURSOR_UNOPENED" });
    expect(r.audit.failureReason).toBeUndefined();
    const body = (await northboundRefusalResponse(r, "c1").json()) as { error: Record<string, unknown> };
    expect(body.error).toEqual({ code: "VALIDATION_ERROR", message: "This cursor cannot be used.", correlationId: "c1", query: { rule: "CURSOR_INVALID", parameter: "cursor" } });
    // Any other refusal's body is exactly what it always was.
    const plain = (await northboundRefusalResponse(refusal("authorise", "NO_APPROVED_GRANT", "No."), "c2").json()) as { error: Record<string, unknown> };
    expect(Object.keys(plain.error)).toEqual(["code", "message", "correlationId"]);
  });
});

describe("no transaction is held open across a call to SAP", () => {
  it("neither the pipeline nor a ported route opens one", () => {
    for (const file of [
      "src/lib/governed/pipeline.ts",
      "src/lib/governed/transport.ts",
      "src/lib/governed/containment.ts",
      // P0.19's two statements and the after-response bookkeeping.
      "src/lib/governed/call-loads.ts",
      "src/lib/governed/after-response.ts",
      ...PORTED,
    ]) {
      expect(code(read(file)), file).not.toMatch(/\$transaction|\btx\./);
    }
  });

  it("the rotation probe runs before, and outside, the save", () => {
    const route = code(read("src/app/api/studio/connections/route.ts"));
    expect(route.indexOf("probeForSave(")).toBeGreaterThan(-1);
    expect(route.indexOf("probeForSave(")).toBeLessThan(route.indexOf("upsertSapConnection({"));
    expect(code(read("src/lib/sap-public/rotation-probe.ts"))).not.toMatch(/\$transaction/);
  });
});

describe("containment: COREEDGE_CIRCUIT_BREAKER", () => {
  it("observes by default, and reads a typo as observe", () => {
    expect(circuitBreakerMode({})).toBe("observe");
    expect(circuitBreakerMode({ COREEDGE_CIRCUIT_BREAKER: "" })).toBe("observe");
    expect(circuitBreakerMode({ COREEDGE_CIRCUIT_BREAKER: "enforced" })).toBe("observe");
    expect(circuitBreakerMode({ COREEDGE_CIRCUIT_BREAKER: "Enforce" })).toBe("enforce");
    expect(circuitBreakerMode({ COREEDGE_CIRCUIT_BREAKER: "off" })).toBe("off");
  });

  it("keys one circuit per SAP system", () => {
    expect(circuitKeyForConnection("c1")).toBe("connection:c1");
    expect(circuitKeyForDeploymentTenant("S4_TDD", "default")).toBe("deployment:S4_TDD:default");
    // A console read counts into its own organization's console circuit, never production's.
    expect(circuitKeyForConsoleRead("org_a", circuitKeyForConnection("c1"))).toBe("console:org_a:connection:c1");
  });

  it("counts only a sick system's answers as failures", () => {
    expect(circuitOutcomeForRead("OK")).toBe("ok");
    expect(circuitOutcomeForRead("EMPTY")).toBe("ok");
    expect(circuitOutcomeForRead("TIMEOUT")).toBe("timeout");
    expect(circuitOutcomeForRead("ERROR")).toBe("upstream-error");
    // A healthy system saying no is not a failure.
    expect(circuitOutcomeForRead("NEEDS_SETUP")).toBe("refused");
    expect(circuitOutcomeForRead("NOT_FOUND")).toBe("refused");
    const write = (status: string, httpStatus: number | null, attempted: boolean) =>
      circuitOutcomeForWrite({ status, httpStatus, attempted } as Parameters<typeof circuitOutcomeForWrite>[0]);
    expect(write("CREATED", 201, true)).toBe("ok");
    expect(write("REJECTED", 400, true)).toBe("refused");
    // A write's payload is the caller's: SAP's own answer to it, a 5xx or a
    // throttle included, says nothing about the system every solution shares.
    expect(write("ERROR", 500, true)).toBe("refused");
    expect(write("ERROR", 503, true)).toBe("refused");
    expect(write("ERROR", 429, false)).toBe("refused");
    expect(write("ERROR", 408, false)).toBe("refused");
    // What SAP did not answer still counts: no answer, a timeout, the
    // credential step, a CSRF handshake (no payload in it) that failed.
    expect(write("ERROR", null, true)).toBe("upstream-error");
    expect(write("ERROR", null, false)).toBe("upstream-error");
    expect(write("TIMEOUT", null, true)).toBe("timeout");
    expect(write("ERROR", 503, false)).toBe("upstream-error");
    expect(circuitOutcomeForConsoleRead(200, 200)).toBe("ok");
    expect(circuitOutcomeForConsoleRead(403, 403)).toBe("refused");
    // SAP's 4xx to a query the builder chose is audited 502, and is not a failure.
    expect(circuitOutcomeForConsoleRead(502, 400)).toBe("refused");
    expect(circuitOutcomeForConsoleRead(502, 500)).toBe("upstream-error");
    expect(circuitOutcomeForConsoleRead(504, null)).toBe("timeout");
    expect(circuitOutcomeForConsoleRead(502, null)).toBe("upstream-error");
  });

  /*
   * P1.4, threat N11: the caller shapes a query-surface read, so SAP's own
   * answer to it — a 400, a 501, a short dump's 500, a 3xx it was refused —
   * never counts against the system every solution on the connection shares.
   * What SAP did not answer still does: no answer at all, a timeout (D14),
   * and a proxy's 502, 503 or 504 in front of it. circuitOutcomeForRead,
   * above, is unchanged for the legacy read.
   */
  it("counts a query's own answers as refusals, and only an absent or proxied answer as a failure", () => {
    const q = (status: QueryReadStatus, httpStatus: number | null) => circuitOutcomeForQuery({ status, httpStatus });
    const table: [QueryReadStatus, number | null, string][] = [
      ["OK", 200, "ok"],
      ["EMPTY", 200, "ok"],
      ["NO_RECORD", 404, "ok"],
      ["TIMEOUT", null, "timeout"],
      ["ERROR", null, "upstream-error"],
      ["ERROR", 502, "upstream-error"],
      ["ERROR", 503, "upstream-error"],
      ["ERROR", 504, "upstream-error"],
      ["ERROR", 500, "refused"],
      ["ERROR", 302, "refused"],
      ["ERROR", 200, "refused"],
      ["SAP_REJECTED", 400, "refused"],
      ["SAP_REJECTED", 501, "refused"],
      ["NEEDS_SETUP", 401, "refused"],
      ["NEEDS_SETUP", null, "refused"],
      ["NOT_FOUND", 404, "refused"],
      ["TOO_LARGE", 200, "refused"],
    ];
    for (const [status, http, want] of table) expect(q(status, http), `${status} ${http}`).toBe(want);
    // Every outcome is in the table.
    expect(new Set(table.map(([s]) => s))).toEqual(new Set(QUERY_READ_STATUSES));
  });
});

describe("the transport", () => {
  afterEach(() => {
    registerTwinEngine(null);
    vi.unstubAllGlobals();
  });

  it("is DIRECT for every connection that does not say TWIN", () => {
    expect(parseTransportKind(undefined)).toBe("DIRECT");
    expect(parseTransportKind(null)).toBe("DIRECT");
    expect(parseTransportKind("DIRECT")).toBe("DIRECT");
    expect(parseTransportKind("anything")).toBe("DIRECT");
    expect(transportFor({})).toBe(DIRECT_TRANSPORT);
    expect(transportFor({ transport: "TWIN" })).toBe(TWIN_TRANSPORT);
  });

  it("DIRECT reaches SAP through the platform fetch, looked up at call time", async () => {
    const fetchMock = vi.fn(async () => new Response("ok"));
    vi.stubGlobal("fetch", fetchMock);
    await DIRECT_TRANSPORT.fetch("https://example.invalid/x");
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(DIRECT_TRANSPORT.reachesSap).toBe(true);
  });

  it("TWIN never reaches the network: unavailable without an engine, served by one with", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(TWIN_TRANSPORT.available()).toBe(false);
    await expect(TWIN_TRANSPORT.fetch("https://my.s4hana.cloud.sap/x")).rejects.toBeInstanceOf(TwinUnavailableError);

    const handle = vi.fn(async (req: Request) => new Response(`twin:${new URL(req.url).pathname}`));
    registerTwinEngine({ handle });
    expect(TWIN_TRANSPORT.available()).toBe(true);
    const res = await TWIN_TRANSPORT.fetch("https://my.s4hana.cloud.sap/sap/opu/odata/sap/X/A", { method: "GET" });
    expect(await res.text()).toBe("twin:/sap/opu/odata/sap/X/A");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(TWIN_TRANSPORT.reachesSap).toBe(false);
  });
});
