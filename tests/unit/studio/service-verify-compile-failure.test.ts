// @vitest-environment node
/**
 * A compiler that throws never fails a verify (P1 wave A integration review).
 *
 * The verify compiles the description it has just read (P1.3). The compiler is
 * meant to refuse, never throw, on anything a SAP system can answer — but a
 * bug in it must not turn a verify into a 500: the verdict falls back to the
 * readers the verify used before the compiler, exactly as a refused document
 * does, and the failure is logged.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/contracts/compile", () => ({
  compileContract: () => {
    throw new TypeError("Cannot convert object to primitive value");
  },
}));

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

afterEach(() => vi.restoreAllMocks());

describe("a compiler that throws", () => {
  it("is a refused compile: the older readers give the verdict, and the verify answers", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchImpl = vi.fn(
      async () => new Response(V2_EDMX, { status: 200, headers: { "content-type": "application/xml" } }),
    ) as unknown as typeof fetch;
    const r = await verifyServiceMetadata(
      { connection: CONNECTION, servicePath: "/sap/opu/odata/sap/Z_SRV", declaredVersion: "V2", entitySet: "A_Travel" },
      fetchImpl,
    );
    expect(r).toMatchObject({ status: "OK", verified: true, entitySets: ["A_Travel"], detectedODataVersion: "V2" });
    expect(r.compiled).toMatchObject({ ok: false, reason: "INVALID_CSDL" });
    // The detail never carries what the compiler threw.
    expect(JSON.stringify(r.compiled)).not.toContain("primitive");
    expect(logged).toHaveBeenCalledWith("[contracts] compile failed", expect.objectContaining({ error: "TypeError" }));
  });
});
