// @vitest-environment node
/**
 * The capability registry cannot claim what the code does not do (P0.15).
 *
 * Three kinds of check:
 *   1. The committed docs/coreedge/capability-registry.json is exactly what the
 *      registry builds from today's code, so the simulator never reads a
 *      stale claim.
 *   2. Every BROKER_FACTS value — the facts the registry declares because the
 *      module that holds them reaches the database — is checked against that
 *      module here, by behaviour where it can be and by source where it cannot.
 *   3. The scoring follows the code: change a fact and the cells move.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ auditCreate: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: { northboundAuditEvent: { create: db.auditCreate } },
}));

import {
  BROKER_FACTS,
  buildCapabilityRegistry,
  CONSUMER_AUTHS,
  CONSUMERS,
  EVIDENCE,
  EXTENDED_CONSUMERS,
  EXTENDED_TARGETS,
  EXTENDED_TECHS,
  HOSTINGS,
  LIFECYCLE_STAGES,
  PATTERNS,
  readCodeFacts,
  registeredApiVersions,
  SAP_AUTHS,
  serializeCapabilityRegistry,
  TARGET_PRODUCTS,
  TARGETS,
  TECHS,
  type CapabilityCell,
} from "@/lib/coreedge/capability-registry";
import { stepUpMode } from "@/lib/auth/step-up";
import { recordNorthboundCall } from "@/lib/northbound/audit";
import { NORTHBOUND_API_VERSIONS } from "@/lib/northbound/version-policy";
import { readEntitySet } from "@/lib/northbound/read";
import { productAcceptsServicePath } from "@/lib/sap-public/interface-service";
import { getSapProduct, SAP_ODATA_PRODUCTS } from "@/lib/sap-public/tdd-connector";
import { MACHINE_API_PREFIXES } from "@/lib/security/rate-limit";
import { BROKER_OPERATIONS } from "@/lib/contracts/openapi";
import { FILTER_OPERATORS } from "@/lib/odata/params";
import { PAGE_BOUNDS, QUERY_FILTER_OPS } from "@/lib/odata/policy";

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? files(full) : [full];
  });
}

const status = (cells: readonly CapabilityCell[], row: string, col = "") =>
  cells.find((c) => c.row === row && c.col === col)?.status;

describe("the committed registry JSON", () => {
  it("is exactly what the registry builds from today's code (run `pnpm coreedge:registry`)", () => {
    expect(read("docs/coreedge/capability-registry.json")).toBe(serializeCapabilityRegistry());
  });
});

describe("the facts the registry reads from the code", () => {
  it("maps every connector product to a target, and every mapped product exists", () => {
    const mapped = new Set(Object.values(TARGET_PRODUCTS).filter((p): p is string => p !== null));
    for (const p of SAP_ODATA_PRODUCTS) expect(mapped, `${p.key} has no target`).toContain(p.key);
    for (const key of mapped) expect(getSapProduct(key), key).not.toBeNull();
  });

  it("assumes a service path on every OData product, as interface-service.ts accepts", () => {
    for (const p of SAP_ODATA_PRODUCTS) expect(productAcceptsServicePath(p.key), p.key).toBe(true);
    // Ariba is not an OData product, so it may carry no path, and the registry scores its OData as none.
    expect(productAcceptsServicePath("ariba")).toBe(false);
  });

  it("finds customer and partner service roots that the service-path validator accepts", () => {
    expect(readCodeFacts().servicePathOrigins).toEqual(["CUSTOMER_CUSTOM", "PARTNER"]);
  });
});

describe("BROKER_FACTS hold against the broker", () => {
  it("a read sends only $top and $format, and never more than readMaxRows rows", async () => {
    let url = "";
    const fakeFetch = (async (u: string | URL) => {
      url = String(u);
      return new Response(JSON.stringify({ d: { results: [] } }), { status: 200 });
    }) as unknown as typeof fetch;
    await readEntitySet(
      {
        connection: {
          source: "db",
          id: "c1",
          organizationId: "o1",
          product: "s4hana",
          key: "k",
          label: "l",
          baseUrl: "https://my1.s4hana.ondemand.com",
          authType: "basic",
          secrets: { username: "u", password: "p" },
          oauthTokenUrl: null,
          writeEnabled: false,
          apiPath: null,
          timeoutMs: null,
          environment: "TEST",
          client: null,
        },
        servicePath: "/sap/opu/odata/sap/API_X_SRV",
        entitySet: "A_X",
        limit: 5000,
      },
      fakeFetch,
    );
    const params = new URL(url).searchParams;
    expect([...params.keys()]).toEqual([...BROKER_FACTS.readQueryOptions]);
    expect(params.get("$top")).toBe(String(BROKER_FACTS.readMaxRows));
  });

  it("the query surface emits the options, operators, page bound and key lookup the registry names (P1.4)", () => {
    // SapOption is the compiler's closed set of option names: the only ones a query can carry to SAP.
    const options = BROKER_FACTS.queryOptions.map((o) => `"${o}"`).join(" | ");
    expect(read("src/lib/odata/operation-compiler.ts")).toContain(`export type SapOption = ${options};`);
    expect([...QUERY_FILTER_OPS]).toEqual([...BROKER_FACTS.queryFilterOperators]);
    expect([...FILTER_OPERATORS]).toEqual([...BROKER_FACTS.queryFilterOperators]);
    expect(PAGE_BOUNDS.maxSize).toBe(BROKER_FACTS.queryMaxPageSize);
    expect(BROKER_OPERATIONS.getByKey.served).toBe(BROKER_FACTS.queryKeyLookup);
  });

  it("the write executor performs CREATE only and neither executor sends $batch", () => {
    const access = read("src/lib/northbound/authorisation.ts");
    expect(BROKER_FACTS.writeOperations).toEqual(["CREATE"]);
    expect(access).toMatch(/if \(iface\.operation !== "CREATE"\) \{\s*return \{\s*ok: false,\s*reason: "OPERATION_NOT_SUPPORTED"/);
    expect(BROKER_FACTS.batch).toBe(false);
    for (const f of ["src/lib/northbound/read.ts", "src/lib/northbound/write.ts"]) expect(read(f)).not.toContain("$batch");
  });

  it("the write executor sends JSON only", () => {
    expect(read("src/lib/northbound/write.ts")).toContain(`"Content-Type": "${BROKER_FACTS.writeContentType}"`);
  });

  it("the northbound routes are exactly the ones listed, each on both base paths", () => {
    const dir = path.join(ROOT, "src/app/api/northbound");
    const routes = files(dir).map((f) => path.relative(dir, f).split(path.sep).join("/")).sort();
    const listed = [...BROKER_FACTS.northboundRoutes, ...BROKER_FACTS.northboundPublicRoutes];
    expect(routes).toEqual(listed.flatMap((r) => [r, `${BROKER_FACTS.northboundAliasDir}/${r}`]).sort());
    // An alias re-exports the original handler, so the registry scores the
    // original (P1.10; versioned-routes.test.ts proves it is the same function).
    for (const route of listed) {
      const alias = read(`src/app/api/northbound/${BROKER_FACTS.northboundAliasDir}/${route}`);
      expect(alias).toContain(`from "@/app/api/northbound/${route.replace(/\.ts$/, "")}"`);
    }
  });

  it("the public northbound routes take no credential and serve only the changelog", () => {
    for (const route of BROKER_FACTS.northboundPublicRoutes) {
      const src = read(`src/app/api/northbound/${route}`);
      expect(src).not.toContain("authenticateClientToken");
      expect(src).not.toMatch(/prisma|fetch\(/);
    }
  });

  it("the reserved machine prefixes listed as unbuilt have no route", () => {
    for (const prefix of BROKER_FACTS.unbuiltMachineRoutes) {
      expect(MACHINE_API_PREFIXES as readonly string[]).toContain(prefix);
      expect(existsSync(path.join(ROOT, "src/app", prefix)), `${prefix} now has a route; re-score the registry`).toBe(false);
    }
  });

  it("the SAP auth types are the resolver's SapAuthType union", () => {
    const src = read("src/lib/sap-public/connection-resolver.ts");
    const union = /export type SapAuthType =([\s\S]*?);/.exec(src)?.[1] ?? "";
    const members = [...union.matchAll(/\|\s*"([a-z-]+)"/g)].map((m) => m[1]);
    expect(members).toEqual([...BROKER_FACTS.sapAuthTypes]);
  });

  it("a consumer authenticates with a bearer key only", () => {
    expect(BROKER_FACTS.consumerAuth).toEqual(["STATIC_BEARER"]);
    const sources = [
      ...files(path.join(ROOT, "src/app/api/northbound")),
      ...files(path.join(ROOT, "src/lib/northbound")),
      ...files(path.join(ROOT, "src/lib/governed")),
    ].map((f) => readFileSync(f, "utf8"));
    // Since P0.14 the data and write routes authenticate through the governed
    // pipeline's step, which is the same bearer lookup.
    expect(read("src/lib/governed/pipeline.ts")).toContain("authenticateClientToken(bearer)");
    for (const route of BROKER_FACTS.northboundRoutes) {
      expect(read(`src/app/api/northbound/${route}`)).toMatch(
        /authenticateClientToken\(bearer\)|await authenticate\(request\.headers, correlationId/,
      );
    }
    for (const text of sources) {
      expect(text).not.toMatch(/client_credentials|grant_type|x-forwarded-client-cert|getPeerCertificate|id_token/);
    }
  });

  it("COREEDGE_STEP_UP defaults to the mode the registry names", () => {
    expect(stepUpMode({} as NodeJS.ProcessEnv)).toBe(BROKER_FACTS.stepUpDefault);
  });

  it("a failed broker audit insert is swallowed, not fatal", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    db.auditCreate.mockRejectedValueOnce(new Error("db down"));
    await expect(
      recordNorthboundCall({
        organizationId: "o1",
        solutionId: "s1",
        interfaceId: null,
        operation: "READ",
        externalId: "-",
        environment: "TEST",
        status: 200,
        rowCount: 0,
        correlationId: "c",
        clientTokenId: "t",
      }),
    ).resolves.toBeUndefined();
    expect(BROKER_FACTS.auditFailClosed).toBe(false);
  });

  it("the lifecycle claims about missing pieces still hold", () => {
    expect(existsSync(path.join(ROOT, "Dockerfile")), "a Dockerfile exists; re-score SELF_HOST_SETUP").toBe(false);
    const perf = files(path.join(ROOT, "tests/performance")).map((f) => readFileSync(f, "utf8")).join("\n");
    expect(perf, "a broker load test exists; re-score PERFORMANCE_TEST").not.toMatch(/northbound/i);
  });
});

describe("evidence for full", () => {
  it("names tests and documents that exist", () => {
    for (const [key, e] of Object.entries(EVIDENCE)) {
      expect(e.tests.length, key).toBeGreaterThan(0);
      expect(e.docs.length, key).toBeGreaterThan(0);
      for (const f of [...e.tests, ...e.docs]) expect(existsSync(path.join(ROOT, f)), `${key}: ${f}`).toBe(true);
    }
  });

  it("is the only way a cell is full", () => {
    const r = buildCapabilityRegistry();
    const all: Array<[string, CapabilityCell]> = Object.entries(r.coreedgeToday).flatMap(([t, cells]) =>
      (cells as CapabilityCell[]).map((c) => [t, c] as [string, CapabilityCell]),
    );
    for (const [table, c] of all) {
      if (c.status !== "full") continue;
      const key = `${table}:${c.col ? `${c.row}|${c.col}` : c.row}`;
      expect(EVIDENCE[key], key).toBeDefined();
    }
  });
});

describe("the registry's shape", () => {
  const r = buildCapabilityRegistry();
  it("scores every core cell once", () => {
    expect(r.coreedgeToday.targetTech).toHaveLength(TARGETS.length * TECHS.length);
    expect(r.coreedgeToday.techPattern).toHaveLength(TECHS.length * PATTERNS.length);
    expect(r.coreedgeToday.network).toHaveLength(3);
    expect(r.coreedgeToday.origin).toHaveLength(3);
    expect(r.coreedgeToday.sapAuth).toHaveLength(SAP_AUTHS.length);
    expect(r.coreedgeToday.consumerAuth).toHaveLength(CONSUMERS.length * CONSUMER_AUTHS.length);
    expect(r.coreedgeToday.lifecycle.map((c) => c.row)).toEqual([...LIFECYCLE_STAGES]);
    for (const h of HOSTINGS) expect(r.networkByHosting[h]).toHaveLength(3);
  });

  it("scores every extended cell once", () => {
    expect(r.extended.targetTech).toHaveLength(
      EXTENDED_TARGETS.length * TECHS.length + (TARGETS.length + EXTENDED_TARGETS.length) * EXTENDED_TECHS.length,
    );
    expect(r.extended.techPattern).toHaveLength(EXTENDED_TECHS.length * PATTERNS.length);
    expect(r.extended.consumerAuth).toHaveLength(EXTENDED_CONSUMERS.length * CONSUMER_AUTHS.length);
  });

  it("gives every cell a note and a basis", () => {
    const cells = [...Object.values(r.coreedgeToday), ...Object.values(r.extended), ...Object.values(r.networkByHosting)].flat();
    for (const c of cells as CapabilityCell[]) {
      expect(c.note.length, `${c.row}|${c.col}`).toBeGreaterThan(10);
      expect(c.basis.length, `${c.row}|${c.col}`).toBeGreaterThan(0);
    }
  });
});

describe("the claims the roadmap quotes (section 3, P0.15)", () => {
  const r = buildCapabilityRegistry();
  const t = r.coreedgeToday;

  it("the hosted instance reaches neither private networks nor IP-allow-listed systems (caveat 4)", () => {
    expect(r.headlineHosting).toBe("SHARED");
    expect(status(t.network, "PUBLIC_INTERNET")).toBe("full");
    expect(status(t.network, "SAP_SIDE_IP_ALLOWLIST")).toBe("none");
    expect(status(t.network, "PRIVATE_NETWORK")).toBe("none");
    expect(status(r.networkByHosting.SELF_HOSTED, "PRIVATE_NETWORK")).toBe("partial");
    expect(status(r.networkByHosting.CONNECTOR, "PUBLIC_INTERNET")).toBe("none");
  });

  it("customer-built and partner APIs are partial now that P1.1 has landed", () => {
    expect(status(t.origin, "CUSTOMER_CUSTOM")).toBe("partial");
    expect(status(t.origin, "PARTNER")).toBe("partial");
    expect(status(t.targetTech, "ECC", "ODATA_V2")).toBe("partial");
    expect(status(t.targetTech, "SUCCESSFACTORS", "ODATA_V4")).toBe("partial");
  });

  it("governance is partial while its holes are open by default (caveat 9a)", () => {
    expect(status(t.lifecycle, "GOVERN_AUDIT_COMPLY")).toBe("partial");
    expect(status(t.lifecycle, "SECRETS_KEYS")).toBe("partial");
  });

  it("only OData is executed, and only reads and creates", () => {
    for (const tech of ["SOAP", "REST", "RFC_BAPI", "IDOC", "EVENTS", "FILE_SFTP"]) {
      for (const target of TARGETS) expect(status(t.targetTech, target, tech), `${target}|${tech}`).toBe("none");
    }
    expect(status(t.techPattern, "ODATA_V2", "SYNC_READ")).toBe("partial");
    expect(status(t.techPattern, "ODATA_V2", "SYNC_UPDATE_DELETE_ACTION")).toBe("none");
  });
});

describe("the scoring follows the code", () => {
  const facts = readCodeFacts();

  it("an OData version the service path no longer allows takes its cells to none", () => {
    const r = buildCapabilityRegistry({ ...facts, brokerTechs: ["ODATA_V2"] });
    for (const target of TARGETS) expect(status(r.coreedgeToday.targetTech, target, "ODATA_V4")).toBe("none");
    expect(status(r.coreedgeToday.techPattern, "ODATA_V4", "SYNC_READ")).toBe("none");
  });

  it("a validator that refuses custom paths takes customer and partner APIs to none", () => {
    const r = buildCapabilityRegistry({ ...facts, servicePathOrigins: [] });
    expect(status(r.coreedgeToday.origin, "CUSTOMER_CUSTOM")).toBe("none");
    expect(status(r.coreedgeToday.origin, "PARTNER")).toBe("none");
    expect(status(r.coreedgeToday.lifecycle, "PROVIDER_BUILD_TRANSPORT")).toBe("none");
  });

  it("a removed OData product takes its target to none", () => {
    const r = buildCapabilityRegistry({ ...facts, odataProducts: facts.odataProducts.filter((p) => p !== "ecc") });
    expect(status(r.coreedgeToday.targetTech, "ECC", "ODATA_V2")).toBe("none");
  });

  it("an empty host allow-list takes the public internet to none", () => {
    const r = buildCapabilityRegistry({ ...facts, publicHostSuffixes: 0 });
    expect(status(r.coreedgeToday.network, "PUBLIC_INTERNET")).toBe("none");
  });

  it("a KMS key provider lifts the limit on SECRETS_KEYS (still partial until evidence is recorded)", () => {
    const before = buildCapabilityRegistry(facts).coreedgeToday.lifecycle.find((c) => c.row === "SECRETS_KEYS")!;
    const after = buildCapabilityRegistry({ ...facts, keyProviders: ["env", "aws-kms"] }).coreedgeToday.lifecycle.find(
      (c) => c.row === "SECRETS_KEYS",
    )!;
    expect(before.note).toContain("no KMS");
    expect(after.note).not.toContain("no KMS");
    expect(after.status).toBe("partial");
  });

  it("API_VERSIONING follows the version registry (P1.10)", () => {
    expect(facts.northboundApiVersions).toEqual(NORTHBOUND_API_VERSIONS.map((v) => v.version));
    expect(facts.northboundApiVersions.length).toBeGreaterThan(0);
    expect(status(buildCapabilityRegistry(facts).coreedgeToday.lifecycle, "API_VERSIONING")).toBe("full");
    // No version that keeps the policy: none, as before P1.10.
    expect(status(buildCapabilityRegistry({ ...facts, northboundApiVersions: [] }).coreedgeToday.lifecycle, "API_VERSIONING")).toBe("none");
  });

  it("a version registry that breaks the deprecation policy registers no version", () => {
    // A sunset with no deprecation announced first is one break checkRegistry refuses.
    const broken = [{ ...NORTHBOUND_API_VERSIONS[0]!, sunsetOn: "2027-01-01" }];
    expect(registeredApiVersions(broken)).toEqual([]);
    expect(registeredApiVersions(NORTHBOUND_API_VERSIONS)).toEqual(NORTHBOUND_API_VERSIONS.map((v) => v.version));
  });

  it("a starter kit without a TypeScript client takes JS/TS below full", () => {
    const r = buildCapabilityRegistry({ ...facts, starterKitFiles: facts.starterKitFiles.filter((f) => f !== "client.ts") });
    expect(status(r.coreedgeToday.consumerAuth, "JS_TS", "STATIC_BEARER")).toBe("partial");
    expect(status(r.coreedgeToday.lifecycle, "DEVELOP_SDK_CODEGEN")).toBe("none");
  });
});
