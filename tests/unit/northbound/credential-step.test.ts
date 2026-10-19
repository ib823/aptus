// @vitest-environment node
/**
 * The broker's CREDENTIAL STEP, kept apart from the tenant's answer (audit A08,
 * A20, A55).
 *
 * readEntitySet and writeEntitySet built the auth header inside the same try as
 * the SAP request, so every credential failure landed in the catch that means
 * "the upstream never answered": 502 UPSTREAM_ERROR, failureReason
 * FETCH_FAILED. A token endpoint refusing a rotated client secret, an expired
 * SuccessFactors assertion and a row missing its password were all reported
 * as a network failure — and the developer guide tells an app to RETRY a 502,
 * so each retry hit the customer's token endpoint with the bad credential
 * again. The tenant was never called; the same wrong secret on Basic, which
 * SAP answers 401, was already NEEDS_SETUP.
 *
 * Driven through the real resolver: global fetch is the token endpoint, the
 * executor's fetchImpl is the tenant, and the tenant must never be reached.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { httpStatusFor, readEntitySet } from "@/lib/northbound/read";
import { writeEntitySet, writeHttpStatusFor } from "@/lib/northbound/write";
import { clearOAuthTokenCache, type ResolvedSapConnection } from "@/lib/sap-public/connection-resolver";

function conn(overrides: Partial<ResolvedSapConnection> = {}): ResolvedSapConnection {
  return {
    source: "db",
    id: "c1",
    organizationId: "org_a",
    product: "s4hana",
    key: "prod",
    label: "Acme S/4",
    baseUrl: "https://my1234-api.s4hana.cloud.sap",
    authType: "oauth-client-credentials",
    secrets: { clientId: "sb-client", clientSecret: "rotated-away" },
    oauthTokenUrl: "https://acme.authentication.eu10.hana.ondemand.com/oauth/token",
    writeEnabled: true,
    apiPath: null,
    timeoutMs: null,
    environment: "PROD",
    client: null,
    ...overrides,
  };
}

const sfPreSigned = () =>
  conn({
    product: "successfactors",
    baseUrl: "https://api4.successfactors.com",
    authType: "oauth-saml-bearer",
    oauthTokenUrl: "https://api4.successfactors.com/oauth/token",
    secrets: { clientId: "API_KEY_ABC", companyId: "acmeT1", samlAssertion: "PHNhbWw+" },
  });

const READ = { servicePath: "/sap/opu/odata/sap/API_TEST", entitySet: "A_Thing", limit: 1 };
const WRITE = { servicePath: "/sap/opu/odata/sap/API_TEST", entitySet: "A_Thing", payload: { Name: "x" } };

let tenant: ReturnType<typeof vi.fn>;
const token = (res: Response | Promise<Response>) => vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => res));

beforeEach(() => {
  clearOAuthTokenCache();
  tenant = vi.fn();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("a credential that cannot be used is NEEDS_SETUP (403), not a 502 to retry", () => {
  it("the token endpoint refusing the client secret (401)", async () => {
    token(new Response('{"error":"invalid_client"}', { status: 401 }));
    const r = await readEntitySet({ connection: conn(), ...READ }, tenant as unknown as typeof fetch);
    expect(r.status).toBe("NEEDS_SETUP");
    expect(httpStatusFor(r.status)).toBe(403);
    expect(r.failureReason).toBe("OAUTH_TOKEN_REJECTED");
    expect(r.httpStatus).toBeNull();
    expect(r.detail).toMatch(/credentials could not be used.*tenant was not called/);
    expect(r.detail).not.toContain("hana.ondemand.com");
    expect(tenant).not.toHaveBeenCalled();
  });

  it("SuccessFactors refusing an expired pre-signed assertion (400)", async () => {
    token(new Response('{"errorMessage":"The assertion has expired"}', { status: 400 }));
    const r = await readEntitySet({ connection: sfPreSigned(), ...READ }, tenant as unknown as typeof fetch);
    expect(r.status).toBe("NEEDS_SETUP");
    expect(r.failureReason).toBe("SAML_BEARER_REJECTED");
    // SuccessFactors' own words are for the Test result, not the calling app.
    expect(r.detail).not.toContain("expired");
    expect(tenant).not.toHaveBeenCalled();
  });

  it("a stored basic row missing its password", async () => {
    const r = await readEntitySet(
      { connection: conn({ authType: "basic", secrets: { username: "u" } }), ...READ },
      tenant as unknown as typeof fetch,
    );
    expect(r).toMatchObject({ status: "NEEDS_SETUP", failureReason: "CONNECTION_MISCONFIGURED" });
    expect(tenant).not.toHaveBeenCalled();
  });

  it("a SAML connection missing its company id", async () => {
    const c = sfPreSigned();
    const r = await readEntitySet(
      { connection: { ...c, secrets: { ...c.secrets, companyId: "" } }, ...READ },
      tenant as unknown as typeof fetch,
    );
    expect(r).toMatchObject({ status: "NEEDS_SETUP", failureReason: "SAML_BEARER_MISCONFIGURED" });
  });
});

describe("the token endpoint FAILING stays an upstream error — nothing was refused", () => {
  it("a 503 from the client-credentials endpoint → ERROR (502) with its status as the reason", async () => {
    token(new Response("", { status: 503 }));
    const r = await readEntitySet({ connection: conn(), ...READ }, tenant as unknown as typeof fetch);
    expect(r.status).toBe("ERROR");
    expect(httpStatusFor(r.status)).toBe(502);
    expect(r.failureReason).toBe("OAUTH_TOKEN_HTTP_503");
    expect(r.detail).toMatch(/token endpoint could not issue a token/);
    expect(tenant).not.toHaveBeenCalled();
  });

  it("a SuccessFactors maintenance 503 → ERROR, never a credential rejection", async () => {
    token(new Response("", { status: 503 }));
    const r = await readEntitySet({ connection: sfPreSigned(), ...READ }, tenant as unknown as typeof fetch);
    expect(r).toMatchObject({ status: "ERROR", failureReason: "SAML_BEARER_HTTP_503" });
  });

  it("an unreachable token endpoint says it was the token step, not the tenant", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    const r = await readEntitySet({ connection: conn(), ...READ }, tenant as unknown as typeof fetch);
    expect(r).toMatchObject({ status: "ERROR", failureReason: "CREDENTIAL_UNAVAILABLE" });
  });
});

describe("a hung token endpoint is TIMEOUT (504), naming the token endpoint's own limit (A55)", () => {
  const hang = () =>
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(Object.assign(new Error("This operation was aborted"), { name: "AbortError" })),
          );
        }),
      ),
    );

  it.each([
    ["oauth-saml-bearer", sfPreSigned],
    ["oauth-client-credentials", () => conn()],
  ] as const)("%s", async (_name, make) => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    hang();
    const pending = readEntitySet({ connection: { ...make(), timeoutMs: 25_000 }, ...READ }, tenant as unknown as typeof fetch);
    await vi.advanceTimersByTimeAsync(10_000);
    const r = await pending;
    expect(r.status).toBe("TIMEOUT");
    expect(httpStatusFor(r.status)).toBe(504);
    expect(r.failureReason).toBe("TIMEOUT");
    // Not "The tenant did not respond within 25000ms": wrong host, wrong limit.
    expect(r.detail).toBe("The connection's token endpoint did not respond within 10000ms, so the tenant was not called.");
    expect(tenant).not.toHaveBeenCalled();
  });
});

describe("the write path draws the same line", () => {
  it("a refused client secret → NEEDS_SETUP (403), and says the write was not applied", async () => {
    token(new Response("", { status: 401 }));
    const r = await writeEntitySet({ connection: conn(), ...WRITE }, tenant as unknown as typeof fetch);
    expect(r.status).toBe("NEEDS_SETUP");
    expect(writeHttpStatusFor(r.status)).toBe(403);
    expect(r.failureReason).toBe("OAUTH_TOKEN_REJECTED");
    expect(r.detail).toContain("The write was not applied.");
    expect(tenant).not.toHaveBeenCalled();
  });

  it("a token timeout is not the ambiguous write timeout: nothing was sent", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
          );
        }),
      ),
    );
    const pending = writeEntitySet({ connection: { ...sfPreSigned(), timeoutMs: 40_000 }, ...WRITE }, tenant as unknown as typeof fetch);
    await vi.advanceTimersByTimeAsync(10_000);
    const r = await pending;
    expect(r.status).toBe("TIMEOUT");
    expect(r.failureReason).toBe("TIMEOUT");
    expect(r.detail).not.toMatch(/may or may not/);
    expect(r.detail).toMatch(/token endpoint did not respond within 10000ms.*The write was not applied/);
    expect(tenant).not.toHaveBeenCalled();
  });
});
