// @vitest-environment node
/**
 * The write route decides an Idempotency-Key's fate on what the write did —
 * and audits a replay as a replay (audit A03, A04, A07, A25).
 *
 * The real route, the real executor and the real credential builder; only the
 * gates, the key store and the audit writer are mocked, and SAP is a fetch stub.
 *
 *   - A credential that fails before anything is sent, a CSRF handshake that
 *     hangs, and a POST SAP throttles were all stored as the key's final
 *     outcome for 24 hours. A client that fixed the cause and retried with the
 *     same key, as the contract tells it to, got the old failure replayed, and
 *     could only finish under a new key. They are released now.
 *   - A POST that times out after it was sent is genuinely ambiguous, and stays
 *     stored — but the response says what a retry will get.
 *   - A replay was audited as a fresh WRITE with no connection: billed again,
 *     counted as another upstream error, and as a refusal before any binding.
 */

import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type * as Idempotency from "@/lib/northbound/idempotency";
import type * as Resolver from "@/lib/sap-public/connection-resolver";
import type { ResolvedSapConnection } from "@/lib/sap-public/connection-resolver";

const { mocks, state, BASE, TOKEN_URL } = vi.hoisted(() => ({
  mocks: { reserve: vi.fn(), complete: vi.fn(), release: vi.fn(), audit: vi.fn() },
  state: { connection: null as unknown as ResolvedSapConnection },
  BASE: "https://my404711-api.s4hana.cloud.sap",
  TOKEN_URL: "https://tenant.authentication.eu10.hana.ondemand.com/oauth/token",
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
vi.mock("@/lib/security/rate-limit", () => ({
  checkRateLimit: async () => ({ allowed: true }),
  RATE_LIMITS: { northbound: {} },
}));
vi.mock("@/lib/northbound/access", () => ({
  resolveWritableInterface: async () => ({
    ok: true,
    iface: {
      id: "if_1",
      name: "Create BP",
      version: 1,
      entitySet: "A_BusinessPartner",
      sapProduct: "s4hana",
      externalId: "API_BUSINESS_PARTNER",
    },
  }),
}));
// The binding is mocked; the credential builder is the real one, so a refused
// token exchange fails exactly where it does in production.
vi.mock("@/lib/sap-public/connection-resolver", async (importOriginal) => ({
  ...(await importOriginal<typeof Resolver>()),
  resolveSapConnectionForEnvironment: async () => ({ ok: true, connection: state.connection }),
}));
vi.mock("@/lib/sap-public/resolve-hub-service", () => ({
  resolveHubService: async () => ({ path: "/sap/opu/odata/sap/API_BUSINESS_PARTNER" }),
}));
vi.mock("@/lib/northbound/idempotency", async (importOriginal) => ({
  ...(await importOriginal<typeof Idempotency>()),
  reserveIdempotencyKey: mocks.reserve,
  completeIdempotencyKey: mocks.complete,
  releaseIdempotencyKey: mocks.release,
}));

import { POST } from "@/app/api/northbound/interfaces/[id]/data/write/route";
import { clearOAuthTokenCache } from "@/lib/sap-public/connection-resolver";

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
  timeoutMs: 50,
  environment: "SANDBOX",
  client: null,
};
const OAUTH: ResolvedSapConnection = {
  ...BASIC,
  authType: "oauth-client-credentials",
  oauthTokenUrl: TOKEN_URL,
  secrets: { clientId: "sb-client", clientSecret: "rotated-on-btp" },
};

type Handler = (url: string, init: RequestInit) => Promise<Response>;
const hang: Handler = (_url, init) =>
  new Promise((_resolve, reject) => {
    init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
  });
const handshake: Handler = async () => new Response("", { headers: { "x-csrf-token": "tok" } });
const created: Handler = async () => Response.json({ d: { BusinessPartner: "1000123" } }, { status: 201 });

/** SAP, as a stub: one handler per method. Every call is recorded. */
function sap(handlers: { token?: Handler; GET?: Handler; POST?: Handler }) {
  const f = vi.fn(async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = String(input);
    if (url === TOKEN_URL) return (handlers.token ?? (async () => Response.json({ access_token: "t" })))(url, init);
    const h = init.method === "POST" ? handlers.POST : handlers.GET;
    if (!h) throw new Error(`unexpected ${init.method} ${url}`);
    return h(url, init);
  });
  vi.stubGlobal("fetch", f);
  return f;
}
const methods = (f: ReturnType<typeof sap>) =>
  f.mock.calls.map(([u, i]) => (String(u) === TOKEN_URL ? "TOKEN" : (i as RequestInit).method));

function post() {
  return POST(
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
}
const lastAudit = () => mocks.audit.mock.calls.at(-1)?.[0] as Record<string, unknown>;

beforeEach(() => {
  state.connection = BASIC;
  mocks.reserve.mockResolvedValue({ outcome: "proceed", recordId: "idem_1" });
  mocks.complete.mockResolvedValue(undefined);
  mocks.release.mockResolvedValue(undefined);
  mocks.audit.mockResolvedValue(undefined);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  clearOAuthTokenCache();
});

describe("a credential that fails before anything is sent (A25)", () => {
  it("is a 403 FORBIDDEN, releases the key, and touches only the token endpoint", async () => {
    state.connection = OAUTH;
    const f = sap({ token: async () => Response.json({ error: "invalid_client" }, { status: 401 }) });

    const res = await post();
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("FORBIDDEN");
    expect(body.error.message).toContain("nothing was sent to the tenant");
    expect(methods(f)).toEqual(["TOKEN"]);

    // Released, not frozen: a retry after the secret is fixed performs the write.
    expect(mocks.release).toHaveBeenCalledWith({ organizationId: "org_a" }, "idem_1");
    expect(mocks.complete).not.toHaveBeenCalled();
    // Audited as a setup failure, not as the tenant's 5xx.
    expect(lastAudit()).toMatchObject({ status: 403, failureReason: "TOKEN_REJECTED", replayed: false });
  });

  it("a connection missing its password is the same, with no fetch at all", async () => {
    state.connection = { ...BASIC, secrets: { username: "u" } };
    const f = sap({});
    expect((await post()).status).toBe(403);
    expect(f).not.toHaveBeenCalled();
    expect(mocks.release).toHaveBeenCalledTimes(1);
    expect(mocks.complete).not.toHaveBeenCalled();
  });
});

/*
 * A TOKEN ENDPOINT THAT IS DOWN IS NOT A CONNECTION TO FIX. Every credential
 * failure became 403 FORBIDDEN "fix the connection in Studio", the code the
 * developer fixtures teach as "not set up" — so an IdP answering 503, a reset
 * socket and a SuccessFactors exchange that timed out each told a client to
 * stop retrying a write during an outage the read route calls a 502. The key
 * is still released for each: nothing reached the tenant.
 */
describe("a token endpoint that is down is retryable, not a setup problem", () => {
  const SAML: ResolvedSapConnection = {
    ...BASIC,
    product: "successfactors",
    authType: "oauth-saml-bearer",
    oauthTokenUrl: TOKEN_URL,
    secrets: { clientId: "sf-api-key", companyId: "acmeT1", samlAssertion: "PHNhbWw+" },
  };
  afterEach(() => {
    vi.useRealTimers();
  });

  async function expectRetryable(status: number, code: string, failureReason: string) {
    const res = await post();
    expect(res.status).toBe(status);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe(code);
    expect(body.error.message).not.toContain("Fix the connection");
    expect(body.error.message).toContain("nothing was sent to the tenant");
    // Released: the retry the message asks for really does write.
    expect(mocks.release).toHaveBeenCalledWith({ organizationId: "org_a" }, "idem_1");
    expect(mocks.complete).not.toHaveBeenCalled();
    expect(lastAudit()).toMatchObject({ status, failureReason, replayed: false });
  }

  it("an OAuth token endpoint answering 503 is a 502 UPSTREAM_ERROR", async () => {
    state.connection = OAUTH;
    const f = sap({
      token: async () => new Response("<html>Service Unavailable</html>", { status: 503, headers: { "content-type": "text/html" } }),
    });
    await expectRetryable(502, "UPSTREAM_ERROR", "TOKEN_HTTP_503");
    expect(methods(f)).toEqual(["TOKEN"]);
  });

  it("an OAuth token endpoint that resets the connection is a 502 UPSTREAM_ERROR", async () => {
    state.connection = OAUTH;
    const f = sap({
      token: async () => {
        throw new TypeError("fetch failed", {
          cause: Object.assign(new Error("read ECONNRESET"), { code: "ECONNRESET" }),
        });
      },
    });
    // Not a bare ECONNRESET: that is the row an unreachable tenant leaves.
    await expectRetryable(502, "UPSTREAM_ERROR", "TOKEN_ECONNRESET");
    expect(methods(f)).toEqual(["TOKEN"]);
  });

  it("a SAML token endpoint that hangs past its timeout is a 504 UPSTREAM_TIMEOUT", async () => {
    state.connection = SAML;
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const f = sap({ token: hang });
    const pending = expectRetryable(504, "UPSTREAM_TIMEOUT", "TOKEN_TIMEOUT");
    // The exchange's own bound, TOKEN_REQUEST_TIMEOUT_MS.
    await vi.advanceTimersByTimeAsync(10_000);
    await pending;
    expect(methods(f)).toEqual(["TOKEN"]);
  });

  it("a SAML token endpoint answering 503 is a 502 UPSTREAM_ERROR", async () => {
    state.connection = SAML;
    sap({ token: async () => new Response("", { status: 503 }) });
    await expectRetryable(502, "UPSTREAM_ERROR", "TOKEN_HTTP_503");
  });

  /*
   * A WRONG TOKEN URL IS NOT AN OUTAGE. The token endpoint's path is wrong
   * (404) or lands on a login page (200 HTML): the same answer every time, so
   * "retry later" sent the client round a loop that never ends.
   */
  it.each([
    ["an OAuth token URL answering 404", "OAUTH", 404, "TOKEN_URL_HTTP_404"],
    ["an OAuth token URL answering 405", "OAUTH", 405, "TOKEN_URL_HTTP_405"],
    ["a SAML token URL answering 404", "SAML", 404, "TOKEN_URL_HTTP_404"],
  ] as const)("%s is a 403 FORBIDDEN to check the token URL", async (_label, kind, code, reason) => {
    state.connection = kind === "OAUTH" ? OAUTH : SAML;
    const f = sap({
      token: async () =>
        new Response("<html><body>Sign in</body></html>", { status: code, headers: { "content-type": "text/html" } }),
    });
    const res = await post();
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("FORBIDDEN");
    expect(body.error.message).toContain("Check the connection's token URL");
    expect(body.error.message).not.toContain("Retry later");
    expect(methods(f)).toEqual(["TOKEN"]);
    expect(mocks.release).toHaveBeenCalledWith({ organizationId: "org_a" }, "idem_1");
    expect(mocks.complete).not.toHaveBeenCalled();
    expect(lastAudit()).toMatchObject({ status: 403, failureReason: reason, replayed: false });
  });

  it("a SAML token endpoint answering a 200 maintenance page is a retryable 502, as the Studio Test says", async () => {
    state.connection = SAML;
    sap({
      token: async () =>
        new Response("<html><body>maintenance</body></html>", { status: 200, headers: { "content-type": "text/html" } }),
    });
    await expectRetryable(502, "UPSTREAM_ERROR", "TOKEN_NO_TOKEN");
  });

  it("a SAML exchange SuccessFactors refuses is still a 403 FORBIDDEN", async () => {
    state.connection = SAML;
    sap({ token: async () => Response.json({ errorMessage: "Unable to verify the signature" }, { status: 401 }) });
    const res = await post();
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("FORBIDDEN");
    expect(mocks.release).toHaveBeenCalledTimes(1);
    expect(lastAudit()).toMatchObject({ status: 403, failureReason: "TOKEN_REJECTED" });
  });
});

describe("a timeout is stored only when the write was sent (A04)", () => {
  it("a hung CSRF handshake releases the key, and the same-key retry really writes", async () => {
    const f = sap({ GET: hang });
    const first = await post();
    expect(first.status).toBe(504);
    expect(((await first.json()) as { error: { message: string } }).error.message).toContain("never sent");
    expect(methods(f)).toEqual(["GET"]);
    expect(mocks.release).toHaveBeenCalledWith({ organizationId: "org_a" }, "idem_1");
    expect(mocks.complete).not.toHaveBeenCalled();

    // The tenant recovers. The reservation was deleted, so the same key
    // reserves afresh — and this time the record is created.
    mocks.reserve.mockResolvedValueOnce({ outcome: "proceed", recordId: "idem_2" });
    const g = sap({ GET: handshake, POST: created });
    const retry = await post();
    expect(retry.status).toBe(201);
    expect(retry.headers.get("idempotency-replayed")).toBeNull();
    expect(methods(g)).toEqual(["GET", "POST"]);
    expect(mocks.complete).toHaveBeenCalledWith({ organizationId: "org_a" }, "idem_2", 201, expect.anything());
  });

  it("a POST that hangs after it was sent is stored, and says what a retry gets", async () => {
    sap({ GET: handshake, POST: hang });
    const res = await post();
    expect(res.status).toBe(504);
    const message = ((await res.json()) as { error: { message: string } }).error.message;
    expect(message).toContain("may or may not have been applied");
    expect(message).toContain("returns this same answer until the key expires");
    expect(message).not.toContain("to find out");
    expect(mocks.complete).toHaveBeenCalledWith({ organizationId: "org_a" }, "idem_1", 504, expect.anything());
    expect(mocks.release).not.toHaveBeenCalled();
  });
});

describe("SAP throttling the POST (A07)", () => {
  it.each([429, 408])("HTTP %i is a 502 UPSTREAM_ERROR, never a 422 to fix the payload, and is released", async (code) => {
    sap({ GET: handshake, POST: async () => new Response("", { status: code }) });
    const res = await post();
    expect(res.status).toBe(502);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("UPSTREAM_ERROR");
    expect(body.error.message).not.toContain("field values");
    expect(mocks.release).toHaveBeenCalledTimes(1);
    expect(mocks.complete).not.toHaveBeenCalled();
  });

  it("a genuine validation failure is still a 422, still stored", async () => {
    sap({ GET: handshake, POST: async () => new Response("", { status: 400 }) });
    const res = await post();
    expect(res.status).toBe(422);
    expect(mocks.complete).toHaveBeenCalledWith({ organizationId: "org_a" }, "idem_1", 422, expect.anything());
    expect(mocks.release).not.toHaveBeenCalled();
  });
});

describe("a replay is audited as a replay (A03)", () => {
  it("marks the row, names the bound connection, and calls nothing upstream", async () => {
    mocks.reserve.mockResolvedValueOnce({ outcome: "replay", status: 201, body: { data: { created: true } } });
    const f = sap({});
    const res = await post();
    expect(res.status).toBe(201);
    expect(res.headers.get("idempotency-replayed")).toBe("true");
    expect(f).not.toHaveBeenCalled();
    expect(mocks.audit).toHaveBeenCalledTimes(1);
    expect(lastAudit()).toMatchObject({
      operation: "WRITE",
      status: 201,
      replayed: true,
      // Past the binding — not a call refused before any connection.
      connectionId: "conn_1",
      connectionEnvironment: "SANDBOX",
      // SAP was not called, so there is no duration to report.
      durationMs: null,
    });
  });

  it("a fresh write is not marked", async () => {
    sap({ GET: handshake, POST: created });
    expect((await post()).status).toBe(201);
    expect(lastAudit()).toMatchObject({ status: 201, replayed: false, connectionId: "conn_1" });
  });
});
