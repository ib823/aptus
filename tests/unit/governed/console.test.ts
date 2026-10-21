// @vitest-environment node
/**
 * The Workbench console on the governed pipeline (P0.14b,
 * src/lib/governed/console.ts): the steps run in order, every refusal and
 * every call is audited on both trails, the deployment tenant's host is
 * checked against the allow-list stored connections pass — observing by
 * default — and the write-back cannot reach SAP without its P0.7 row.
 *
 * The routes' own behaviour, end to end, is the golden test
 * (tests/integration/console-pipeline-golden.test.ts).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type * as ConsoleReadGuard from "@/lib/sap-public/console-read-guard";
import type * as PlatformAudit from "@/lib/audit/platform-audit";

const h = vi.hoisted(() => ({
  orgRows: [] as Record<string, unknown>[],
  platformRows: [] as Record<string, unknown>[],
  ceiling: null as null | "NO_APPROVED_GRANT" | "UNDECLARED_ENVIRONMENT",
}));

vi.mock("@/lib/sap-public/console-read-guard", async (importOriginal) => ({
  ...(await importOriginal<typeof ConsoleReadGuard>()),
  decideConsoleRead: async () =>
    h.ceiling === null ? { allowed: true, refusal: null, message: null } : { allowed: false, refusal: h.ceiling, message: `refused: ${h.ceiling}` },
  recordConsoleRead: async (row: Record<string, unknown>) => {
    h.orgRows.push(row);
  },
}));
vi.mock("@/lib/audit/platform-audit", async (importOriginal) => ({
  ...(await importOriginal<typeof PlatformAudit>()),
  recordPlatformConsoleRead: async (row: Record<string, unknown>) => {
    h.platformRows.push(row);
  },
}));

import { ConsolePipelineError, CONSOLE_PRINCIPAL, openConsoleCall, type ConsoleCallInput } from "@/lib/governed/console";
import { __setGovernedCircuitStore, governedCircuitBreaker } from "@/lib/governed/containment";
import { FAILURE_THRESHOLD, MemoryCircuitStore } from "@/lib/northbound/circuit-breaker";
import {
  auditConfiguredTenantHosts,
  checkConfiguredUrls,
  deploymentTenantUrls,
  envTenantHostMode,
  forgetEnvTenantHostWarnings,
} from "@/lib/sap-public/env-tenant-hosts";

const consultant = { id: "u1", email: "c@abeam.test", role: "consultant", organizationId: "org_a" };
const sandboxDev = { ...consultant, id: "u2", role: "sandbox_developer" };
const admin = { id: "u3", email: "a@abeam.test", role: "platform_admin", organizationId: null };

const deployment = (baseUrl: string, environment?: string) =>
  ({
    kind: "odata",
    product: { key: "s4hana", envPrefix: "S4_TDD" },
    resolved: { tenant: { key: "env", label: "Env", baseUrl, ...(environment ? { environment } : {}) }, source: "deployment", connection: null },
  }) as const;
const connection = (environment: "DEV" | "PROD" = "DEV") =>
  ({
    kind: "odata",
    product: { key: "s4hana", envPrefix: "S4_TDD" },
    resolved: {
      tenant: { key: "dev", label: "DEV", baseUrl: "https://my000001-api.s4hana.cloud.sap" },
      source: "connection",
      connection: { id: "conn_1", environment },
    },
  }) as const;

const LISTED = "https://my000002-api.s4hana.cloud.sap";
const UNLISTED = "https://s4.landscape.example.net";

function open(over: Partial<ConsoleCallInput> = {}) {
  return openConsoleCall({
    viewer: consultant,
    target: deployment(LISTED, "SANDBOX"),
    route: "/api/sap/tdd/preview",
    externalId: "purchase-orders",
    entitySet: "A_PurchaseOrder",
    request: { entity: "A_PurchaseOrder", limit: 2 },
    ...over,
  });
}

async function throughContain(call: ReturnType<typeof open>) {
  expect((await call.authorise()).ok).toBe(true);
  expect((await call.bind()).ok).toBe(true);
  expect((await call.contain()).ok).toBe(true);
}

beforeEach(() => {
  h.orgRows = [];
  h.platformRows = [];
  h.ceiling = null;
  vi.unstubAllEnvs();
  forgetEnvTenantHostWarnings();
  __setGovernedCircuitStore(new MemoryCircuitStore());
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("the steps run in order", () => {
  it("refuses to call SAP before authorise, bind and contain have passed", async () => {
    const call = open();
    const fn = vi.fn(async () => 1);
    const describe_ = { answered: () => ({ status: 200, rowCount: 1 }), failed: () => ({ status: 502, rowCount: null }) };
    await expect(call.callSap(fn, describe_)).rejects.toBeInstanceOf(ConsolePipelineError);
    await expect(call.bind()).rejects.toBeInstanceOf(ConsolePipelineError);
    await call.authorise();
    await expect(call.contain()).rejects.toBeInstanceOf(ConsolePipelineError);
    await call.bind();
    await expect(call.callSap(fn, describe_)).rejects.toBeInstanceOf(ConsolePipelineError);
    expect(fn).not.toHaveBeenCalled();
    expect(h.orgRows).toEqual([]);
  });

  it("is the named console principal, with a correlation id on both rows", async () => {
    const call = open();
    expect(call.principal).toBe(CONSOLE_PRINCIPAL);
    await throughContain(call);
    await call.callSap(async () => ({ rows: [1] }), {
      answered: (v) => ({ status: 200, rowCount: v.rows.length }),
      failed: () => ({ status: 502, rowCount: null }),
    });
    expect(h.orgRows).toHaveLength(1);
    expect(h.platformRows).toHaveLength(1);
    expect(h.orgRows[0]).toMatchObject({ correlationId: call.correlationId, actorUserId: "u1", organizationId: "org_a", status: 200, rowCount: 1 });
    expect(typeof h.orgRows[0]!.durationMs).toBe("number");
    expect(h.platformRows[0]).toMatchObject({
      correlationId: call.correlationId,
      outcome: "SUCCEEDED",
      status: 200,
      target: { product: "s4hana", tenantKey: "env", serviceKey: "purchase-orders", entitySet: "A_PurchaseOrder" },
      request: { entity: "A_PurchaseOrder", limit: 2 },
      detail: { principal: "console", route: "/api/sap/tdd/preview", source: "deployment", hostCheck: "allowed" },
    });
  });
});

describe("authorise: the console's ceilings, each refusal audited", () => {
  it("holds a sandbox developer to SANDBOX, and records the refusal on both trails", async () => {
    const call = open({ viewer: sandboxDev, target: connection("DEV") });
    const r = await call.authorise();
    expect(r.ok).toBe(false);
    expect(!r.ok && r.refusal.reason).toBe("SANDBOX_ONLY");
    expect(!r.ok && r.refusal.status).toBe(403);
    expect(h.orgRows).toEqual([expect.objectContaining({ status: 403, rowCount: null, connectionId: "conn_1" })]);
    expect(h.platformRows).toEqual([
      expect.objectContaining({ outcome: "BLOCKED", status: null, reason: "SANDBOX_ONLY", detail: expect.objectContaining({ step: "authorise" }) }),
    ]);
  });

  it("lets a sandbox developer read a deployment tenant declared SANDBOX", async () => {
    expect((await open({ viewer: sandboxDev }).authorise()).ok).toBe(true);
  });

  it("applies the environment ceiling to a stored connection", async () => {
    h.ceiling = "NO_APPROVED_GRANT";
    const r = await open({ target: connection("PROD") }).authorise();
    expect(!r.ok && r.refusal.reason).toBe("NO_APPROVED_GRANT");
    expect(h.orgRows[0]).toMatchObject({ status: 403, environment: "PROD" });
  });

  it("does not ask the grant question of a deployment tenant, which no organization owns", async () => {
    h.ceiling = "NO_APPROVED_GRANT";
    expect((await open().authorise()).ok).toBe(true);
  });

  it("files a reader with no organization under the deployment scope", async () => {
    const call = open({ viewer: admin });
    await throughContain(call);
    await call.callSap(async () => 1, { answered: () => ({ status: 200, rowCount: 1 }), failed: () => ({ status: 502, rowCount: null }) });
    expect(h.orgRows[0]).toMatchObject({ organizationId: "-deployment-", environment: "deployment:env" });
    expect(h.platformRows[0]).toMatchObject({ actor: { organizationId: null }, detail: { organizationScope: "-deployment-" } });
  });
});

describe("bind: the deployment tenant's host against the stored-connection allow-list", () => {
  it("observes by default: an unlisted host is logged once, recorded, and the call goes ahead", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    for (let i = 0; i < 2; i++) {
      const call = open({ target: deployment(UNLISTED, "SANDBOX") });
      await throughContain(call);
      const fn = vi.fn(async () => 1);
      await call.callSap(fn, { answered: () => ({ status: 200, rowCount: 1 }), failed: () => ({ status: 502, rowCount: null }) });
      expect(fn).toHaveBeenCalledOnce();
    }
    expect(warn.mock.calls.filter((c) => String(c[0]).includes("[env-tenant-hosts]"))).toHaveLength(1);
    expect(h.platformRows[0]).toMatchObject({
      detail: { hostCheck: "unlisted", unlistedHosts: [{ variable: "S4_TDD_BASE_URL", host: "s4.landscape.example.net" }] },
    });
  });

  it("enforces only when set to, refusing before anything is sent, on both trails", async () => {
    vi.stubEnv("COREEDGE_ENV_TENANT_HOSTS", "enforce");
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const call = open({ target: deployment(UNLISTED, "SANDBOX") });
    expect((await call.authorise()).ok).toBe(true);
    const r = await call.bind();
    expect(r.ok).toBe(false);
    expect(!r.ok && r.refusal).toMatchObject({ reason: "HOST_NOT_ALLOWED", status: 403, step: "bindConnection", code: "FORBIDDEN" });
    expect(h.orgRows).toEqual([expect.objectContaining({ status: 403, failureReason: "HOST_NOT_ALLOWED" })]);
    expect(h.platformRows).toEqual([expect.objectContaining({ outcome: "BLOCKED", reason: "HOST_NOT_ALLOWED" })]);
    await expect(call.contain()).rejects.toBeInstanceOf(ConsolePipelineError);
  });

  it("passes a listed host under enforce, and checks nothing when off", async () => {
    vi.stubEnv("COREEDGE_ENV_TENANT_HOSTS", "enforce");
    expect((await (async () => { const c = open(); await c.authorise(); return c.bind(); })()).ok).toBe(true);
    vi.stubEnv("COREEDGE_ENV_TENANT_HOSTS", "off");
    const call = open({ target: deployment(UNLISTED, "SANDBOX") });
    await throughContain(call);
    await call.callSap(async () => 1, { answered: () => ({ status: 200, rowCount: 1 }), failed: () => ({ status: 502, rowCount: null }) });
    expect(h.platformRows.at(-1)).toMatchObject({ detail: { hostCheck: "not-checked" } });
  });

  it("never checks a stored connection again: it passed the list when it was saved", async () => {
    vi.stubEnv("COREEDGE_ENV_TENANT_HOSTS", "enforce");
    const call = open({ target: connection("DEV") });
    await throughContain(call);
    await call.callSap(async () => 1, { answered: () => ({ status: 200, rowCount: 1 }), failed: () => ({ status: 502, rowCount: null }) });
    expect(h.platformRows[0]).toMatchObject({ detail: { hostCheck: "not-checked", source: "connection" } });
  });

  it("checks Ariba's base and token URLs, and an Ariba call has no organization row", async () => {
    vi.stubEnv("COREEDGE_ENV_TENANT_HOSTS", "enforce");
    vi.stubEnv("ARIBA_BASE_URL", "https://openapi.ariba.com");
    vi.stubEnv("ARIBA_OAUTH_TOKEN_URL", "https://api.ariba.com/v2/oauth/token");
    const ok = open({ target: { kind: "ariba", realm: "myrealm-T" }, route: "/api/sap/ariba/call", externalId: "sourcing-events" });
    await throughContain(ok);
    await ok.callSap(async () => 1, { answered: () => ({ status: 200, rowCount: 1 }), failed: () => ({ status: 502, rowCount: null }) });
    expect(h.orgRows).toEqual([]);
    expect(h.platformRows[0]).toMatchObject({ target: { product: "ariba", tenantKey: "myrealm-T" }, detail: { source: "ariba", hostCheck: "allowed" } });

    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.stubEnv("ARIBA_OAUTH_TOKEN_URL", "http://10.0.0.5/oauth/token");
    const refused = open({ target: { kind: "ariba", realm: "myrealm-T" }, route: "/api/sap/ariba/call", externalId: "sourcing-events" });
    await refused.authorise();
    const r = await refused.bind();
    expect(!r.ok && r.refusal.reason).toBe("HOST_NOT_ALLOWED");
  });
});

describe("contain and callSap", () => {
  it("counts into the console's own circuit, never the production one", async () => {
    const call = open({ target: connection("DEV") });
    await throughContain(call);
    for (let i = 0; i < FAILURE_THRESHOLD; i++) {
      const c = open({ target: connection("DEV") });
      await throughContain(c);
      await c.callSap(async () => 1, { answered: () => ({ status: 502, rowCount: null }), failed: () => ({ status: 502, rowCount: null }) });
    }
    expect((await governedCircuitBreaker().beforeCall("connection:conn_1")).allowed).toBe(true);
    expect((await governedCircuitBreaker().beforeCall("console:org_a:connection:conn_1")).allowed).toBe(false);
  });

  it("refuses with 503 CIRCUIT_OPEN only when enforced, and audits it", async () => {
    for (let i = 0; i < FAILURE_THRESHOLD; i++) {
      await governedCircuitBreaker().recordOutcome("console:org_a:connection:conn_1", "timeout");
    }
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const observed = open({ target: connection("DEV") });
    await observed.authorise();
    await observed.bind();
    expect((await observed.contain()).ok).toBe(true);
    vi.stubEnv("COREEDGE_CIRCUIT_BREAKER", "enforce");
    const enforced = open({ target: connection("DEV") });
    await enforced.authorise();
    await enforced.bind();
    const r = await enforced.contain();
    expect(!r.ok && r.refusal).toMatchObject({ reason: "CIRCUIT_OPEN", status: 503 });
    expect(h.orgRows.at(-1)).toMatchObject({ status: 503, failureReason: "CIRCUIT_OPEN" });
  });

  it("returns a failure as a value, after recording it", async () => {
    const call = open();
    await throughContain(call);
    const boom = new Error("boom");
    const r = await call.callSap(async () => {
      throw boom;
    }, { answered: () => ({ status: 200, rowCount: 1 }), failed: () => ({ status: 504, rowCount: null, failureReason: "TIMEOUT" }) });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toBe(boom);
    expect(h.orgRows[0]).toMatchObject({ status: 504, failureReason: "TIMEOUT" });
    expect(h.platformRows[0]).toMatchObject({ outcome: "FAILED", status: 504, reason: "TIMEOUT" });
  });

  it("files a fan-out row under its own sentinel when the outcome names one", async () => {
    const call = open({ request: {} });
    await throughContain(call);
    await call.callSap(async () => [1, 2, 3], {
      answered: (made) => ({ status: 200, rowCount: made.length, externalId: "-probe-fanout-purchase-orders" }),
      failed: () => ({ status: 502, rowCount: null }),
    });
    expect(h.orgRows[0]).toMatchObject({ externalId: "-probe-fanout-purchase-orders", rowCount: 3 });
    expect(h.platformRows[0]).toMatchObject({ target: { serviceKey: "-probe-fanout-purchase-orders" } });
  });

  it("records SAP's own refusal as SAP_REFUSED", async () => {
    const call = open();
    await throughContain(call);
    await call.callSap(async () => 1, { answered: () => ({ status: 403, rowCount: null, sapStatus: 403 }), failed: () => ({ status: 502, rowCount: null }) });
    expect(h.platformRows[0]).toMatchObject({ outcome: "SAP_REFUSED", status: 403 });
  });
});

describe("the write-back's mode", () => {
  const write = () => open({ viewer: admin, mode: "write", route: "/api/sap/tdd/write" });

  it("cannot send a write without the P0.7 row's handle, nor before authorise and bind", async () => {
    const call = write();
    const fn = vi.fn(async () => "sent");
    await expect(call.callSapWrite({ id: "pae_1", correlationId: "c" }, fn)).rejects.toBeInstanceOf(ConsolePipelineError);
    await call.authorise();
    await call.bind();
    await expect(call.callSapWrite({ id: "", correlationId: "c" }, fn)).rejects.toBeInstanceOf(ConsolePipelineError);
    expect(fn).not.toHaveBeenCalled();
    expect(await call.callSapWrite({ id: "pae_1", correlationId: "c" }, fn)).toBe("sent");
  });

  it("writes no read row of its own, takes no circuit, and has no read call", async () => {
    vi.stubEnv("COREEDGE_ENV_TENANT_HOSTS", "enforce");
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const refused = open({ viewer: admin, mode: "write", target: deployment(UNLISTED) });
    await refused.authorise();
    expect((await refused.bind()).ok).toBe(false);
    expect(h.orgRows).toEqual([]);
    expect(h.platformRows).toEqual([]);
    const call = write();
    await call.authorise();
    await call.bind();
    await expect(call.contain()).rejects.toBeInstanceOf(ConsolePipelineError);
    await expect(
      call.callSap(async () => 1, { answered: () => ({ status: 200, rowCount: 1 }), failed: () => ({ status: 502, rowCount: null }) }),
    ).rejects.toBeInstanceOf(ConsolePipelineError);
  });
});

describe("env-tenant-hosts", () => {
  it("reads the setting: observe unless exactly enforce or off, a typo included", () => {
    expect(envTenantHostMode({})).toBe("observe");
    expect(envTenantHostMode({ COREEDGE_ENV_TENANT_HOSTS: "enforce" })).toBe("enforce");
    expect(envTenantHostMode({ COREEDGE_ENV_TENANT_HOSTS: " OFF " })).toBe("off");
    expect(envTenantHostMode({ COREEDGE_ENV_TENANT_HOSTS: "enfroce" })).toBe("observe");
  });

  it("counts the token endpoint as a destination when the prefix exchanges a token", () => {
    const tenant = { key: "default", baseUrl: LISTED };
    expect(deploymentTenantUrls("S4_TDD", tenant, { S4_TDD_AUTH_TYPE: "basic", S4_TDD_OAUTH_TOKEN_URL: "https://x" })).toEqual([
      { variable: "S4_TDD_BASE_URL", url: LISTED },
    ]);
    expect(
      deploymentTenantUrls("SF_TDD", tenant, {
        SF_TDD_TENANTS_JSON: "[]",
        SF_TDD_AUTH_TYPE: "oauth-saml-bearer",
        SF_TDD_OAUTH_TOKEN_URL: "https://api17.sapsf.com/oauth/token",
      }),
    ).toEqual([
      { variable: "SF_TDD_TENANTS_JSON[default]", url: LISTED },
      { variable: "SF_TDD_OAUTH_TOKEN_URL", url: "https://api17.sapsf.com/oauth/token" },
    ]);
  });

  it("is the stored-connection rule: https, no IP literal, a SAP suffix or SAP_HOST_ALLOWLIST_EXTRA", () => {
    const urls = (u: string) => [{ variable: "V", url: u }];
    expect(checkConfiguredUrls(urls(LISTED), {}).allowed).toBe(true);
    expect(checkConfiguredUrls(urls("http://my000002-api.s4hana.cloud.sap"), {}).allowed).toBe(false);
    expect(checkConfiguredUrls(urls("https://10.1.2.3"), {}).allowed).toBe(false);
    expect(checkConfiguredUrls(urls(UNLISTED), {}).findings).toEqual([
      expect.objectContaining({ variable: "V", host: "s4.landscape.example.net" }),
    ]);
    expect(checkConfiguredUrls(urls(UNLISTED), { SAP_HOST_ALLOWLIST_EXTRA: "landscape.example.net" }).allowed).toBe(true);
  });

  it("reports every configured tenant without a secret, and a prefix that will not parse", () => {
    vi.stubEnv("S4_TDD_TENANTS_JSON", JSON.stringify([{ key: "a", label: "A", baseUrl: UNLISTED }]));
    vi.stubEnv("S4_TDD_PASSWORD", "hunter2-secret");
    vi.stubEnv("SF_TDD_TENANTS_JSON", "{not json");
    const report = auditConfiguredTenantHosts();
    expect(report).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ product: "s4hana", tenantKey: "a", check: expect.objectContaining({ allowed: false }) }),
        expect.objectContaining({ product: "successfactors", check: null }),
      ]),
    );
    expect(JSON.stringify(report)).not.toContain("hunter2-secret");
  });
});
