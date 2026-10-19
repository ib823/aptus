// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { writeEntitySet, writeHttpStatusFor } from "@/lib/northbound/write";
import { extractCookies } from "@/lib/sap-public/cookies";
import { clearOAuthTokenCache, type ResolvedSapConnection } from "@/lib/sap-public/connection-resolver";

const connection: ResolvedSapConnection = {
  source: "db", id: "c1", organizationId: "org_a", product: "s4hana", key: "sandbox",
  label: "Test", baseUrl: "https://sap.example", authType: "basic",
  secrets: { username: "u", password: "p" }, oauthTokenUrl: null, writeEnabled: true,
  apiPath: null, timeoutMs: null, environment: "SANDBOX", client: "100",
};
const input = { connection, servicePath: "/sap/odata/API_TEST", entitySet: "A_Thing", payload: { Name: "Test" } };
function handshake() {
  const headers = new Headers({ "x-csrf-token": "csrf-test" });
  headers.append("set-cookie", "SAP_SESSION=abc==; Path=/; Secure; HttpOnly");
  headers.append("set-cookie", "sap-usercontext=sap-client=100; Expires=Wed, 09 Sep 2026 23:59:59 GMT; SameSite=Lax");
  return new Response("", { headers });
}
describe("CSRF session cookie forwarding", () => {
  it("sends each cookie pair once without response attributes", async () => {
    const f = vi.fn().mockResolvedValueOnce(handshake()).mockResolvedValueOnce(
      Response.json({ d: { ID: "1" } }, { status: 201 }),
    );
    expect((await writeEntitySet(input, f)).status).toBe("CREATED");
    const [url, init] = f.mock.calls[1] as [string, RequestInit];
    const headers = new Headers(init.headers);
    expect(headers.get("cookie")).toBe("SAP_SESSION=abc==; sap-usercontext=sap-client=100");
    expect(headers.get("x-csrf-token")).toBe("csrf-test");
    expect(url).toContain("sap-client=100");
    expect(init.method).toBe("POST");
  });
  it("handles combined fields with an Expires comma in runtimes without getSetCookie", () => {
    const headers = { get: () => "one=1; Expires=Wed, 09 Sep 2026 00:00:00 GMT, two=2; Path=/" } as unknown as Headers;
    expect(extractCookies(headers)).toBe("one=1; two=2");
    expect(extractCookies(new Headers())).toBe("");
  });
  it("never writes after a refused CSRF handshake", async () => {
    const f = vi.fn().mockResolvedValue(new Response("", { status: 403 }));
    expect((await writeEntitySet(input, f)).status).toBe("NEEDS_SETUP");
    expect(f).toHaveBeenCalledTimes(1);
  });
});
describe("write response validation", () => {
  it.each(["<html>Login</html>", "", "null", "[]", '{"error":{"message":"secret"}}', '{"d":null}'])(
    "refuses an invalid HTTP 200 response: %s", async (body) => {
      const f = vi.fn().mockResolvedValueOnce(handshake()).mockResolvedValueOnce(new Response(body));
      const result = await writeEntitySet(input, f);
      expect(result.status).toBe("ERROR");
      expect(writeHttpStatusFor(result.status)).toBe(502);
      expect(result.record).toBeNull();
      expect(result.detail).not.toContain("secret");
    },
  );
  it("allows 201 without a representation", async () => {
    const f = vi.fn().mockResolvedValueOnce(handshake()).mockResolvedValueOnce(new Response(null, { status: 201 }));
    expect((await writeEntitySet(input, f)).status).toBe("CREATED");
  });
});

/*
 * NO SAP HOST IN A WRITE RESULT. The created record came back as SAP's `d`
 * exactly as received — `__metadata.uri` and a `__deferred.uri` per navigation,
 * all absolute URLs on the tenant — and the Location header was passed through
 * as SAP sent it, absolute too. The route stores that envelope and replays it to
 * every retry for a day, so one create handed out the hostname, the service path
 * and the client for 24 hours.
 */
describe("the write result never carries the SAP host", () => {
  const svc = `${connection.baseUrl}:443${input.servicePath}`;
  const host = new URL(connection.baseUrl).host;

  function created(body: unknown, location: string | null) {
    const headers = new Headers({ "content-type": "application/json" });
    if (location !== null) headers.set("location", location);
    return new Response(body === null ? null : JSON.stringify(body), { status: 201, headers });
  }
  async function write(body: unknown, location: string | null) {
    const f = vi.fn().mockResolvedValueOnce(handshake()).mockResolvedValueOnce(created(body, location));
    return writeEntitySet(input, f);
  }

  it("strips V2's __metadata and deferred navigations from the record", async () => {
    const r = await write(
      {
        d: {
          __metadata: { id: `${svc}/A_Thing('1')`, uri: `${svc}/A_Thing('1')`, type: "API_TEST.A_ThingType" },
          ID: "1",
          Name: "Test",
          to_Parts: { __deferred: { uri: `${svc}/A_Thing('1')/to_Parts` } },
        },
      },
      `${svc}/A_Thing('1')?sap-client=100`,
    );
    expect(r.status).toBe("CREATED");
    expect(r.record).toEqual({ ID: "1", Name: "Test" });
    expect(JSON.stringify(r)).not.toContain(host);
  });

  it("strips V4's @odata.* links from the record", async () => {
    const r = await write(
      { "@odata.context": `${svc}/$metadata#A_Thing/$entity`, "@odata.etag": 'W/"1"', ID: "1" },
      null,
    );
    expect(r.record).toEqual({ ID: "1" });
  });

  it("reduces an absolute Location to the entity path after the service root", async () => {
    const r = await write({ d: { ID: "1" } }, `${svc}/A_Thing('1')?sap-client=100`);
    // The shape the idempotency store's own test already records.
    expect(r.location).toBe("/A_Thing('1')");
    expect(JSON.stringify(r)).not.toContain(host);
    expect(r.location).not.toContain("sap-client");
  });

  it("still names what was created when SAP sent no body at all", async () => {
    const r = await write(null, `${svc}/A_Thing('1')`);
    expect(r.status).toBe("CREATED");
    expect(r.record).toBeNull();
    expect(r.location).toBe("/A_Thing('1')");
  });

  it("accepts a relative Location and the service name in another case", async () => {
    expect((await write({ d: { ID: "1" } }, "A_Thing('1')")).location).toBe("/A_Thing('1')");
    expect(
      (await write({ d: { ID: "1" } }, `${connection.baseUrl}/SAP/ODATA/api_test/A_Thing('1')`)).location,
    ).toBe("/A_Thing('1')");
  });

  it.each([
    ["another host", "https://internal-gw.corp:8000/sap/odata/API_TEST/A_Thing('1')"],
    ["the same host over http", `http://${host}/sap/odata/API_TEST/A_Thing('1')`],
    ["another service on the same host", `${connection.baseUrl}/sap/odata/API_OTHER/A_Thing('1')`],
    ["the service root itself", `${svc}/`],
  ])("yields null for a Location on %s rather than passing it on", async (_label, location) => {
    const r = await write({ d: { ID: "1" } }, location);
    expect(r.status).toBe("CREATED");
    expect(r.location).toBeNull();
    expect(JSON.stringify(r)).not.toContain("internal-gw");
  });
});

/*
 * WHAT A FAILURE SAYS ABOUT THE RECORD (audit A04, A07, A25).
 *
 * `attempted` is what the route keys the Idempotency-Key's fate on: an
 * attempted write is stored and replayed, an unattempted one is released so the
 * same key genuinely retries. Before it, every outcome was stored — including
 * failures that provably never reached the record — and a client that fixed the
 * cause got the old answer back for 24 hours, then moved to a new key.
 */
const hang = (_url: string | URL | Request, init?: RequestInit) =>
  new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
  });
const fast = { ...input, connection: { ...connection, timeoutMs: 50 } };

describe("a credential that fails before anything is sent (A25)", () => {
  const oauth: ResolvedSapConnection = {
    ...connection,
    id: "c_oauth",
    authType: "oauth-client-credentials",
    oauthTokenUrl: "https://auth.example/oauth/token",
    secrets: { clientId: "client", clientSecret: "rotated-away" },
  };
  afterEach(() => {
    vi.unstubAllGlobals();
    clearOAuthTokenCache();
  });

  it("is NEEDS_SETUP with nothing sent when the connection is missing a field", async () => {
    const f = vi.fn();
    const r = await writeEntitySet({ ...input, connection: { ...connection, secrets: { username: "u" } } }, f);
    expect(r.status).toBe("NEEDS_SETUP");
    expect(writeHttpStatusFor(r.status)).toBe(403);
    expect(r.attempted).toBe(false);
    // Nothing was fetched, so not FETCH_FAILED — that code sent triage to SAP.
    expect(r.failureReason).toBe("CONNECTION_MISCONFIGURED");
    expect(r.detail).toContain("nothing was sent to the tenant");
    expect(f).not.toHaveBeenCalled();
  });

  it("is NEEDS_SETUP, not a 502, when the token endpoint refuses a rotated secret", async () => {
    const token = vi.fn(async () => Response.json({ error: "invalid_client" }, { status: 401 }));
    vi.stubGlobal("fetch", token);
    const f = vi.fn();
    const r = await writeEntitySet({ ...input, connection: oauth }, f);
    expect(r.status).toBe("NEEDS_SETUP");
    expect(r.attempted).toBe(false);
    expect(r.failureReason).toBe("OAUTH_TOKEN_REJECTED");
    // Only the token endpoint was contacted; no CSRF GET, no POST.
    expect(token).toHaveBeenCalledTimes(1);
    expect(f).not.toHaveBeenCalled();
    expect(r.detail).not.toContain("rotated-away");
  });

  it("does not blame the tenant when the token endpoint times out", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new DOMException("aborted", "AbortError"))));
    const f = vi.fn();
    const r = await writeEntitySet({ ...input, connection: oauth }, f);
    expect(r.status).toBe("TIMEOUT");
    expect(r.attempted).toBe(false);
    expect(r.failureReason).toBe("TOKEN_TIMEOUT");
    expect(r.detail).toContain("token endpoint");
    expect(r.detail).not.toContain("The tenant did not respond");
    expect(r.detail).not.toContain("may or may not");
    expect(f).not.toHaveBeenCalled();
  });
});

/*
 * AN IDENTITY PROVIDER THAT IS BRIEFLY DOWN IS NOT A CONNECTION TO FIX. A25
 * made every credential failure NEEDS_SETUP, and with it a token endpoint
 * answering 503 or 429, one that reset the connection, and a SuccessFactors
 * exchange that timed out all went out as 403 FORBIDDEN "fix the connection in
 * Studio" — the code a client is taught means "not set up", so it dropped or
 * escalated a write mid-outage that the read path, for the same outage, calls a
 * 502. Only a refusal of the credential itself is NEEDS_SETUP; nothing here is
 * sent to the tenant, so every one of them is still unattempted.
 */
describe("a token endpoint that is down is an outage, not a setup problem", () => {
  const TOKEN_URL = "https://auth.example/oauth/token";
  const oauth: ResolvedSapConnection = {
    ...connection,
    id: "c_oauth_down",
    authType: "oauth-client-credentials",
    oauthTokenUrl: TOKEN_URL,
    secrets: { clientId: "client", clientSecret: "still-valid" },
  };
  const saml: ResolvedSapConnection = {
    ...connection,
    id: "c_saml_down",
    product: "successfactors",
    authType: "oauth-saml-bearer",
    oauthTokenUrl: TOKEN_URL,
    secrets: { clientId: "sf-api-key", companyId: "acmeT1", samlAssertion: "PHNhbWw+" },
  };
  const page = (status: number) =>
    new Response("<html><body>Service Unavailable</body></html>", {
      status,
      headers: { "content-type": "text/html" },
    });
  const reset = () =>
    new TypeError("fetch failed", { cause: Object.assign(new Error("read ECONNRESET"), { code: "ECONNRESET" }) });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    clearOAuthTokenCache();
  });

  it.each([
    ["client-credentials", 503, "OAUTH_TOKEN_HTTP_503", oauth],
    ["client-credentials", 429, "OAUTH_TOKEN_HTTP_429", oauth],
    ["SAML bearer", 503, "SAML_BEARER_HTTP_503", saml],
    ["SAML bearer", 429, "SAML_BEARER_HTTP_429", saml],
  ])("a %s token endpoint answering %i is a 502 to retry, not a 403", async (_label, code, reason, conn) => {
    const token = vi.fn(async () => page(code));
    vi.stubGlobal("fetch", token);
    const f = vi.fn();
    const r = await writeEntitySet({ ...input, connection: conn }, f);
    expect(r.status).toBe("ERROR");
    expect(writeHttpStatusFor(r.status)).toBe(502);
    expect(r.attempted).toBe(false);
    // The token endpoint's status, named as the token endpoint's — not HTTP_503,
    // which on a write row reads as SAP's own answer.
    expect(r.failureReason).toBe(reason);
    expect(r.detail).toContain("token endpoint");
    expect(r.detail).toContain("Retry");
    expect(r.detail).not.toContain("Fix the connection");
    expect(token).toHaveBeenCalledTimes(1);
    expect(f).not.toHaveBeenCalled();
  });

  it.each([
    // TOKEN_-prefixed: a bare ECONNRESET is word for word an unreachable
    // TENANT's row, and sent triage there.
    ["client-credentials", "TOKEN_ECONNRESET", oauth],
    // The SAML exchange wraps fetch's TypeError to keep the URL out of the
    // message, so the socket's own code is one level further down.
    ["SAML bearer", "CREDENTIAL_UNAVAILABLE", saml],
  ])("a %s token endpoint that resets the connection is a 502 to retry (%s)", async (_label, reason, conn) => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(reset())));
    const f = vi.fn();
    const r = await writeEntitySet({ ...input, connection: conn }, f);
    expect(r.status).toBe("ERROR");
    expect(r.attempted).toBe(false);
    expect(r.failureReason).toBe(reason);
    expect(r.detail).toContain("could not be reached");
    expect(r.detail).not.toContain("Fix the connection");
    expect(f).not.toHaveBeenCalled();
  });

  it("a SAML token endpoint that hangs past its own timeout is a 504, not a 403", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    vi.stubGlobal("fetch", vi.fn(hang));
    const f = vi.fn();
    const pending = writeEntitySet({ ...input, connection: saml }, f);
    // The exchange's own bound (TOKEN_REQUEST_TIMEOUT_MS), well inside the write's.
    await vi.advanceTimersByTimeAsync(10_000);
    const r = await pending;
    expect(r.status).toBe("TIMEOUT");
    expect(writeHttpStatusFor(r.status)).toBe(504);
    expect(r.attempted).toBe(false);
    expect(r.failureReason).toBe("TOKEN_TIMEOUT");
    expect(r.detail).toContain("token endpoint did not respond within 10000ms");
    expect(f).not.toHaveBeenCalled();
  });

  it.each([
    ["client-credentials", 400, "OAUTH_TOKEN_REJECTED", oauth],
    ["client-credentials", 401, "OAUTH_TOKEN_REJECTED", oauth],
    ["client-credentials", 403, "OAUTH_TOKEN_REJECTED", oauth],
    ["SAML bearer", 400, "SAML_BEARER_REJECTED", saml],
    ["SAML bearer", 401, "SAML_BEARER_REJECTED", saml],
    ["SAML bearer", 403, "SAML_BEARER_REJECTED", saml],
  ])("a %s token endpoint refusing the credential (%i) is still NEEDS_SETUP", async (_label, code, reason, conn) => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: "invalid_client" }, { status: code })));
    const r = await writeEntitySet({ ...input, connection: conn }, vi.fn());
    expect(r.status).toBe("NEEDS_SETUP");
    expect(writeHttpStatusFor(r.status)).toBe(403);
    expect(r.attempted).toBe(false);
    expect(r.failureReason).toBe(reason);
    expect(r.detail).toContain("Fix the connection");
  });

  it("a client-credentials token host that does not resolve is audited as the token endpoint's", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.reject(new TypeError("fetch failed", { cause: { code: "ENOTFOUND" } }))),
    );
    const r = await writeEntitySet({ ...input, connection: oauth }, vi.fn());
    expect(r.status).toBe("ERROR");
    expect(r.failureReason).toBe("TOKEN_ENOTFOUND");
  });

  it("a 408 from the token endpoint is still an outage to retry", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => page(408)));
    const r = await writeEntitySet({ ...input, connection: oauth }, vi.fn());
    expect(r.status).toBe("ERROR");
    expect(r.failureReason).toBe("OAUTH_TOKEN_HTTP_408");
    expect(r.detail).toContain("Retry later");
  });
});

/*
 * A TOKEN URL THAT ANSWERS WITHOUT A TOKEN IS NOT AN OUTAGE. Only 408, 429 and
 * a 5xx are the endpoint being briefly unwell. A wrong path (404, 405) or a URL
 * that lands on a login page (200 HTML) answered the same thing every time,
 * and was a 502 "retry later": the key was released, the client retried as
 * told, forever, and the upstream-errors incident counted a misconfiguration
 * as an outage.
 */
describe("a token URL that answers without a token is a setup problem, not an outage", () => {
  const TOKEN_URL = "https://auth.example/oauth/token";
  const oauth: ResolvedSapConnection = {
    ...connection,
    id: "c_oauth_wrong_url",
    authType: "oauth-client-credentials",
    oauthTokenUrl: TOKEN_URL,
    secrets: { clientId: "client", clientSecret: "still-valid" },
  };
  const saml: ResolvedSapConnection = {
    ...connection,
    id: "c_saml_wrong_url",
    product: "successfactors",
    authType: "oauth-saml-bearer",
    oauthTokenUrl: TOKEN_URL,
    secrets: { clientId: "sf-api-key", companyId: "acmeT1", samlAssertion: "PHNhbWw+" },
  };
  const html = (status: number) =>
    new Response("<html><body>Sign in</body></html>", { status, headers: { "content-type": "text/html" } });
  afterEach(() => {
    vi.unstubAllGlobals();
    clearOAuthTokenCache();
  });

  it.each([
    ["client-credentials", 404, "TOKEN_URL_HTTP_404", oauth],
    ["client-credentials", 405, "TOKEN_URL_HTTP_405", oauth],
    ["SAML bearer", 404, "TOKEN_URL_HTTP_404", saml],
  ])("a %s token URL answering %i is NEEDS_SETUP: check the token URL", async (_label, code, reason, conn) => {
    vi.stubGlobal("fetch", vi.fn(async () => html(code)));
    const f = vi.fn();
    const r = await writeEntitySet({ ...input, connection: conn }, f);
    expect(r.status).toBe("NEEDS_SETUP");
    expect(writeHttpStatusFor(r.status)).toBe(403);
    expect(r.attempted).toBe(false);
    expect(r.failureReason).toBe(reason);
    expect(r.detail).toContain(`answered HTTP ${code} without issuing a token`);
    expect(r.detail).toContain("Check the connection's token URL");
    expect(r.detail).not.toContain("Retry later");
    expect(f).not.toHaveBeenCalled();
  });
});

describe("a token endpoint answering 200 without a token is failing, not misconfigured", () => {
  it.each([
    ["client-credentials", "OAUTH_TOKEN_MISSING"],
    ["SAML bearer", "SAML_BEARER_NO_TOKEN"],
  ] as const)("a %s maintenance page (HTTP 200) is ERROR 502, retryable, key released", async (label, reason) => {
    // SuccessFactors serves maintenance as a 200; the Studio Test calls that the
    // endpoint failing, and the broker draws the same line.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("<html><body>maintenance</body></html>", { status: 200, headers: { "content-type": "text/html" } })),
    );
    const f = vi.fn();
    const conn: ResolvedSapConnection = {
      ...connection,
      id: `c_${label}_maint`,
      ...(label === "SAML bearer"
        ? {
            product: "successfactors",
            authType: "oauth-saml-bearer" as const,
            oauthTokenUrl: "https://idp.example.test/oauth/token",
            secrets: { clientId: "sf-api-key", companyId: "acmeT1", samlAssertion: "PHNhbWw+" },
          }
        : {
            authType: "oauth-client-credentials" as const,
            oauthTokenUrl: "https://idp.example.test/oauth/token",
            secrets: { clientId: "client", clientSecret: "still-valid" },
          }),
    };
    const r = await writeEntitySet({ ...input, connection: conn }, f);
    expect(r.status).toBe("ERROR");
    expect(writeHttpStatusFor(r.status)).toBe(502);
    expect(r.attempted).toBe(false);
    expect(r.failureReason).toBe(reason);
    expect(r.detail).not.toContain("Check the connection's token URL");
    expect(f).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
    clearOAuthTokenCache();
  });
});

describe("a timeout says which side of the POST it fell on (A04)", () => {
  it("a CSRF handshake that hangs never sends the write, and says so", async () => {
    const f = vi.fn(hang);
    const r = await writeEntitySet(fast, f as unknown as typeof fetch);
    expect(r.status).toBe("TIMEOUT");
    expect(r.attempted).toBe(false);
    expect(f).toHaveBeenCalledTimes(1);
    expect((f.mock.calls[0]?.[1] as RequestInit).method).toBe("GET");
    expect(r.detail).toContain("never sent");
    expect(r.detail).not.toContain("may or may not");
  });

  it("a POST that hangs is ambiguous, and does not promise a retry will find out", async () => {
    const f = vi.fn().mockResolvedValueOnce(handshake()).mockImplementationOnce(hang);
    const r = await writeEntitySet(fast, f);
    expect(r.status).toBe("TIMEOUT");
    expect(writeHttpStatusFor(r.status)).toBe(504);
    expect(r.attempted).toBe(true);
    expect(r.detail).toContain("may or may not have been applied");
    // The stored outcome is what every same-key retry gets back.
    expect(r.detail).toContain("returns this same answer until the key expires");
    expect(r.detail).not.toContain("to find out");
  });

  function slowBody(status: number) {
    return (_url: string | URL | Request, init?: RequestInit) => {
      const body = new ReadableStream({
        start(controller) {
          init?.signal?.addEventListener("abort", () => controller.error(new DOMException("aborted", "AbortError")));
        },
      });
      return Promise.resolve(
        new Response(body, { status, headers: { location: `${connection.baseUrl}${input.servicePath}/A_Thing('1')` } }),
      );
    };
  }

  it("a 201 whose body is cut off by the timeout is a created record, not a timeout", async () => {
    const f = vi.fn().mockResolvedValueOnce(handshake()).mockImplementationOnce(slowBody(201));
    const r = await writeEntitySet(fast, f);
    expect(r.status).toBe("CREATED");
    expect(r.record).toBeNull();
    expect(r.location).toBe("/A_Thing('1')");
    expect(r.attempted).toBe(true);
  });

  it("a 200 whose body is cut off stays ambiguous — only its body could prove a create", async () => {
    const f = vi.fn().mockResolvedValueOnce(handshake()).mockImplementationOnce(slowBody(200));
    const r = await writeEntitySet(fast, f);
    expect(r.status).toBe("TIMEOUT");
    expect(r.attempted).toBe(true);
  });
});

describe("throttling is not a payload error (A07)", () => {
  it.each([408, 429])("a POST answered %i is an upstream error, and was not attempted", async (code) => {
    const f = vi.fn().mockResolvedValueOnce(handshake()).mockResolvedValueOnce(new Response("", { status: code }));
    const r = await writeEntitySet(input, f);
    expect(r.status).toBe("ERROR");
    expect(writeHttpStatusFor(r.status)).toBe(502);
    expect(r.attempted).toBe(false);
    expect(r.failureReason).toBe(`HTTP_${code}`);
    expect(r.detail).not.toContain("field values");
    expect(r.detail).toContain("not created");
  });

  it.each([408, 429])("a handshake answered %i never sends the write", async (code) => {
    const f = vi.fn().mockResolvedValue(new Response("", { status: code }));
    const r = await writeEntitySet(input, f);
    expect(r.status).toBe("ERROR");
    expect(r.attempted).toBe(false);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("a genuine validation failure stays REJECTED, and is stored", async () => {
    const f = vi.fn().mockResolvedValueOnce(handshake()).mockResolvedValueOnce(new Response("", { status: 400 }));
    const r = await writeEntitySet(input, f);
    expect(r.status).toBe("REJECTED");
    expect(writeHttpStatusFor(r.status)).toBe(422);
    expect(r.attempted).toBe(true);
  });

  it("a refused handshake is not attempted either", async () => {
    const f = vi.fn().mockResolvedValue(new Response("", { status: 403 }));
    expect((await writeEntitySet(input, f)).attempted).toBe(false);
  });

  it("a created record is attempted", async () => {
    const f = vi.fn().mockResolvedValueOnce(handshake()).mockResolvedValueOnce(
      Response.json({ d: { ID: "1" } }, { status: 201 }),
    );
    expect((await writeEntitySet(input, f)).attempted).toBe(true);
  });
});
