// @vitest-environment node
/**
 * Roadmap P0.6 — the Ariba explorer says what it actually does (audit A71-A75).
 *
 * One block per finding, each against the real catalogue and call routes and
 * the real connector; only the session, the audit writer and the network are
 * stubbed. The rule every block checks besides its own finding: when the
 * request or the deployment's configuration is bad, nothing leaves — no token
 * exchange, no realm call.
 */
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  logDecision: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/audit/decision-logger", () => ({ logDecision: mocks.logDecision }));

import { GET as catalogGET } from "@/app/api/sap/ariba/catalog/route";
import { GET as callGET } from "@/app/api/sap/ariba/call/route";
import { AribaRealmConfigError, callAribaEndpoint, getAribaRealms } from "@/lib/sap-public/ariba-connector";

const TOKEN_URL = "https://ariba-token.test/v2/oauth/token";
const BASE_URL = "https://ariba-api.test";

interface CatalogBody {
  data: {
    configured: boolean;
    realms: Array<{ key: string; label: string }>;
    realmsError: string | null;
    endpoints: Array<{ key: string; path: string; description: string; pinnedLegacy?: boolean }>;
  };
}
interface CallBody {
  data?: {
    ok: boolean;
    status: number;
    stage: "token" | "request";
    failureReason: string | null;
    rows: unknown[];
    fields: string[];
    error: string | null;
  };
  error?: { code: string; message: string };
}

let fetchMock: ReturnType<typeof vi.fn>;
let tokenAnswer: () => Response;
let realmAnswer: () => Response;

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function call(query: string): Promise<Response> {
  return callGET(new NextRequest(`http://localhost/api/sap/ariba/call?${query}`));
}

/** The URLs fetched, token exchange included. */
const fetched = (): string[] => fetchMock.mock.calls.map((c) => String(c[0]));
const realmCalls = (): URL[] => fetched().filter((u) => u.startsWith(BASE_URL)).map((u) => new URL(u));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurrentUser.mockResolvedValue({ id: "c1", role: "consultant", organizationId: "org1", email: "c@x.test" });
  vi.stubEnv("ARIBA_BASE_URL", BASE_URL);
  vi.stubEnv("ARIBA_API_KEY", "app-key");
  vi.stubEnv("ARIBA_OAUTH_TOKEN_URL", TOKEN_URL);
  vi.stubEnv("ARIBA_CLIENT_ID", "client");
  vi.stubEnv("ARIBA_CLIENT_SECRET", "secret");
  vi.stubEnv("ARIBA_REALM", "acme-T");
  vi.stubEnv("ARIBA_REALMS_JSON", "");
  vi.stubEnv("ARIBA_SOURCING_V1", "");
  vi.stubEnv("ARIBA_REALM_ALLOWLIST", "");
  tokenAnswer = () => json({ access_token: "tok" });
  realmAnswer = () => json({ content: [{ id: "S1" }, { id: "S2" }] });
  fetchMock = vi.fn(async (input: unknown) =>
    String(input).startsWith(TOKEN_URL) ? tokenAnswer() : realmAnswer(),
  );
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("A71 — the catalogue shows the paths the call route sends to", () => {
  it("lists the v1 sourcing paths, and says so, while ARIBA_SOURCING_V1 pins them", async () => {
    vi.stubEnv("ARIBA_SOURCING_V1", "true");

    const catalog = (await (await catalogGET()).json()) as CatalogBody;
    const events = catalog.data.endpoints.find((e) => e.key === "sourcing-events")!;
    const res = await call("endpoint=sourcing-events&realm=acme-T");

    expect(res.status).toBe(200);
    expect(realmCalls()).toHaveLength(1);
    expect(events.path).toBe(realmCalls()[0]!.pathname);
    expect(events.path).toContain("/v1/");
    expect(events.description).not.toContain("2.0.0");
    expect(events.description).toContain("ARIBA_SOURCING_V1");
    expect(events.pinnedLegacy).toBe(true);
    const projects = catalog.data.endpoints.find((e) => e.key === "sourcing-projects")!;
    expect(projects.path).toContain("/v1/");
    expect(projects.description).not.toContain("2.0.0");
  });

  it("lists v2, unmarked, when nothing is pinned", async () => {
    const catalog = (await (await catalogGET()).json()) as CatalogBody;
    const events = catalog.data.endpoints.find((e) => e.key === "sourcing-events")!;
    expect(events.path).toContain("/v2/");
    expect(events.pinnedLegacy).toBeUndefined();
  });
});

describe("A72 — a malformed realm configuration is an error, not zero realms", () => {
  it.each([
    ["a single object", '{"key":"acme-T","label":"Test"}'],
    ["a trailing comma", '[{"key":"acme-T"},]'],
    ["an entry that is not an object", '["acme-T"]'],
    ["an entry with neither key nor label", '[{"name":"acme-T"}]'],
  ])("the catalogue reports %s as invalid and not configured", async (_label, value) => {
    vi.stubEnv("ARIBA_REALMS_JSON", value);
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await catalogGET();
    const body = (await res.json()) as CatalogBody;

    expect(res.status).toBe(200);
    expect(body.data.realmsError).toMatch(/^ARIBA_REALMS_JSON is invalid: /);
    expect(body.data.configured).toBe(false);
    expect(body.data.realms).toEqual([]);
    // The log names the variable, never its value.
    expect(JSON.stringify(spy.mock.calls)).not.toContain("acme-T");
    spy.mockRestore();
  });

  it("the call route refuses with 400 and sends nothing while the realm configuration is invalid", async () => {
    vi.stubEnv("ARIBA_REALMS_JSON", '{"key":"acme-T","label":"Test"}');

    const res = await call("endpoint=suppliers&realm=");
    const body = (await res.json()) as CallBody;

    expect(res.status).toBe(400);
    expect(body.error?.code).toBe("VALIDATION_ERROR");
    expect(body.error?.message).toMatch(/realm configuration is invalid/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses a missing realm, or one the deployment does not configure, before any token exchange", async () => {
    for (const realm of ["", "someone-elses-realm"]) {
      const res = await call(`endpoint=suppliers&realm=${realm}`);
      expect(res.status).toBe(400);
      expect(((await res.json()) as CallBody).error?.code).toBe("VALIDATION_ERROR");
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("ARIBA_REALM_ALLOWLIST=off restores the pass-through, but never for a malformed list", async () => {
    vi.stubEnv("ARIBA_REALM_ALLOWLIST", "off");
    expect((await call("endpoint=suppliers&realm=other-realm")).status).toBe(200);
    expect(realmCalls().map((u) => u.searchParams.get("realm"))).toEqual(["other-realm"]);

    fetchMock.mockClear();
    vi.stubEnv("ARIBA_REALMS_JSON", "[");
    expect((await call("endpoint=suppliers&realm=other-realm")).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("still serves a configured realm, and an absent realm while none is configured", async () => {
    expect((await call("endpoint=suppliers&realm=acme-T")).status).toBe(200);
    vi.stubEnv("ARIBA_REALM", "");
    expect((await call("endpoint=suppliers")).status).toBe(200);
    expect(realmCalls().map((u) => u.searchParams.get("realm"))).toEqual(["acme-T", null]);
  });

  it("keeps reading a valid list, a label alone still deriving its key as before", () => {
    vi.stubEnv("ARIBA_REALMS_JSON", '[{"key":" acme-T ","label":"Test"},{"label":"Prod Realm"},{"key":"acme-Q"}]');
    expect(getAribaRealms()).toEqual([
      { key: "acme-T", label: "Test" },
      { key: "prod-realm", label: "Prod Realm" },
      { key: "acme-Q", label: "acme-Q" },
    ]);
  });

  it("getAribaRealms throws a typed error whose message carries no configured value", () => {
    vi.stubEnv("ARIBA_REALMS_JSON", '{"key":"acme-T"');
    expect(AribaRealmConfigError).toBeTypeOf("function");
    expect(() => getAribaRealms()).toThrow(AribaRealmConfigError);
    expect(() => getAribaRealms()).toThrow("ARIBA_REALMS_JSON is invalid: it is not valid JSON");
    expect(() => getAribaRealms()).not.toThrow(/acme-T/);
  });
});

describe("A73 — an unknown endpoint key is the caller's error", () => {
  it("answers 400 VALIDATION_ERROR and contacts nothing", async () => {
    const res = await call("endpoint=operational-views&realm=acme-T");
    const body = (await res.json()) as CallBody;

    expect(res.status).toBe(400);
    expect(body.error).toEqual({ code: "VALIDATION_ERROR", message: "Unknown Ariba endpoint: operational-views" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("A74 — a token-endpoint failure is reported as one", () => {
  it("names a non-JSON 503 from the token endpoint as the token endpoint failing, and never calls the realm", async () => {
    tokenAnswer = () =>
      new Response("<html>Service Unavailable</html>", { status: 503, headers: { "content-type": "text/html" } });

    const res = await call("endpoint=suppliers&realm=acme-T");
    const body = (await res.json()) as CallBody;

    expect(res.status).toBe(200);
    expect(body.data).toMatchObject({ ok: false, status: 0, stage: "token", failureReason: "TOKEN_HTTP_503" });
    expect(body.data?.error).toContain("HTTP 503");
    expect(body.data?.error).toMatch(/token endpoint/i);
    expect(body.data?.error).not.toMatch(/JSON/);
    expect(realmCalls()).toHaveLength(0);
    expect(mocks.logDecision).toHaveBeenCalledWith(
      expect.objectContaining({
        newValue: expect.objectContaining({ stage: "token", failureReason: "TOKEN_HTTP_503" }),
      }),
    );
  });

  it("names a refusal as the deployment's ARIBA_* credentials, without echoing the token endpoint's body", async () => {
    tokenAnswer = () => json({ error: "invalid_client", error_description: "secret=hunter2" }, 401);

    const body = (await (await call("endpoint=suppliers&realm=acme-T")).json()) as CallBody;

    expect(body.data).toMatchObject({ ok: false, stage: "token", failureReason: "TOKEN_REJECTED" });
    expect(body.data?.error).toContain("ARIBA_CLIENT_SECRET");
    expect(body.data?.error).not.toContain("hunter2");
  });

  it("names a 404 from the token endpoint as a wrong ARIBA_OAUTH_TOKEN_URL", async () => {
    tokenAnswer = () => new Response("Not Found", { status: 404, headers: { "content-type": "text/plain" } });

    const body = (await (await call("endpoint=suppliers&realm=acme-T")).json()) as CallBody;

    expect(body.data).toMatchObject({ ok: false, stage: "token", failureReason: "TOKEN_URL_HTTP_404" });
    expect(body.data?.error).toContain("ARIBA_OAUTH_TOKEN_URL does not point at a token endpoint (HTTP 404)");
    expect(realmCalls()).toHaveLength(0);
  });

  it("names a 200 that carries no token, HTML included, as a token answer without a token", async () => {
    tokenAnswer = () => new Response("<html>login</html>", { status: 200, headers: { "content-type": "text/html" } });

    const body = (await (await call("endpoint=suppliers&realm=acme-T")).json()) as CallBody;

    expect(body.data).toMatchObject({ ok: false, stage: "token", failureReason: "TOKEN_NO_TOKEN" });
    expect(body.data?.error).not.toMatch(/JSON/);
    expect(realmCalls()).toHaveLength(0);
  });

  it("names an unreachable or silent token endpoint without its URL, in the TOKEN_* vocabulary", async () => {
    const unreachable = Object.assign(new TypeError("fetch failed"), {
      cause: Object.assign(new Error(`connect ECONNREFUSED ${TOKEN_URL}`), { code: "ECONNREFUSED" }),
    });
    tokenAnswer = () => {
      throw unreachable;
    };
    let body = (await (await call("endpoint=suppliers&realm=acme-T")).json()) as CallBody;
    expect(body.data).toMatchObject({ ok: false, stage: "token", failureReason: "TOKEN_ECONNREFUSED" });
    expect(body.data?.error).not.toContain("ariba-token.test");

    tokenAnswer = () => {
      throw Object.assign(new Error("aborted"), { name: "AbortError" });
    };
    body = (await (await call("endpoint=suppliers&realm=acme-T")).json()) as CallBody;
    expect(body.data).toMatchObject({ ok: false, stage: "token", failureReason: "TOKEN_TIMEOUT" });
    expect(body.data?.error).toMatch(/did not answer in time/);
    expect(realmCalls()).toHaveLength(0);
  });

  it("keeps the realm's own status when its JSON-labelled body is not JSON", async () => {
    realmAnswer = () => new Response("<html>oops</html>", { status: 502, headers: { "content-type": "application/json" } });

    const body = (await (await call("endpoint=suppliers&realm=acme-T")).json()) as CallBody;

    expect(body.data).toMatchObject({ ok: false, status: 502, stage: "request" });
    expect(body.data?.error).toContain("HTTP 502");
  });

  it("marks a realm call that ran as the request stage", async () => {
    const body = (await (await call("endpoint=suppliers&realm=acme-T")).json()) as CallBody;
    expect(body.data).toMatchObject({ ok: true, status: 200, stage: "request", failureReason: null });
  });
});

describe("A75 — a limit that is not a positive integer is refused, never sent as NaN", () => {
  it.each(["limit=", "limit=abc", "limit=0", "limit=-3", "limit=2.5", "limit=10abc"])(
    "%s answers 400 and contacts nothing",
    async (limit) => {
      const res = await call(`endpoint=suppliers&realm=acme-T&${limit}`);
      expect(res.status).toBe(400);
      expect(((await res.json()) as CallBody).error).toEqual({
        code: "VALIDATION_ERROR",
        message: "limit must be a positive integer",
      });
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it("defaults an absent limit to 10 and caps a large one at 50", async () => {
    await call("endpoint=suppliers&realm=acme-T");
    await call("endpoint=suppliers&realm=acme-T&limit=500");
    expect(realmCalls().map((u) => u.searchParams.get("$top"))).toEqual(["10", "50"]);
  });

  it("the connector itself never sends NaN, and its fields describe the rows it returns", async () => {
    realmAnswer = () => json({ content: [{ id: "S1" }, { id: "S2", extra: 1 }] });

    const result = await callAribaEndpoint("suppliers", "acme-T", Number.NaN);

    const sent = realmCalls()[0]!;
    expect(sent.searchParams.get("$top")).toBe("10");
    expect(sent.searchParams.get("limit")).toBe("10");
    expect(result.rows).toHaveLength(2);

    fetchMock.mockClear();
    const one = await callAribaEndpoint("suppliers", "acme-T", 1);
    expect(one.rows).toEqual([{ id: "S1" }]);
    expect(one.fields).toEqual(["id"]);
  });
});
