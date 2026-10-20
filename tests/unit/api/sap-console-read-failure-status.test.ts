/**
 * Console reads record SAP's own refusals as refusals, not as tenant 5xx
 * (audit A26).
 *
 * /preview audited `preview.ok ? 200 : 502`, so a 403 SAP returned correctly —
 * an entity set the DEV arrangement does not release, normal during discovery
 * — wrote a 502 row while the screen showed 403. /entities turned an expired
 * communication-user password (401 on $metadata) into a 502 "SAP metadata
 * request failed", and /operations audited 502 whenever no section was ok,
 * every section refused 403 included. A credential CoreEdge could not even
 * build, so no request was sent, was a 502 too. The upstream-errors incident
 * counts audited 5xx and tells the operator "a 5xx is the tenant's answer":
 * five Preview clicks raised a MAJOR incident against a healthy tenant.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import type * as ConsoleReadGuard from "@/lib/sap-public/console-read-guard";
import type * as TddConnector from "@/lib/sap-public/tdd-connector";
import type { ResolvedReadTenant } from "@/lib/sap-public/tenant-for-read";
import type * as TenantForRead from "@/lib/sap-public/tenant-for-read";
import {
  ConnectionConfigError,
  OAuthTokenRequestError,
  SapCredentialError,
  SapHttpError,
} from "@/lib/sap-public/upstream-failure";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  resolveReadTenant: vi.fn(),
  previewSapEntitySet: vi.fn(),
  inspectSapService: vi.fn(),
  probeSapEntitySets: vi.fn(),
  recordConsoleRead: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: { sapHubContent: { findFirst: async () => null } } }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/sap-public/probe-guard", () => ({ refuseUnlessMayProbeTenant: async () => null }));
vi.mock("@/lib/sap-public/tenant-for-read", async (importOriginal) => ({
  ...(await importOriginal<typeof TenantForRead>()),
  resolveReadTenant: mocks.resolveReadTenant,
}));
vi.mock("@/lib/sap-public/console-read-guard", async (importOriginal) => ({
  ...(await importOriginal<typeof ConsoleReadGuard>()),
  decideConsoleRead: async () => ({ allowed: true, refusal: null, message: null }),
  recordConsoleRead: mocks.recordConsoleRead,
}));
vi.mock("@/lib/sap-public/tdd-connector", async (importOriginal) => ({
  ...(await importOriginal<typeof TddConnector>()),
  previewSapEntitySet: mocks.previewSapEntitySet,
  inspectSapService: mocks.inspectSapService,
  probeSapEntitySets: mocks.probeSapEntitySets,
}));

const preview = await import("@/app/api/sap/tdd/preview/route");
const entities = await import("@/app/api/sap/tdd/entities/route");
const operations = await import("@/app/api/sap/tdd/operations/route");

const DEV: ResolvedReadTenant = {
  tenant: { key: "dev", label: "Acme DEV", baseUrl: "https://acme-dev.example" },
  source: "connection",
  connection: { id: "conn_dev", environment: "DEV" },
} as ResolvedReadTenant;

const get = (url: string) => ({ nextUrl: new URL(`http://localhost${url}`) }) as never;
const audited = () => mocks.recordConsoleRead.mock.calls.map((c) => c[0] as { status: number; failureReason?: string | null });

const PREVIEW = "/api/sap/tdd/preview?product=s4hana&tenant=dev&service=purchase-orders&entity=A_PurchaseOrder";
const ENTITIES = "/api/sap/tdd/entities?product=s4hana&tenant=dev&service=purchase-orders&refresh=1";
const OPERATIONS = "/api/sap/tdd/operations?product=s4hana&tenant=dev&refresh=1";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurrentUser.mockResolvedValue({ id: "u1", role: "consultant", organizationId: "org_a", email: "c@a.co" });
  mocks.resolveReadTenant.mockResolvedValue(DEV);
  mocks.recordConsoleRead.mockResolvedValue(undefined);
});

describe("/preview", () => {
  it("SAP's own 403 is recorded as 403, not 502", async () => {
    mocks.previewSapEntitySet.mockResolvedValue({ ok: false, status: 403, durationMs: 1, rows: [], fields: [], nextLink: null });
    const res = await preview.GET(get(PREVIEW));
    expect(res.status).toBe(200);
    expect((await res.json()).data).toMatchObject({ ok: false, status: 403 });
    expect(audited()).toEqual([expect.objectContaining({ status: 403, failureReason: "HTTP_403" })]);
  });

  it("an HTML 401 is a sign-in refusal on screen and a 401 in the row", async () => {
    mocks.previewSapEntitySet.mockRejectedValue(new SapHttpError("Preview returned non-JSON response: HTTP 401", 401));
    const res = await preview.GET(get(PREVIEW));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe("FORBIDDEN");
    expect(body.error.message).toMatch(/rejected the connection's credentials \(HTTP 401\)/);
    expect(audited()).toEqual([expect.objectContaining({ status: 401 })]);
  });

  it("a credential CoreEdge could not build is a setup refusal — no request was sent", async () => {
    mocks.previewSapEntitySet.mockRejectedValue(
      new SapCredentialError(new ConnectionConfigError("Missing required env var: S4_TDD_PASSWORD")),
    );
    const res = await preview.GET(get(PREVIEW));
    expect(res.status).toBe(403);
    expect((await res.json()).error.message).toMatch(/could not authenticate to this tenant/);
    expect(audited()).toEqual([expect.objectContaining({ status: 403, failureReason: "CONNECTION_MISCONFIGURED" })]);
  });

  /*
   * SAP'S 429 IS NOT COREEDGE THROTTLING. Recorded as 429, ten Preview clicks
   * on a tenant that rate-limits OData raised the 'throttled' incident — "a
   * credential is being rate limited" — for a console read no CoreEdge bucket
   * refused. Only the three refusals are recorded as themselves; the status
   * survives as the failureReason and on screen.
   */
  it.each([429, 500, 400])("SAP's own JSON %i is recorded as 502 with HTTP_<n>, and shown as itself", async (status) => {
    mocks.previewSapEntitySet.mockResolvedValue({ ok: false, status, durationMs: 1, rows: [], fields: [], nextLink: null });
    const res = await preview.GET(get(PREVIEW));
    expect(res.status).toBe(200);
    expect((await res.json()).data).toMatchObject({ ok: false, status });
    expect(audited()).toEqual([expect.objectContaining({ status: 502, failureReason: `HTTP_${status}` })]);
  });

  it("a timeout is still a 502, with the generic sentence", async () => {
    mocks.previewSapEntitySet.mockRejectedValue(new Error("SAP request timed out after 30000ms"));
    const res = await preview.GET(get(PREVIEW));
    expect(res.status).toBe(502);
    expect((await res.json()).error.message).toBe("SAP preview request failed");
    expect(audited()).toEqual([expect.objectContaining({ status: 502 })]);
  });
});

describe("/entities", () => {
  it("an expired password (401 on $metadata) is a sign-in refusal, not 'SAP metadata request failed'", async () => {
    mocks.inspectSapService.mockRejectedValue(new SapHttpError("Metadata request failed: HTTP 401", 401));
    const res = await entities.GET(get(ENTITIES));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.message).not.toBe("SAP metadata request failed");
    expect(body.error.message).toMatch(/HTTP 401/);
    expect(audited()).toEqual([expect.objectContaining({ status: 401, failureReason: "HTTP_401" })]);
  });

  it("a 404 is NOT_FOUND", async () => {
    mocks.inspectSapService.mockRejectedValue(new SapHttpError("Metadata request failed: HTTP 404", 404));
    const res = await entities.GET(get(ENTITIES));
    expect(res.status).toBe(404);
    expect(audited()).toEqual([expect.objectContaining({ status: 404 })]);
  });

  it("a token endpoint that failed is a 502 — nothing was refused", async () => {
    mocks.inspectSapService.mockRejectedValue(
      new SapCredentialError(new OAuthTokenRequestError("OAuth token request failed: HTTP 503", 503)),
    );
    const res = await entities.GET(get(ENTITIES));
    expect(res.status).toBe(502);
    expect(audited()).toEqual([expect.objectContaining({ status: 502, failureReason: "TOKEN_HTTP_503" })]);
  });

  it("SAP's own 5xx stays the generic 502", async () => {
    mocks.inspectSapService.mockRejectedValue(new SapHttpError("Metadata request failed: HTTP 503", 503));
    const res = await entities.GET(get(ENTITIES));
    expect(res.status).toBe(502);
    expect((await res.json()).error.message).toBe("SAP metadata request failed");
    expect(audited()).toEqual([expect.objectContaining({ status: 502, failureReason: "HTTP_503" })]);
  });
});

describe("/operations", () => {
  const answered = (status: number) => ({ ok: status === 200, status, durationMs: 1, rows: [], fields: [], nextLink: null });

  it("every section refused 403 is recorded as 403, not 502", async () => {
    mocks.previewSapEntitySet.mockResolvedValue(answered(403));
    const res = await operations.GET(get(OPERATIONS));
    expect(res.status).toBe(200);
    expect(audited()).toEqual([expect.objectContaining({ status: 403, failureReason: "HTTP_403" })]);
  });

  it("every section unauthenticated is recorded as the setup refusal", async () => {
    mocks.previewSapEntitySet.mockRejectedValue(
      new SapCredentialError(new OAuthTokenRequestError("OAuth token request failed: HTTP 401", 401)),
    );
    await operations.GET(get(OPERATIONS));
    expect(audited()).toEqual([expect.objectContaining({ status: 403, failureReason: "TOKEN_REJECTED" })]);
  });

  /*
   * SAP'S STATUS STAYS ON THE ROW. Recorded as 502 and nothing else, a tenant
   * rate-limiting every section could not be told from a 5xx or a timeout —
   * /preview keeps it as failureReason HTTP_<n>, and so does this row.
   */
  it("every section rate-limited by SAP (429) is a 502, not CoreEdge throttling, with HTTP_429 kept", async () => {
    mocks.previewSapEntitySet.mockResolvedValue(answered(429));
    const res = await operations.GET(get(OPERATIONS));
    expect(res.status).toBe(200);
    expect((await res.json()).data.sections.every((s: { status: number }) => s.status === 429)).toBe(true);
    expect(audited()).toEqual([expect.objectContaining({ status: 502, failureReason: "HTTP_429" })]);
  });

  it("any section the tenant failed makes the row a 502, with that section's reason", async () => {
    let n = 0;
    mocks.previewSapEntitySet.mockImplementation(async () => answered(n++ === 0 ? 403 : 503));
    await operations.GET(get(OPERATIONS));
    expect(audited()).toEqual([expect.objectContaining({ status: 502, failureReason: "HTTP_503" })]);
  });

  it("one section read is a 200, as before, with no failure reason", async () => {
    let n = 0;
    mocks.previewSapEntitySet.mockImplementation(async () => answered(n++ === 0 ? 200 : 403));
    await operations.GET(get(OPERATIONS));
    expect(audited()).toEqual([expect.objectContaining({ status: 200, failureReason: null })]);
  });
});
