/**
 * Saving a SuccessFactors connection (P0.9): the host is admitted, and a NEW
 * Basic-auth connection is saved WITH a dated notice — never refused.
 *
 * Two defects, one screen. `api17.sapsf.com`, a real SuccessFactors API server,
 * was refused by the host allow-list, so no SuccessFactors tenant on a `sapsf.*`
 * host could be connected at all. And a consultant creating a Basic connection a
 * month before SAP retires Basic for SuccessFactors (2026-11-20) was told
 * nothing.
 *
 * What must NOT change: existing connections. Re-saving one is how its
 * credentials are rotated, and it gets neither a refusal nor a notice.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type * as ConnectionResolverModule from "@/lib/sap-public/connection-resolver";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  findFirstConnection: vi.fn(),
  upsert: vi.fn(),
  writeConfigAudit: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: { sapConnection: { findFirst: mocks.findFirstConnection } },
}));
vi.mock("@/lib/sap-public/connection-resolver", async (importOriginal) => {
  const actual = await importOriginal<typeof ConnectionResolverModule>();
  return { ...actual, upsertSapConnection: mocks.upsert };
});
vi.mock("@/lib/studio/audit", () => ({ writeConfigAudit: mocks.writeConfigAudit }));

import { POST } from "@/app/api/studio/connections/route";

const CONSULTANT = { id: "u_1", role: "consultant", organizationId: "org_a", email: "c@abeam.com" };

function body(over: Record<string, unknown> = {}) {
  return {
    product: "successfactors",
    key: "sf-prod",
    label: "SuccessFactors PROD",
    baseUrl: "https://api17.sapsf.com",
    authType: "basic",
    username: "API_USER@ACMECORP",
    password: "pw",
    ...over,
  };
}

function request(payload: unknown) {
  return new Request("https://example.test/api/studio/connections", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  }) as never;
}

beforeEach(() => {
  for (const m of Object.values(mocks)) m.mockReset();
  mocks.getCurrentUser.mockResolvedValue(CONSULTANT);
  mocks.findFirstConnection.mockResolvedValue(null);
  mocks.upsert.mockResolvedValue({ id: "conn_sf", product: "successfactors", key: "sf-prod" });
  mocks.writeConfigAudit.mockResolvedValue(undefined);
  vi.stubEnv("SF_BASIC_AUTH_DELETION_DATE", "");
  vi.stubEnv("SAP_HOST_ALLOWLIST_EXTRA", "");
  // A month before SAP's retirement date — when this shipped.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-20T09:00:00Z"));
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("SuccessFactors API hosts are admitted", () => {
  it.each(["https://api17.sapsf.com", "https://api55.sapsf.eu", "https://api15.sapsf.cn"])(
    "saves a connection to %s",
    async (baseUrl) => {
      const res = await POST(request(body({ baseUrl, authType: "bearer", bearerToken: "t" })));
      expect(res.status, JSON.stringify(await res.clone().json())).toBe(200);
      expect(mocks.upsert).toHaveBeenCalledOnce();
    },
  );

  it("still refuses a look-alike before anything is stored", async () => {
    for (const baseUrl of ["https://evil-sapsf.com", "https://sapsf.com.evil.io"]) {
      mocks.upsert.mockClear();
      const res = await POST(request(body({ baseUrl })));
      const json = await res.json();
      expect(res.status, baseUrl).toBe(400);
      expect(json.error.message).toContain("not a SAP-served host");
      expect(mocks.upsert).not.toHaveBeenCalled();
    }
  });
});

describe("a NEW SuccessFactors connection on Basic", () => {
  it("is saved, and the response carries the dated notice", async () => {
    const res = await POST(request(body()));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(mocks.upsert).toHaveBeenCalledOnce();
    expect(json.data.replaced).toBe(false);
    expect(json.data.warning).toContain("2026-11-20");
    expect(json.data.warning).toContain("2027-11-12");
    expect(json.data.warning).toMatch(/OAuth SAML bearer/);
  });

  it("is recorded in the audit as warned — without the secret", async () => {
    await POST(request(body()));
    const audit = mocks.writeConfigAudit.mock.calls[0]?.[0] as { after: Record<string, unknown> };
    expect(audit.after.sfBasicAuthSunsetWarned).toBe(true);
    expect(JSON.stringify(audit)).not.toContain('"pw"');
  });

  it("is still saved after SAP's deletion date — a notice, not a refusal", async () => {
    vi.setSystemTime(new Date("2027-12-01T09:00:00Z"));
    const res = await POST(request(body()));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.data.warning).toMatch(/stopped accepting HTTP Basic/);
  });
});

describe("what gets no notice", () => {
  it("re-saving an EXISTING Basic connection — that is credential rotation", async () => {
    mocks.findFirstConnection.mockResolvedValueOnce({ id: "conn_sf" }).mockResolvedValue(null);
    const res = await POST(request(body()));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.replaced).toBe(true);
    expect(json.data.warning).toBeUndefined();
    const audit = mocks.writeConfigAudit.mock.calls[0]?.[0] as { after: Record<string, unknown> };
    expect(audit.after.sfBasicAuthSunsetWarned).toBeUndefined();
  });

  it("a new SuccessFactors connection on SAML bearer", async () => {
    const res = await POST(
      request(
        body({
          authType: "oauth-saml-bearer",
          username: undefined,
          password: undefined,
          clientId: "API_KEY",
          companyId: "ACMECORP",
          oauthTokenUrl: "https://api17.sapsf.com/oauth/token",
          samlAssertion: "PHNhbWw+PC9zYW1sPg==",
        }),
      ),
    );
    const json = await res.json();
    expect(res.status, JSON.stringify(json)).toBe(200);
    expect(json.data.warning).toBeUndefined();
  });

  it("a new Basic connection to another product", async () => {
    const res = await POST(
      request(body({ product: "s4hana", key: "s4-dev", baseUrl: "https://my300000-api.s4hana.cloud.sap" })),
    );
    const json = await res.json();
    expect(res.status, JSON.stringify(json)).toBe(200);
    expect(json.data.warning).toBeUndefined();
  });
});
