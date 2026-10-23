// @vitest-environment node
/**
 * A compiler that throws, or that the envelope stops, never fails a verify
 * (P1 wave A integration review; P1.3 containment).
 *
 * The verify compiles the description it has just read (P1.3) in the record
 * job, in the envelope (lib/contracts/envelope.ts). The compiler is meant to
 * refuse, never throw, on anything a SAP system can answer — but a bug in it
 * must not turn a verify into a 500, and neither may a description that runs
 * the job out of memory or time: the verdict falls back to the readers the
 * verify used before the compiler, exactly as a refused document does, and
 * the failure is logged by name only.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import type * as Envelope from "@/lib/contracts/envelope";

const envelope = vi.hoisted(() => ({ runContractJob: vi.fn() }));
vi.mock("@/lib/contracts/envelope", async (importOriginal) => {
  const actual = await importOriginal<typeof Envelope>();
  return {
    ...actual,
    runContractJob: (...args: Parameters<typeof actual.runContractJob>) =>
      envelope.runContractJob.getMockImplementation() ? envelope.runContractJob(...args) : actual.runContractJob(...args),
  };
});

import type { ResolvedSapConnection } from "@/lib/sap-public/connection-resolver";
import { verifyServiceMetadata } from "@/lib/studio/service-verify";

const CONNECTION = {
  source: "db",
  id: "conn_dev",
  organizationId: "org_a",
  product: "s4hana-onprem",
  key: "dev",
  label: "ERP DEV",
  baseUrl: "https://erp.example.internal:44300",
  authType: "basic",
  secrets: { username: "u", password: "p" },
  oauthTokenUrl: null,
  writeEnabled: false,
  apiPath: null,
  timeoutMs: null,
  environment: "DEV",
  client: "100",
} as unknown as ResolvedSapConnection;

const V2_EDMX =
  '<?xml version="1.0" encoding="utf-8"?>' +
  '<edmx:Edmx Version="1.0" xmlns:edmx="http://schemas.microsoft.com/ado/2007/06/edmx">' +
  '<edmx:DataServices><Schema Namespace="Z"><EntityType Name="Travel"/>' +
  '<EntityContainer Name="Z_Entities"><EntitySet Name="A_Travel" EntityType="Z.Travel"/></EntityContainer>' +
  "</Schema></edmx:DataServices></edmx:Edmx>";

afterEach(() => {
  vi.restoreAllMocks();
  envelope.runContractJob.mockReset();
});

const verify = (body: unknown = V2_EDMX) =>
  verifyServiceMetadata(
    { connection: CONNECTION, servicePath: "/sap/opu/odata/sap/Z_SRV", declaredVersion: "V2", entitySet: "A_Travel" },
    vi.fn(async () => new Response(body as string, { status: 200, headers: { "content-type": "application/xml" } })) as unknown as typeof fetch,
  );

describe("a compiler that throws", () => {
  it("is refused in the envelope as an unreadable description, logged by name only", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    // The job itself throws inside the worker (INTERNAL): an unreadable description, as before.
    envelope.runContractJob.mockImplementation(async () => ({ ok: false, reason: "INTERNAL", detail: "It could not be read.", ms: 1, cause: "TypeError" }));
    const r = await verify();
    expect(r.compiled).toMatchObject({ ok: false, reason: "INVALID_CSDL" });
    expect(logged).toHaveBeenCalledWith("[contracts] compile failed", { error: "INTERNAL" });
  }, 30_000);

  it.each([
    ["the compiler threw", { ok: false, reason: "INTERNAL", detail: "It could not be read.", ms: 1 }, { ok: false, reason: "INVALID_CSDL", detail: "The service description could not be read as a service description." }],
    [
      "the envelope stopped it",
      { ok: false, reason: "RESOURCE_LIMIT", detail: "It needs more memory or time than one contract compiler job may use, so it was not processed.", ms: 1 },
      { ok: false, reason: "RESOURCE_LIMIT", detail: "It needs more memory or time than one contract compiler job may use, so it was not processed." },
    ],
  ])("%s: the older readers give the verdict, and the verify answers", async (_label, refusal, compiled) => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    envelope.runContractJob.mockImplementation(async () => refusal);
    const r = await verify();
    expect(r).toMatchObject({ status: "OK", verified: true, entitySets: ["A_Travel"], detectedODataVersion: "V2" });
    expect(r.compiled).toEqual(compiled);
    // The detail never carries anything from the description.
    expect(JSON.stringify(r.compiled)).not.toContain("Travel");
  });
});
