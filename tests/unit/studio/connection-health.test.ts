/**
 * Connection health — the honest-status rules, exercised against a fake fetch.
 *
 * The rule that carries the weight: `lastValidatedAt` moves ONLY on a real 200.
 * Everything else here exists so that "not set up" (401/403) never gets rounded
 * into "unreachable" (5xx/timeout), because those are different problems with
 * different fixes and a consultant chasing the wrong one wastes a day.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { probeConnection, resolveProbePath } from "@/lib/studio/connection-health";
import type { ResolvedSapConnection } from "@/lib/sap-public/connection-resolver";

function conn(overrides: Partial<ResolvedSapConnection> = {}): ResolvedSapConnection {
  return {
    source: "db",
    id: "c1",
    organizationId: "org_a",
    product: "s4hana",
    key: "prod",
    label: "Acme S/4 (PROD)",
    baseUrl: "https://my123456-api.s4hana.cloud.sap",
    authType: "basic",
    secrets: { username: "comm_user", password: "s3cret" },
    oauthTokenUrl: null,
    writeEnabled: false,
    apiPath: "/sap/opu/odata/sap/API_TEST_SRV",
    timeoutMs: null,
    environment: null,
    client: null,
    ...overrides,
  };
}

const EDMX =
  '<?xml version="1.0" encoding="utf-8"?><edmx:Edmx Version="1.0" xmlns:edmx="http://schemas.microsoft.com/ado/2007/06/edmx">' +
  '<edmx:DataServices><Schema Namespace="API_TEST_SRV"/></edmx:DataServices></edmx:Edmx>';

/*
 * A 200 IS A METADATA DOCUMENT HERE. This double used to answer `{ status: 200 }`
 * with no body at all, and "200 → OK" passed on it — which pinned the bug in
 * audit A21: any 200, an IdP login page included, counted as "Reachable and
 * authenticated". The probe now reads what it was sent, so the double sends
 * what a tenant sends.
 */
const okFetch = (status: number) =>
  vi.fn().mockImplementation(async () =>
    status === 200
      ? new Response(EDMX, { status, headers: { "content-type": "application/xml" } })
      : { status, ok: false },
  ) as unknown as typeof fetch;

describe("outcome classification", () => {
  it("200 → OK (the only outcome that counts as validated)", async () => {
    const r = await probeConnection(conn(), okFetch(200));
    expect(r.status).toBe("OK");
    expect(r.httpStatus).toBe(200);
  });

  it("401 and 403 → UNAUTHORIZED, not a generic error", async () => {
    for (const code of [401, 403]) {
      const r = await probeConnection(conn(), okFetch(code));
      expect(r.status, `HTTP ${code}`).toBe("UNAUTHORIZED");
    }
  });

  it("404 → NOT_FOUND, kept apart from a credentials problem", async () => {
    const r = await probeConnection(conn(), okFetch(404));
    expect(r.status).toBe("NOT_FOUND");
  });

  it("5xx → ERROR", async () => {
    const r = await probeConnection(conn(), okFetch(503));
    expect(r.status).toBe("ERROR");
    expect(r.httpStatus).toBe(503);
  });

  it("an aborted request → TIMEOUT, never silently OK", async () => {
    const abort = vi.fn().mockRejectedValue(
      Object.assign(new Error("aborted"), { name: "AbortError" }),
    ) as unknown as typeof fetch;
    const r = await probeConnection(conn(), abort);
    expect(r.status).toBe("TIMEOUT");
    expect(r.httpStatus).toBeNull();
  });

  it("a transport failure → ERROR with no detail leaked from the exception", async () => {
    const boom = vi.fn().mockRejectedValue(
      new Error("getaddrinfo ENOTFOUND my123456-api.s4hana.cloud.sap"),
    ) as unknown as typeof fetch;
    const r = await probeConnection(conn(), boom);
    expect(r.status).toBe("ERROR");
    // The host must not ride out on the message shown to the client.
    expect(r.detail).not.toContain("s4hana.cloud.sap");
    expect(r.detail).not.toContain("ENOTFOUND");
  });
});

/*
 * AUDIT A21 — a 200 counted as "Reachable and authenticated" without a look at
 * what it was, and fetch followed redirects. The S/4HANA UI host (allowlisted,
 * not the -api host) answers the communication user with an IdP login page or
 * a SAML auto-post form, so the probe recorded OK and moved lastValidatedAt
 * while every real read failed as invalid OData.
 */
describe("a 200 is OK only when it is a metadata document (A21)", () => {
  const answer = (body: string, init: ResponseInit) =>
    vi.fn().mockImplementation(async () => new Response(body, init)) as unknown as typeof fetch;

  it("an HTML login page answered 200 is not OK", async () => {
    const page = '<!DOCTYPE html><html><head><title>Sign In</title></head><body><form action="/saml2/idp/sso">';
    const r = await probeConnection(conn(), answer(page, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } }));
    expect(r.status).not.toBe("OK");
    expect(r.status).toBe("ERROR");
    expect(r.detail).toMatch(/not with an OData metadata document/);
  });

  it("a SAML auto-post form is not OK, whatever content type it claims", async () => {
    const form = '<html><body onload="document.forms[0].submit()"><form method="post"><input name="SAMLRequest" value="PHNhbWw+"/></form></body></html>';
    const r = await probeConnection(conn(), answer(form, { status: 200, headers: { "content-type": "application/xml" } }));
    expect(r.status).not.toBe("OK");
  });

  it("an empty 200 is not OK", async () => {
    const r = await probeConnection(conn(), answer("", { status: 200 }));
    expect(r.status).not.toBe("OK");
  });

  it("a redirect is not followed, and is a sign-in that did not happen", async () => {
    const f = answer("", { status: 302, headers: { location: "https://my123456.s4hana.cloud.sap/ui#Shell-home" } });
    const r = await probeConnection(conn(), f);
    expect(r.status).toBe("UNAUTHORIZED");
    expect(r.detail).toMatch(/redirected to a login page/);
    expect(r.detail).not.toContain("s4hana.cloud.sap");
    expect(((f as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![1] as RequestInit).redirect).toBe("manual");
  });

  /*
   * THE SAME HOST MOVING THE PATH IS NOT A LOGIN PAGE. Every 3xx was a login
   * redirect, so a web dispatcher answering $metadata with a 307 to the real
   * path on its own origin probed UNAUTHORIZED — lane "SAP rejected CoreEdge's
   * sign-in", a drift email — while readEntitySet, which follows redirects,
   * read the same connection OK.
   */
  describe("a same-origin redirect is followed, and what it lands on decides", () => {
    const sequence = (...responses: Response[]) => {
      const f = vi.fn();
      for (const r of responses) f.mockResolvedValueOnce(r);
      return f;
    };
    const xml = { status: 200, headers: { "content-type": "application/xml" } };
    const to = (location: string, status = 307) => new Response("", { status, headers: { location } });

    it("a 307 to the real path on the same origin reaching EDMX is OK", async () => {
      const f = sequence(to("https://my123456-api.s4hana.cloud.sap/gw/sap/opu/odata/sap/API_TEST_SRV/$metadata"), new Response(EDMX, xml));
      const r = await probeConnection(conn(), f as unknown as typeof fetch);
      expect(r.status).toBe("OK");
      expect(r.httpStatus).toBe(200);
      expect(f).toHaveBeenCalledTimes(2);
      expect(f.mock.calls[1]![0]).toBe("https://my123456-api.s4hana.cloud.sap/gw/sap/opu/odata/sap/API_TEST_SRV/$metadata");
      // The same request, credentials included, and still not auto-followed.
      expect(f.mock.calls[1]![1]).toBe(f.mock.calls[0]![1]);
      expect((f.mock.calls[1]![1] as RequestInit).redirect).toBe("manual");
    });

    it("a relative Location resolves against the request and is followed", async () => {
      const f = sequence(to("/gw/sap/opu/odata/sap/API_TEST_SRV/$metadata", 302), new Response(EDMX, xml));
      expect((await probeConnection(conn(), f as unknown as typeof fetch)).status).toBe("OK");
      expect(f.mock.calls[1]![0]).toBe("https://my123456-api.s4hana.cloud.sap/gw/sap/opu/odata/sap/API_TEST_SRV/$metadata");
    });

    it("a same-origin redirect landing on a login page is still a sign-in that did not happen", async () => {
      const page = new Response("<!DOCTYPE html><html><title>Logon</title></html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      });
      const f = sequence(to("/sap/public/bc/icf/logon.html", 302), page);
      const r = await probeConnection(conn(), f as unknown as typeof fetch);
      expect(r.status).toBe("UNAUTHORIZED");
      expect(r.detail).toMatch(/redirected to a login page/);
    });

    it("a same-origin redirect landing on a refusal is that refusal", async () => {
      const f = sequence(to("/gw/x"), new Response("", { status: 403 }));
      const r = await probeConnection(conn(), f as unknown as typeof fetch);
      expect(r.status).toBe("UNAUTHORIZED");
      expect(r.httpStatus).toBe(403);
      expect(r.detail).not.toMatch(/redirected/);
    });

    it("a same-origin loop is followed a bounded number of times, then is a login redirect", async () => {
      const f = vi.fn().mockImplementation(async () => to("/again"));
      const r = await probeConnection(conn(), f as unknown as typeof fetch);
      expect(r.status).toBe("UNAUTHORIZED");
      expect(f).toHaveBeenCalledTimes(4);
    });

    it("another origin, or a redirect with no Location, is not followed", async () => {
      for (const res of [to("https://idp.example.com/saml2/sso"), to("//my123456.s4hana.cloud.sap/ui"), new Response("", { status: 302 })]) {
        const f = sequence(res);
        const r = await probeConnection(conn(), f as unknown as typeof fetch);
        expect(r.status).toBe("UNAUTHORIZED");
        expect(f).toHaveBeenCalledTimes(1);
      }
    });

    it("against a real HTTP server, the probe agrees with the read path", async () => {
      const { createServer } = await import("node:http");
      const server = createServer((req, res) => {
        if (req.url?.startsWith("/sap/")) {
          res.writeHead(307, { location: `/gw${req.url}` });
          res.end();
          return;
        }
        if (req.url?.startsWith("/gw/sap/") && req.headers.authorization) {
          res.writeHead(200, { "content-type": "application/xml" });
          res.end(EDMX);
          return;
        }
        res.writeHead(401);
        res.end();
      });
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
      try {
        const { port } = server.address() as { port: number };
        const r = await probeConnection(conn({ baseUrl: `http://127.0.0.1:${port}` }));
        expect(r).toMatchObject({ status: "OK", httpStatus: 200 });
      } finally {
        await new Promise((resolve) => server.close(resolve));
      }
    });
  });

  it("a browser's opaque redirect is the same", async () => {
    const f = vi.fn().mockResolvedValue({ status: 0, type: "opaqueredirect", ok: false }) as unknown as typeof fetch;
    expect((await probeConnection(conn(), f)).status).toBe("UNAUTHORIZED");
  });

  it("a V4 metadata document under any prefix is OK", async () => {
    const v4 = '<?xml version="1.0"?><edm:Edmx Version="4.0" xmlns:edm="http://docs.oasis-open.org/odata/ns/edmx"/>';
    const r = await probeConnection(conn(), answer(v4, { status: 200, headers: { "content-type": "application/xml;charset=utf-8" } }));
    expect(r.status).toBe("OK");
  });

  it("reads only the start of a large metadata document", async () => {
    let pulled = 0;
    let cancelled = false;
    const chunk = new TextEncoder().encode(`<!-- ${"x".repeat(4096)} -->`);
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(EDMX.slice(0, 120)));
      },
      pull(controller) {
        pulled++;
        controller.enqueue(chunk);
      },
      cancel() {
        cancelled = true;
      },
    });
    const f = vi.fn().mockResolvedValue(new Response(body, { status: 200, headers: { "content-type": "application/xml" } }));
    const r = await probeConnection(conn(), f as unknown as typeof fetch);
    expect(r.status).toBe("OK");
    expect(cancelled).toBe(true);
    expect(pulled).toBeLessThan(10);
  });
});

/*
 * AUDIT A20 / A54 / A55 — credential failures raised BEFORE the SAP call.
 *
 * The probe's own comment said a credential problem "should surface as
 * UNAUTHORIZED rather than a crash", and the catch returned ERROR — "SAP
 * unavailable", the client Basis team's lane — for every one of them: a token
 * endpoint refusing a mistyped client secret, a missing secret field, a
 * reserved API-key header. Driven through the real resolver with only the
 * token endpoint (global fetch) and the tenant (fetchImpl) stubbed.
 */
describe("a credential that cannot be used is UNAUTHORIZED, and SAP is never called (A20)", () => {
  const oauth = (overrides: Partial<ResolvedSapConnection> = {}) =>
    conn({
      authType: "oauth-client-credentials",
      oauthTokenUrl: "https://acme.authentication.eu10.hana.ondemand.com/oauth/token",
      secrets: { clientId: "sb-client", clientSecret: "mistyped" },
      ...overrides,
    });

  beforeEach(async () => {
    const { clearOAuthTokenCache } = await import("@/lib/sap-public/connection-resolver");
    clearOAuthTokenCache();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("the token endpoint refusing the client secret (401) → UNAUTHORIZED with the token's status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response('{"error":"invalid_client"}', { status: 401 })));
    const sap = vi.fn();
    const r = await probeConnection(oauth(), sap as unknown as typeof fetch);
    expect(r).toMatchObject({ status: "UNAUTHORIZED", httpStatus: 401 });
    expect(r.detail).toMatch(/token endpoint rejected the connection's client credentials/);
    expect(r.detail).not.toContain("hana.ondemand.com");
    expect(r.detail).not.toContain("mistyped");
    expect(sap).not.toHaveBeenCalled();
  });

  it("a refusal answered as an HTML page is still a refusal, not a parse error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>Unauthorized</html>", { status: 401 })));
    expect((await probeConnection(oauth(), vi.fn() as unknown as typeof fetch)).status).toBe("UNAUTHORIZED");
  });

  it("the token endpoint FAILING (503) stays ERROR: nothing was refused", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 503 })));
    const r = await probeConnection(oauth(), vi.fn() as unknown as typeof fetch);
    expect(r).toMatchObject({ status: "ERROR", httpStatus: 503 });
    expect(r.detail).toMatch(/not a credentials problem/);
  });

  it("a stored basic row with no password → UNAUTHORIZED, naming the field", async () => {
    const sap = vi.fn();
    const r = await probeConnection(conn({ secrets: { username: "comm_user" } }), sap as unknown as typeof fetch);
    expect(r).toMatchObject({ status: "UNAUTHORIZED", httpStatus: null });
    expect(r.detail).toMatch(/missing its username or password/);
    expect(r.detail).not.toContain("comm_user");
    expect(sap).not.toHaveBeenCalled();
  });

  it("a reserved API-key header → UNAUTHORIZED, without echoing the key", async () => {
    const r = await probeConnection(
      conn({ authType: "api-key", secrets: { apiKey: "k-123", apiKeyHeader: "Authorization" } }),
      vi.fn() as unknown as typeof fetch,
    );
    expect(r.status).toBe("UNAUTHORIZED");
    expect(r.detail).toMatch(/reserved header/);
    expect(r.detail).not.toContain("k-123");
  });

  it("SuccessFactors Basic after SAP deleted it → UNAUTHORIZED, with the instructions", async () => {
    vi.stubEnv("SF_BASIC_AUTH_DELETION_DATE", "2020-01-01");
    try {
      const sap = vi.fn();
      const r = await probeConnection(
        conn({ product: "successfactors", apiPath: "/odata/v2", baseUrl: "https://api4.successfactors.com" }),
        sap as unknown as typeof fetch,
      );
      expect(r.status).toBe("UNAUTHORIZED");
      expect(r.detail).toMatch(/oauth-saml-bearer/);
      expect(sap).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe("SuccessFactors' token endpoint failing is not blamed on the key (A54)", () => {
  const sf = (): ResolvedSapConnection =>
    conn({
      product: "successfactors",
      apiPath: "/odata/v2",
      baseUrl: "https://api4.successfactors.com",
      authType: "oauth-saml-bearer",
      oauthTokenUrl: "https://api4.successfactors.com/oauth/token",
      secrets: { clientId: "API_KEY_ABC", companyId: "acmeT1", samlAssertion: "PHNhbWw+" },
    });

  beforeEach(async () => {
    const { clearOAuthTokenCache } = await import("@/lib/sap-public/connection-resolver");
    clearOAuthTokenCache();
  });
  afterEach(() => vi.unstubAllGlobals());

  it.each([
    [503, "", /unavailable \(HTTP 503\).*not a configuration problem/],
    [429, "", /rate-limiting the token endpoint \(HTTP 429\)/],
    [200, "<html><body>maintenance</body></html>", /returned no access token \(HTTP 200\)/],
  ])("HTTP %i → ERROR, and the sentence names no key, user, company or assertion", async (status, body, says) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body, { status })));
    const r = await probeConnection(sf(), vi.fn() as unknown as typeof fetch);
    expect(r.status).toBe("ERROR");
    expect(r.httpStatus).toBe(status);
    expect(r.detail).toMatch(says);
    expect(r.detail).not.toMatch(/refused/i);
    expect(r.detail).not.toMatch(/private key|user id|company id|assertion/i);
  });

  /*
   * SUCCESSFACTORS' WORDS ARE A SENTENCE OF THEIR OWN. Quoted without a stop,
   * "(HTTP 429): slow down Retry later." ran them into ours — on the Test
   * result, Probe now and the drift-alert email.
   */
  it.each([
    [429, "slow down", "SuccessFactors is rate-limiting the token endpoint (HTTP 429): slow down. Retry later."],
    [429, "slow down. ", "SuccessFactors is rate-limiting the token endpoint (HTTP 429): slow down. Retry later."],
    [
      503,
      "Service in maintenance",
      "The SuccessFactors token endpoint is unavailable (HTTP 503): Service in maintenance. This is not a configuration problem.",
    ],
    [503, "Try again later!", "The SuccessFactors token endpoint is unavailable (HTTP 503): Try again later! This is not a configuration problem."],
  ])("HTTP %i saying %j ends SuccessFactors' words with one full stop", async (status, errorMessage, detail) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ errorMessage }), { status })));
    const r = await probeConnection(sf(), vi.fn() as unknown as typeof fetch);
    expect(r.detail).toBe(detail);
  });

  it("a refusal quoting SuccessFactors ends its words before the hint", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ errorMessage: "Invalid SAML assertion" }), { status: 401 })),
    );
    const r = await probeConnection(sf(), vi.fn() as unknown as typeof fetch);
    expect(r.detail).toBe(
      "SuccessFactors refused the token request (HTTP 401): Invalid SAML assertion. An expired or unregistered assertion is the usual cause.",
    );
  });

  it("a refusal (401) still gets the configuration hint", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 401 })));
    const r = await probeConnection(sf(), vi.fn() as unknown as typeof fetch);
    expect(r.status).toBe("UNAUTHORIZED");
    expect(r.detail).toMatch(/refused the token request \(HTTP 401\).*expired or unregistered assertion/);
  });
});

describe("a hung token endpoint is TIMEOUT, on every auth type (A55)", () => {
  /** A token endpoint that accepts the request and never answers until aborted. */
  const hang = vi.fn((_url: string, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () =>
        reject(Object.assign(new Error("This operation was aborted"), { name: "AbortError" })),
      );
    }),
  );

  beforeEach(async () => {
    const { clearOAuthTokenCache } = await import("@/lib/sap-public/connection-resolver");
    clearOAuthTokenCache();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    vi.stubGlobal("fetch", hang);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it.each([
    ["oauth-saml-bearer", { clientId: "API_KEY_ABC", companyId: "acmeT1", samlAssertion: "PHNhbWw+" }],
    ["oauth-client-credentials", { clientId: "sb-client", clientSecret: "s" }],
  ] as const)("%s → TIMEOUT naming the token endpoint and its own limit", async (authType, secrets) => {
    const sap = vi.fn();
    const pending = probeConnection(
      conn({ authType, secrets, oauthTokenUrl: "https://tokens.example.com/oauth/token", timeoutMs: 25_000 }),
      sap as unknown as typeof fetch,
    );
    await vi.advanceTimersByTimeAsync(10_000);
    const r = await pending;
    expect(r.status).toBe("TIMEOUT");
    expect(r.detail).toBe("The connection's token endpoint did not respond within 10000ms.");
    expect(sap).not.toHaveBeenCalled();
  });
});

describe("what the probe sends", () => {
  it("issues a single read-only GET against $metadata with an auth header", async () => {
    const f = vi.fn().mockResolvedValue({ status: 200 });
    await probeConnection(conn(), f as unknown as typeof fetch);
    expect(f).toHaveBeenCalledTimes(1);
    const [url, init] = f.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://my123456-api.s4hana.cloud.sap/sap/opu/odata/sap/API_TEST_SRV/$metadata");
    expect(init.method).toBe("GET");
    expect((init.headers as Record<string, string>).Authorization).toMatch(/^Basic /);
  });

  it("never returns the secret it used", async () => {
    const r = await probeConnection(conn(), okFetch(200));
    expect(JSON.stringify(r)).not.toContain("s3cret");
    expect(JSON.stringify(r)).not.toContain("comm_user");
  });
});

describe("probe path resolution", () => {
  it("prefers the connection's explicit apiPath", () => {
    expect(resolveProbePath({ apiPath: "/custom/path", product: "s4hana" })).toBe("/custom/path");
  });

  it("falls back to the product's first curated service", () => {
    const p = resolveProbePath({ apiPath: null, product: "s4hana" });
    expect(p).toBeTruthy();
    expect(p).toMatch(/^\//);
  });

  it("returns null for an unknown product rather than guessing a path", async () => {
    expect(resolveProbePath({ apiPath: null, product: "not_a_product" })).toBeNull();
    const r = await probeConnection(
      conn({ apiPath: null, product: "not_a_product" }),
      okFetch(200),
    );
    // Guessing would surface as NOT_FOUND — "the tenant doesn't have this" —
    // when the truth is that we did not know where to look.
    expect(r.status).toBe("NO_PROBE_PATH");
  });

  it("does not call SAP at all when there is no path to probe", async () => {
    const f = vi.fn();
    await probeConnection(conn({ apiPath: null, product: "not_a_product" }), f as unknown as typeof fetch);
    expect(f).not.toHaveBeenCalled();
  });
});

describe("the connectivity probe is throttled like every other live-SAP route", () => {
  it("is matched by isLiveSapTenantRoute", async () => {
    const { isLiveSapTenantRoute } = await import("@/lib/security/rate-limit");
    expect(isLiveSapTenantRoute("/api/studio/connections/c_123/test")).toBe(true);
  });

  it("does not over-match neighbouring studio paths", () => {
    return import("@/lib/security/rate-limit").then(({ isLiveSapTenantRoute }) => {
      expect(isLiveSapTenantRoute("/api/studio/connections")).toBe(false);
      expect(isLiveSapTenantRoute("/api/studio/connections/c_123")).toBe(false);
      expect(isLiveSapTenantRoute("/api/studio/connections/c_123/test/extra")).toBe(false);
      expect(isLiveSapTenantRoute("/api/studio/interfaces")).toBe(false);
    });
  });
});
