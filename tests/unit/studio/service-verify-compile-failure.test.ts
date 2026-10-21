// @vitest-environment node
/**
 * A compiler that throws, or that the envelope stops, never fails a verify
 * (P1 wave A integration review; P1.3 structural containment).
 *
 * The verify compiles the description it has just read (P1.3), in the
 * envelope (lib/contracts/envelope.ts). The compiler is meant to refuse,
 * never throw, on anything a SAP system can answer — but a bug in it must
 * not turn a verify into a 500, and neither may a description that runs the
 * compile out of memory or time: the verdict falls back to the readers the
 * verify used before the compiler, exactly as a refused document does, and
 * the failure is logged by name only.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import type * as Envelope from "@/lib/contracts/envelope";

const envelope = vi.hoisted(() => ({ compileInEnvelope: vi.fn() }));
vi.mock("@/lib/contracts/envelope", async (importOriginal) => {
  const actual = await importOriginal<typeof Envelope>();
  return {
    ...actual,
    compileInEnvelope: (...args: Parameters<typeof actual.compileInEnvelope>) =>
      envelope.compileInEnvelope.getMockImplementation() ? envelope.compileInEnvelope(...args) : actual.compileInEnvelope(...args),
  };
});

import { compileInEnvelope as realCompileInEnvelope } from "@/lib/contracts/envelope";
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
  envelope.compileInEnvelope.mockReset();
});

const verify = () =>
  verifyServiceMetadata(
    { connection: CONNECTION, servicePath: "/sap/opu/odata/sap/Z_SRV", declaredVersion: "V2", entitySet: "A_Travel" },
    vi.fn(async () => new Response(V2_EDMX, { status: 200, headers: { "content-type": "application/xml" } })) as unknown as typeof fetch,
  );

describe("a compiler that throws", () => {
  it("is refused in the envelope as an unreadable description, logged by name only", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    // A body that is not text makes the compiler itself throw, inside the worker.
    const r = await realCompileInEnvelope(42 as unknown as string, null, null);
    expect(r).toMatchObject({ ok: false, reason: "INVALID_CSDL" });
    expect(logged).toHaveBeenCalledWith("[contracts] compile failed", { error: "INTERNAL" });
  }, 30_000);

  it.each([
    ["the compiler threw", { ok: false, reason: "INVALID_CSDL", detail: "The service description could not be read as a service description." }],
    ["the envelope stopped it", { ok: false, reason: "RESOURCE_LIMIT", detail: "The service description needs more memory or time to compile than a description may use, so it was not compiled." }],
  ])("%s: the older readers give the verdict, and the verify answers", async (_label, refusal) => {
    envelope.compileInEnvelope.mockImplementation(async () => refusal);
    const r = await verify();
    expect(r).toMatchObject({ status: "OK", verified: true, entitySets: ["A_Travel"], detectedODataVersion: "V2" });
    expect(r.compiled).toEqual(refusal);
    // The detail never carries anything from the description.
    expect(JSON.stringify(r.compiled)).not.toContain("Travel");
  });
});
