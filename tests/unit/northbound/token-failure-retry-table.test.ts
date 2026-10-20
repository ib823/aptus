// @vitest-environment node
/**
 * Token-endpoint answer × auth type × path → status, reason and retry advice,
 * checked against the developer guide's own retry table (roadmap P0.5).
 *
 * WHY ONE TABLE. A connection whose token endpoint answers one thing was told
 * different things on different surfaces: the broker and the console drew the
 * refused/outage line in two places (a 3xx was "fix the connection" on one and
 * "retry later" on the other), and the audit reason had two spellings per fact
 * by auth type (OAUTH_TOKEN_HTTP_503, SAML_BEARER_HTTP_503) or none at all that
 * said "token" (FETCH_FAILED, a bare TIMEOUT on the console). There is now one
 * classifier, credentialFailure, and this file holds every surface to it:
 *
 *   refused     — 403 FORBIDDEN on the broker, NEEDS_SETUP: do not retry.
 *   unavailable — 502 UPSTREAM_ERROR, TOKEN_HTTP_<n> / TOKEN_NO_TOKEN / TOKEN_<code>.
 *   timeout     — 504 UPSTREAM_TIMEOUT, TOKEN_TIMEOUT.
 *
 * The RETRY ADVICE is read from docs/coreedge-developer-guide.md, the table a
 * developer's retry logic is written from. If a status/code pair the broker
 * sends is missing from it, or the guide's advice disagrees with whether a
 * retry can help, this fails — fix the guide or the code, not this test.
 *
 * The real routes, executors, credential builder and token exchanges; only
 * auth, the gates, the binding, the key store and the audit writer are mocked.
 * One fetch stub plays both the token endpoint and the tenant, and the tenant
 * must never be called.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type * as Idempotency from "@/lib/northbound/idempotency";
import type * as Resolver from "@/lib/sap-public/connection-resolver";
import type * as RateLimit from "@/lib/security/rate-limit";
import type { ResolvedSapConnection } from "@/lib/sap-public/connection-resolver";

const { mocks, state, TOKEN_URL, BASE } = vi.hoisted(() => ({
  mocks: { reserve: vi.fn(), complete: vi.fn(), release: vi.fn(), audit: vi.fn() },
  state: { connection: null as unknown as ResolvedSapConnection },
  TOKEN_URL: "https://tenant.authentication.eu10.hana.ondemand.com/oauth/token",
  BASE: "https://my404711-api.s4hana.cloud.sap",
}));

vi.mock("@/lib/northbound/auth", () => ({
  authenticateClientToken: async () => ({
    ok: true,
    client: {
      clientId: "client_1",
      organizationId: "org_a",
      solutionId: "sol_1",
      scope: { organizationId: "org_a" },
      environment: "SANDBOX",
      sapClient: null,
    },
  }),
  extractBearer: (s: string | null) => s,
  touchClientLastUsed: vi.fn(),
}));
vi.mock("@/lib/northbound/write-credential", () => ({ verifyWriteCredential: async () => true }));
vi.mock("@/lib/northbound/audit", () => ({ recordNorthboundCall: mocks.audit }));
vi.mock("@/lib/security/rate-limit", async (importOriginal) => ({
  ...(await importOriginal<typeof RateLimit>()),
  checkRateLimit: async () => ({ allowed: true, remaining: 59, resetMs: 60_000 }),
}));
const IFACE = {
  id: "if_1",
  name: "Business partners",
  version: 1,
  entitySet: "A_BusinessPartner",
  sapProduct: "s4hana",
  externalId: "API_BUSINESS_PARTNER",
  draft: false,
};
vi.mock("@/lib/northbound/access", () => ({
  resolveReadableInterface: async () => ({ ok: true, iface: IFACE }),
  resolveWritableInterface: async () => ({ ok: true, iface: IFACE }),
}));
vi.mock("@/lib/sap-public/connection-resolver", async (importOriginal) => ({
  ...(await importOriginal<typeof Resolver>()),
  resolveSapConnectionForEnvironment: async () => ({ ok: true, connection: state.connection }),
}));
vi.mock("@/lib/sap-public/interface-service", () => ({
  resolveInterfaceService: async () => ({
    source: "catalogue",
    service: { path: "/sap/opu/odata/sap/API_BUSINESS_PARTNER" },
  }),
}));
vi.mock("@/lib/northbound/idempotency", async (importOriginal) => ({
  ...(await importOriginal<typeof Idempotency>()),
  reserveIdempotencyKey: mocks.reserve,
  completeIdempotencyKey: mocks.complete,
  releaseIdempotencyKey: mocks.release,
}));

import { GET as readRoute } from "@/app/api/northbound/interfaces/[id]/data/route";
import { POST as writeRoute } from "@/app/api/northbound/interfaces/[id]/data/write/route";
import { northboundThrottleRefusal } from "@/lib/northbound/respond";
import { consoleReadFailure } from "@/lib/sap-public/console-read-failure";
import { buildAuthHeadersFromConnection, clearOAuthTokenCache } from "@/lib/sap-public/connection-resolver";
import { SapCredentialError } from "@/lib/sap-public/upstream-failure";
import { fetchMetadataDocument } from "@/lib/studio/connection-health";
import { RATE_LIMITS } from "@/lib/security/rate-limit";

/* ───────────────────────────── the guide's table ───────────────────────────── */

type Advice = "no" | "after-retry-after" | "backoff";

function guideRetryTable(): Map<string, Advice> {
  const guide = readFileSync(path.join(process.cwd(), "docs/coreedge-developer-guide.md"), "utf8");
  const start = guide.indexOf("<!-- retry-table:");
  expect(start, "the developer guide lost its retry table marker").toBeGreaterThan(-1);
  const rows = guide
    .slice(start)
    .split("\n")
    .slice(1)
    .filter((l, i, all) => all.slice(0, i + 1).every((x) => x.startsWith("|")))
    .slice(2); // header and divider
  const table = new Map<string, Advice>();
  for (const row of rows) {
    const cells = row.split("|").map((c) => c.trim());
    const status = /`(\d{3})`/.exec(cells[1] ?? "")?.[1];
    const code = /`([A-Z_]+)`/.exec(cells[2] ?? "")?.[1];
    const retry = cells[4] ?? "";
    if (!status || !code) continue;
    const advice: Advice = retry.startsWith("**No")
      ? "no"
      : retry.includes("Retry-After")
        ? "after-retry-after"
        : retry.startsWith("**Yes")
          ? "backoff"
          : (() => {
              throw new Error(`unreadable retry advice for ${status} ${code}: ${retry}`);
            })();
    table.set(`${status} ${code}`, advice);
  }
  return table;
}

const GUIDE = guideRetryTable();

function adviceFor(status: number, code: string): Advice {
  const advice = GUIDE.get(`${status} ${code}`);
  expect(advice, `the developer guide has no row for ${status} ${code}`).toBeDefined();
  return advice!;
}

/* ─────────────────────────────── the matrix ─────────────────────────────── */

type Kind = "refused" | "unavailable" | "timeout";
type TokenHandler = () => Promise<Response>;

const page = (status: number) => async () =>
  new Response("<html><body>not a token</body></html>", { status, headers: { "content-type": "text/html" } });

const ANSWERS: Array<[label: string, handler: TokenHandler, kind: Kind, reason: string]> = [
  ["400 (invalid_grant)", async () => Response.json({ error: "invalid_grant" }, { status: 400 }), "refused", "TOKEN_REJECTED"],
  ["401 (invalid_client)", async () => Response.json({ error: "invalid_client" }, { status: 401 }), "refused", "TOKEN_REJECTED"],
  ["403 (gateway refusal)", page(403), "refused", "TOKEN_REJECTED"],
  ["404 (wrong path)", page(404), "refused", "TOKEN_URL_HTTP_404"],
  ["405 (wrong path)", page(405), "refused", "TOKEN_URL_HTTP_405"],
  ["302 (login page)", page(302), "refused", "TOKEN_URL_HTTP_302"],
  ["408", page(408), "unavailable", "TOKEN_HTTP_408"],
  ["429 (token endpoint throttling)", page(429), "unavailable", "TOKEN_HTTP_429"],
  ["500", page(500), "unavailable", "TOKEN_HTTP_500"],
  ["502", page(502), "unavailable", "TOKEN_HTTP_502"],
  ["503 (maintenance)", page(503), "unavailable", "TOKEN_HTTP_503"],
  ["504", page(504), "unavailable", "TOKEN_HTTP_504"],
  ["200 without a token (maintenance page)", page(200), "unavailable", "TOKEN_NO_TOKEN"],
  ["no answer in time", async () => Promise.reject(new DOMException("aborted", "AbortError")), "timeout", "TOKEN_TIMEOUT"],
  [
    "a reset socket",
    async () =>
      Promise.reject(
        new TypeError("fetch failed", { cause: Object.assign(new Error("read ECONNRESET"), { code: "ECONNRESET" }) }),
      ),
    "unavailable",
    "TOKEN_ECONNRESET",
  ],
];

const BASIC: ResolvedSapConnection = {
  source: "db",
  id: "conn_1",
  organizationId: "org_a",
  product: "s4hana",
  key: "sandbox",
  label: "Sandbox",
  baseUrl: BASE,
  authType: "basic",
  secrets: { username: "u", password: "p" },
  oauthTokenUrl: null,
  writeEnabled: true,
  apiPath: null,
  timeoutMs: 5_000,
  environment: "SANDBOX",
  client: null,
};
const AUTH_TYPES: Array<[label: string, connection: ResolvedSapConnection]> = [
  [
    "OAuth client credentials",
    {
      ...BASIC,
      authType: "oauth-client-credentials",
      oauthTokenUrl: TOKEN_URL,
      secrets: { clientId: "sb-client", clientSecret: "secret" },
    },
  ],
  [
    "SuccessFactors SAML bearer",
    {
      ...BASIC,
      product: "successfactors",
      authType: "oauth-saml-bearer",
      oauthTokenUrl: TOKEN_URL,
      secrets: { clientId: "sf-api-key", companyId: "acmeT1", samlAssertion: "PHNhbWw+" },
    },
  ],
];

/** What the broker answers for each kind, and whether a retry can help. */
const BROKER: Record<Kind, { status: number; code: string; advice: Advice }> = {
  refused: { status: 403, code: "FORBIDDEN", advice: "no" },
  unavailable: { status: 502, code: "UPSTREAM_ERROR", advice: "backoff" },
  timeout: { status: 504, code: "UPSTREAM_TIMEOUT", advice: "backoff" },
};

const MATRIX = AUTH_TYPES.flatMap(([authLabel, connection]) =>
  ANSWERS.map(([answerLabel, handler, kind, reason]) => ({ authLabel, connection, answerLabel, handler, kind, reason })),
);

let tenantCalls = 0;
function stubFetch(handler: TokenHandler) {
  tenantCalls = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request) => {
      if (String(input) === TOKEN_URL) return handler();
      tenantCalls++;
      throw new Error(`the tenant was called: ${String(input)}`);
    }),
  );
}
const lastAudit = () => mocks.audit.mock.calls.at(-1)?.[0] as Record<string, unknown>;

beforeEach(() => {
  mocks.reserve.mockResolvedValue({ outcome: "proceed", recordId: "idem_1" });
  mocks.complete.mockResolvedValue(undefined);
  mocks.release.mockResolvedValue(undefined);
  mocks.audit.mockResolvedValue(undefined);
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  vi.restoreAllMocks();
  clearOAuthTokenCache();
});

describe("the broker's READ path", () => {
  it.each(MATRIX)("$authLabel, token endpoint $answerLabel", async ({ connection, handler, kind, reason }) => {
    state.connection = connection;
    stubFetch(handler);
    const res = await readRoute(
      new NextRequest("http://localhost/api/northbound/interfaces/if_1/data", {
        headers: { authorization: "Bearer ce_test" },
      }),
      { params: Promise.resolve({ id: "if_1" }) },
    );
    const body = (await res.json()) as { error: { code: string } };
    const expected = BROKER[kind];
    expect({ status: res.status, code: body.error.code }).toEqual({ status: expected.status, code: expected.code });
    expect(lastAudit()).toMatchObject({ status: expected.status, failureReason: reason });
    expect(adviceFor(res.status, body.error.code)).toBe(expected.advice);
    expect(tenantCalls).toBe(0);
  });
});

describe("the broker's WRITE path", () => {
  it.each(MATRIX)("$authLabel, token endpoint $answerLabel", async ({ connection, handler, kind, reason }) => {
    state.connection = connection;
    stubFetch(handler);
    const res = await writeRoute(
      new NextRequest("http://localhost/api/northbound/interfaces/if_1/data/write", {
        method: "POST",
        headers: {
          authorization: "Bearer ce_test",
          "x-coreedge-write-key": "cew_test",
          "idempotency-key": "order-4471-a",
        },
        body: JSON.stringify({ record: { BusinessPartnerName: "Acme" } }),
      }),
      { params: Promise.resolve({ id: "if_1" }) },
    );
    const body = (await res.json()) as { error: { code: string; message: string } };
    const expected = BROKER[kind];
    expect({ status: res.status, code: body.error.code }).toEqual({ status: expected.status, code: expected.code });
    expect(lastAudit()).toMatchObject({ status: expected.status, failureReason: reason, replayed: false });
    expect(adviceFor(res.status, body.error.code)).toBe(expected.advice);
    // Nothing reached SAP, so the key is released whatever the kind: the
    // retry the advice allows really does write, and after a fix so does one
    // for a refusal.
    expect(mocks.release).toHaveBeenCalledWith({ organizationId: "org_a" }, "idem_1");
    expect(mocks.complete).not.toHaveBeenCalled();
    expect(body.error.message).toContain("nothing was sent to the tenant");
    expect(tenantCalls).toBe(0);
  });
});

/** Run the real credential step and return what it threw. */
async function credentialError(connection: ResolvedSapConnection): Promise<unknown> {
  try {
    await buildAuthHeadersFromConnection(connection);
  } catch (err) {
    return err;
  }
  throw new Error("the credential step did not fail");
}

describe("the console read path", () => {
  it.each(MATRIX)("$authLabel, token endpoint $answerLabel", async ({ connection, handler, kind, reason }) => {
    stubFetch(handler);
    const failure = consoleReadFailure(new SapCredentialError(await credentialError(connection)), "fallback");
    // The console has no timeout status of its own; every retryable failure is
    // its 502. A refusal is the 403 the broker gives — never a 5xx that the
    // upstream-errors incident would count against the tenant.
    expect(failure.auditStatus).toBe(kind === "refused" ? 403 : 502);
    expect(failure.status).toBe(kind === "refused" ? 403 : 502);
    expect(failure.failureReason).toBe(reason);
  });
});

describe("the connection Test and probe sweep", () => {
  it.each(MATRIX)("$authLabel, token endpoint $answerLabel", async ({ connection, handler, kind, reason }) => {
    stubFetch(handler);
    const tenant = vi.fn();
    const r = await fetchMetadataDocument(connection, "/sap/opu/odata/sap/API_BUSINESS_PARTNER", tenant);
    // UNAUTHORIZED is the platform admin's lane ("fix the connection"); ERROR
    // and TIMEOUT are an endpoint that failed — the same line the broker draws.
    expect(r.status).toBe(kind === "refused" ? "UNAUTHORIZED" : kind === "timeout" ? "TIMEOUT" : "ERROR");
    expect(r.failureReason).toBe(reason);
    expect(r.signedIn).toBe(false);
    expect(tenant).not.toHaveBeenCalled();
  });
});

describe("the broker's own throttle, in the same table", () => {
  it("a credential over its budget is 429 RATE_LIMITED — retry after Retry-After", async () => {
    const { response, status } = northboundThrottleRefusal(
      { allowed: false, remaining: 0, resetMs: 12_000, reason: "limited" },
      "corr",
      "Too many requests for this client credential.",
    );
    const body = (await response.json()) as { error: { code: string } };
    expect(status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("12");
    expect(adviceFor(response.status, body.error.code)).toBe("after-retry-after");
  });

  it("a limiter outage is 503 LIMITER_UNAVAILABLE — retry after Retry-After, never a 429", async () => {
    const { response, status, failureReason } = northboundThrottleRefusal(
      { allowed: false, remaining: 0, resetMs: 30_000, reason: "unavailable" },
      "corr",
      "Too many requests for this client credential.",
    );
    const body = (await response.json()) as { error: { code: string } };
    expect(status).toBe(503);
    expect(failureReason).toBe("LIMITER_UNAVAILABLE");
    expect(response.headers.get("retry-after")).toBe("30");
    expect(adviceFor(response.status, body.error.code)).toBe("after-retry-after");
  });

  it("the guide states the budget the broker enforces", () => {
    const guide = readFileSync(path.join(process.cwd(), "docs/coreedge-developer-guide.md"), "utf8");
    const n = RATE_LIMITS.northbound.limit;
    expect(guide).toContain(`${n} reads and ${n} writes a minute`);
  });
});
