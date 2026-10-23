// @vitest-environment node
/**
 * P1.2, acceptance A2 against PostgreSQL and the real Contract Compiler
 * worker: an EDMX upload creates a DRAFT with a contract, and no tenant call.
 *
 *   - each golden description (tests/fixtures/contracts/edmx) creates one
 *     DRAFT Interface and one ContractSnapshot: 1.0.0, origin UPLOAD, no
 *     environment and no connection, the content hash the record job computes
 *     for that dataset; and one ConfigAudit CREATE row with the file's sha256;
 *   - `fetch` throws for the whole run, and no console or platform audit row
 *     is written: no SAP system was asked;
 *   - a failure after the snapshot is written leaves no interface (one
 *     transaction);
 *   - a later verify of the same description is UNCHANGED; a changed one is
 *     recorded as the next version, bumped against the upload;
 *   - GET /schema says the contract was described by an upload.
 *
 * WHAT IS REAL: the route, the envelope and its worker (from source, through
 * tsx), the record job, the snapshot writer, the tenant guard in throw mode,
 * and PostgreSQL. WHAT IS STOOD IN: the session. Skipped without
 * TEST_DATABASE_URL.
 */

import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Each upload runs a real worker thread, loaded from source: seconds on a loaded runner.
vi.setConfig({ testTimeout: 60_000 });

const h = vi.hoisted(() => ({ user: null as null | Record<string, unknown> }));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: async () => h.user }));
vi.mock("@/lib/db/prisma", async () => {
  const { PrismaClient } = await import("@prisma/client");
  const { tenantScopeGuard } = await import("@/lib/db/tenant-guard");
  const base = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL ?? "postgresql://unused:unused@localhost:1/unused" });
  return { prisma: base.$extends(tenantScopeGuard()) };
});

import { prisma } from "@/lib/db/prisma";
import { POST as uploadRoute } from "@/app/api/studio/interfaces/from-description/route";
import { GET as schemaRoute } from "@/app/api/northbound/interfaces/[id]/schema/route";
import { recordJob } from "@/lib/contracts/jobs";
import { recordVerifiedContract } from "@/lib/contracts/record";
import { loadRecordHeads } from "@/lib/contracts/snapshot";
import { createInterfaceFromDescription } from "@/lib/contracts/upload";
import { hashClientToken } from "@/lib/northbound/auth";
import { generateClientToken } from "@/lib/northbound/issue";
import { tenantScopeOf } from "@/lib/studio/tenant-scope";

const RUN = `p12up-${randomUUID().slice(0, 8)}`;
const ORG = `${RUN}-org`;
const USER = { id: `${RUN}-dev`, email: `${RUN}@abeam.com`, name: "Dev", role: "consultant", organizationId: ORG, authMethod: "session" };
const EDMX = join(process.cwd(), "tests/fixtures/contracts/edmx");
const read = (file: string) => readFileSync(join(EDMX, file), "utf8");

/** The golden set, each with the dataset its golden is cut to (tests/unit/contracts/golden.test.ts). */
const CASES = [
  { file: "business-partner.v2.xml", entitySet: "A_Partner", version: "V2" },
  { file: "sales-order-rap.v4.xml", entitySet: "SalesOrder", version: "V4" },
  { file: "successfactors-style.v2.xml", entitySet: "cust_TravelRequest", version: "V2" },
  { file: "z-travel-booking.v2.xml", entitySet: "BookingSet", version: "V2" },
  { file: "yy1-sales-bonus.v2.xml", entitySet: "YY1_SALESBONUS", version: "V2" },
  { file: "z-bonus-plan-rap.v4.xml", entitySet: "BonusPlan", version: "V4" },
] as const;

const pathFor = (file: string, version: "V2" | "V4") => {
  const name = `Z${file.replace(/\W/g, "_").toUpperCase()}`.slice(0, 40);
  return version === "V2" ? `/sap/opu/odata/sap/${name}` : `/sap/opu/odata4/sap/${name.toLowerCase()}/srvd/sap/${name.toLowerCase()}/0001`;
};

let solutionId = "";

function upload(description: string, fields: Record<string, unknown>): Promise<Response> {
  const form = new FormData();
  form.append("description", new Blob([description], { type: "application/xml" }), "metadata.xml");
  form.append("fields", JSON.stringify({ solutionId, sapProduct: "s4hana", operation: "READ", ...fields }));
  return uploadRoute(new NextRequest("http://localhost/api/studio/interfaces/from-description", { method: "POST", body: form }));
}

/** The content hash the record job gives this dataset: what the golden set digests. */
function expectedHash(description: string, entitySet: string): string {
  const compiled = recordJob({ description, entitySet, previous: [], unchangedHashes: [], current: null });
  if (!compiled.ok || !compiled.dataset?.ok) throw new Error("the golden did not compile");
  return compiled.dataset.hash;
}

const auditRows = () =>
  Promise.all([
    prisma.northboundAuditEvent.count({ where: { organizationId: ORG } }),
    prisma.platformConsoleRead.count({ where: { actorUserId: USER.id } }),
  ]);

describe.skipIf(!process.env.TEST_DATABASE_URL)("registration from an uploaded description (P1.2, A2)", () => {
  beforeAll(async () => {
    vi.stubEnv("COREEDGE_JOURNEY_EVENTS", "off");
    vi.stubGlobal("fetch", () => {
      throw new Error("an upload must not send a request to anywhere");
    });
    h.user = USER;
    await prisma.organization.create({ data: { id: ORG, name: "Upload", type: "client" } });
    await prisma.user.create({ data: { id: USER.id, email: USER.email, name: USER.name, role: USER.role, organizationId: ORG } });
    solutionId = (
      await prisma.solution.create({
        data: {
          organizationId: ORG,
          name: "Upload",
          slug: `${RUN}-upload`,
          classification: "CLIENT_APP",
          businessProblem: "Registration from a description.",
          dataClass: "INTERNAL",
          status: "ACTIVE",
        },
      })
    ).id;
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    await prisma.northboundAuditEvent.deleteMany({ where: { organizationId: ORG } });
    await prisma.contractTime.deleteMany({ where: { organizationId: ORG } });
    await prisma.organization.delete({ where: { id: ORG } });
    await prisma.user.deleteMany({ where: { id: USER.id } });
  });

  it.each(CASES)("$file creates a DRAFT with its contract 1.0.0, from no tenant", async ({ file, entitySet, version }) => {
    const description = read(file);
    const servicePath = pathFor(file, version);
    const res = await upload(description, { name: `${RUN} ${file}`, servicePath, odataVersion: version, entitySet });
    const body = (await res.json()) as { data?: { interface: { id: string }; contract: { semver: string; describedBy: string } }; error?: { message: string } };
    expect(res.status, body.error?.message).toBe(201);
    expect(body.data!.contract).toMatchObject({ semver: "1.0.0", describedBy: "upload" });

    const id = body.data!.interface.id;
    const iface = await prisma.interface.findFirst({ where: { id, organizationId: ORG } });
    expect(iface).toMatchObject({ status: "DRAFT", entitySet, servicePath, odataVersion: version, serviceVerifications: null });
    const snaps = await prisma.contractSnapshot.findMany({ where: { organizationId: ORG, interfaceId: id } });
    expect(snaps).toHaveLength(1);
    expect(snaps[0]).toMatchObject({ semver: "1.0.0", origin: "UPLOAD", environment: null, connectionId: null, source: "METADATA", odataVersion: version });
    expect(snaps[0]!.contentHash).toBe(expectedHash(description, entitySet));
    expect(snaps[0]!.schemasText).not.toBeNull();
    const audits = await prisma.configAudit.findMany({ where: { organizationId: ORG, entityType: "Interface", entityId: id } });
    expect(audits.map((a) => a.action)).toEqual(["CREATE"]);
    const after = audits[0]!.after as { upload: { sha256: string; bytes: number } };
    expect(after.upload.sha256).toBe(createHash("sha256").update(description, "utf8").digest("hex"));
    // Neither the description nor the file name is stored anywhere.
    expect(JSON.stringify(audits)).not.toContain("metadata.xml");
    expect(JSON.stringify(audits)).not.toContain("<edmx:Edmx");
  });

  it("asked no SAP system: no console row and no platform row was written", async () => {
    expect(await auditRows()).toEqual([0, 0]);
  });

  it("writes nothing when a step after the snapshot fails", async () => {
    const name = `${RUN} atomic`;
    await expect(
      createInterfaceFromDescription({
        scope: tenantScopeOf(ORG),
        actorId: USER.id,
        fields: {
          solutionId,
          sapProduct: "s4hana",
          name,
          operation: "READ",
          entitySet: "YY1_SALESBONUS",
          externalId: "custom:/sap/opu/odata/sap/yy1_atomic",
          servicePath: "/sap/opu/odata/sap/YY1_ATOMIC",
          odataVersion: "V2",
        },
        declaredVersion: "V2",
        description: read("yy1-sales-bonus.v2.xml"),
        deadlineAt: Date.now() + 45_000,
        afterSnapshot: async () => {
          throw new Error("injected");
        },
      }),
    ).rejects.toThrow("injected");
    expect(await prisma.interface.count({ where: { organizationId: ORG, name } })).toBe(0);
    expect(await prisma.contractSnapshot.count({ where: { organizationId: ORG, externalId: "custom:/sap/opu/odata/sap/yy1_atomic" } })).toBe(0);
  });

  it("a verify of the same description is UNCHANGED; a changed one is the next version", async () => {
    const description = read("yy1-sales-bonus.v2.xml");
    const res = await upload(description, { name: `${RUN} verify`, servicePath: "/sap/opu/odata/sap/YY1_VERIFY_CDS", odataVersion: "V2", entitySet: "YY1_SALESBONUS" });
    const id = ((await res.json()) as { data: { interface: { id: string } } }).data.interface.id;
    const iface = (await prisma.interface.findFirst({
      where: { id, organizationId: ORG },
      select: { id: true, version: true, externalId: true, entitySet: true, operation: true, mode: true },
    }))!;
    const scope = tenantScopeOf(ORG);
    // What the verify route records once the tenant answered its $metadata: the same record job, the same recorder.
    const verify = async (text: string) => {
      const heads = await loadRecordHeads(scope, iface, "DEV");
      const compiled = recordJob({ description: text, entitySet: iface.entitySet, previous: heads.previous, unchangedHashes: heads.unchangedHashes, current: heads.current ?? null });
      return recordVerifiedContract({ scope, iface, compiled, heads, environment: "DEV", connectionId: `${RUN}-conn`, actorId: USER.id });
    };
    const same = await verify(description);
    expect(same).toMatchObject({ status: "UNCHANGED", semver: "1.0.0" });
    const changed = await verify(description.replace(/\n\s*<Property Name="BonusRate"[^\n]*\/>/, ""));
    expect(changed.status).toBe("RECORDED");
    expect("semver" in changed && changed.semver).not.toBe("1.0.0");
    const rows = await prisma.contractSnapshot.findMany({ where: { organizationId: ORG, interfaceId: id }, orderBy: { createdAt: "asc" } });
    expect(rows.map((r) => [r.semver, r.origin, r.environment])).toEqual([
      ["1.0.0", "UPLOAD", null],
      [rows[1]!.semver, "VERIFY", "DEV"],
    ]);
  });

  it("GET /schema says the contract was described by an upload", async () => {
    const description = read("z-travel-booking.v2.xml");
    const res = await upload(description, { name: `${RUN} schema`, servicePath: "/sap/opu/odata/sap/ZUI_SCHEMA_O2", odataVersion: "V2", entitySet: "BookingSet" });
    const id = ((await res.json()) as { data: { interface: { id: string } } }).data.interface.id;
    const raw = generateClientToken("DEV");
    await prisma.solutionClient.create({
      data: { organizationId: ORG, solutionId, label: "DEV key", createdById: USER.id, tokenHash: hashClientToken(raw), environment: "DEV", isActive: true },
    });
    const answer = await schemaRoute(
      new NextRequest(`http://localhost/api/northbound/interfaces/${id}/schema`, { headers: { authorization: `Bearer ${raw}` } }),
      { params: Promise.resolve({ id }) },
    );
    expect(answer.status).toBe(200);
    const { data } = (await answer.json()) as { data: { contract: { source: string; describedBy: string; semver: string } } };
    expect(data.contract).toMatchObject({ source: "metadata", describedBy: "upload", semver: "1.0.0" });
  });
});
