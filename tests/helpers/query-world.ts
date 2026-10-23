/**
 * A tenant serving the query surface, seeded in real PostgreSQL, for the P1.4
 * integration suites: an organisation, a DEV connection to the paging-orders
 * service on a CANARY host (a name that must never appear in anything
 * CoreEdge sends back), and an app with a READ interface on the V2 service
 * and one on the V4 service, approved grants bound to each, and a runtime key.
 *
 * Each interface's query policy is made the way the product makes it: the
 * builder's source on the row, then a verify of the service's description
 * (tests/fixtures/odata/paging-orders.v2.xml and .v4.xml, written for this
 * repository) through the record job and recordVerifiedContract, which writes
 * the basis and compiles the policy in its transaction.
 *
 * The importing suite mocks `@/lib/db/prisma` with a real client carrying the
 * tenant guard, and sets SAP_CONNECTION_ENCRYPTION_KEY before seeding.
 */

import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import type { Prisma } from "@prisma/client";

import { recordJob } from "@/lib/contracts/jobs";
import { recordVerifiedContract } from "@/lib/contracts/record";
import { loadRecordHeads } from "@/lib/contracts/snapshot";
import { prisma } from "@/lib/db/prisma";
import { hashClientToken } from "@/lib/northbound/auth";
import type { QueryPolicySourceV1 } from "@/lib/odata/policy";
import { upsertSapConnection } from "@/lib/sap-public/connection-resolver";
import { customExternalId } from "@/lib/sap-public/service-path";
import { tenantScopeOf } from "@/lib/studio/tenant-scope";

export const CANARY_HOST = "sap-host-canary-7f3a.example.invalid";
export const CANARY_PORT = "44300";
export const CANARY_ORIGIN = `https://${CANARY_HOST}:${CANARY_PORT}`;
export const ENTITY_SET = "OrderLines";
export const SERVICE_PATH = {
  V2: "/sap/opu/odata/sap/ZPAGING_ORDERS_SRV",
  V4: "/sap/opu/odata4/sap/zpaging_orders/srvd_a2x/sap/zpaging_orders/0001",
} as const;

const FIXTURES = path.resolve(__dirname, "../fixtures/odata");
export const DESCRIPTION = {
  V2: readFileSync(path.join(FIXTURES, "paging-orders.v2.xml"), "utf8"),
  V4: readFileSync(path.join(FIXTURES, "paging-orders.v4.xml"), "utf8"),
} as const;

/** The fields of an order line, as the stub types them (odata-sap-stub.ts). */
export const ORDER_LINE_TYPES = {
  Order: "S",
  Line: "I",
  Customer: "S",
  CompanyCode: "S",
  Status: "S",
  NetAmount: "D",
  CreatedOn: "DATE",
  Note: "S",
} as const;

const DAY = 86_400_000;

export interface QueryApp {
  readonly solutionId: string;
  readonly clientId: string;
  readonly token: string;
  readonly iface: { readonly V2: string; readonly V4: string };
}

export interface QueryWorld {
  readonly organizationId: string;
  readonly userId: string;
  readonly connectionId: string;
}

export async function seedQueryWorld(run: string, baseUrl: string = CANARY_ORIGIN, client: string | null = null): Promise<QueryWorld> {
  const organizationId = `${run}-org`;
  const userId = `${run}-builder`;
  await prisma.organization.create({ data: { id: organizationId, name: `Query ${run}`, type: "client" } });
  await prisma.user.create({ data: { id: userId, email: `${userId}@example.test`, name: userId, role: "consultant", organizationId } });
  await upsertSapConnection({
    organizationId,
    product: "s4hana",
    key: "dev",
    label: "S/4HANA DEV",
    baseUrl,
    authType: "basic",
    secrets: { username: "COMM_USER", password: `pw-${run}` },
    environment: "DEV",
    ...(client === null ? {} : { client }),
  });
  const connection = await prisma.sapConnection.findFirstOrThrow({ where: { organizationId, product: "s4hana", key: "dev" }, select: { id: true } });
  return { organizationId, userId, connectionId: connection.id };
}

/** One app: its two READ interfaces (V2 and V4), a grant bound to each, and a DEV key. */
export async function seedQueryApp(world: QueryWorld, name: string): Promise<QueryApp> {
  const { organizationId, userId } = world;
  const solution = await prisma.solution.create({
    data: {
      organizationId,
      name,
      slug: `${organizationId}-${randomUUID()}`,
      classification: "CLIENT_APP",
      businessProblem: "Reads order lines for the client's portal.",
      dataClass: "INTERNAL",
      status: "ACTIVE",
      technicalOwnerId: userId,
    },
    select: { id: true },
  });
  const iface: Record<"V2" | "V4", string> = { V2: "", V4: "" };
  for (const version of ["V2", "V4"] as const) {
    const externalId = customExternalId(SERVICE_PATH[version]);
    const row = await prisma.interface.create({
      data: {
        organizationId,
        solutionId: solution.id,
        name: `${name} ${version}`,
        sapProduct: "s4hana",
        externalId,
        servicePath: SERVICE_PATH[version],
        odataVersion: version,
        entitySet: ENTITY_SET,
        operation: "READ",
        mode: "READ",
        status: "ACTIVE",
      },
      select: { id: true },
    });
    iface[version] = row.id;
    await prisma.apiAccessGrant.create({
      data: {
        organizationId,
        solutionId: solution.id,
        externalId,
        operation: "READ",
        environment: "DEV",
        justification: "Integration fixture.",
        requestedById: userId,
        decision: "APPROVED",
        decidedById: userId,
        decidedAt: new Date(),
        expiresAt: new Date(Date.now() + 60 * DAY),
        interfaceId: row.id,
        sapProduct: "s4hana",
      },
    });
  }
  const { clientId, token } = await seedQueryKey(world, solution.id, `${name} DEV`);
  return { solutionId: solution.id, clientId, token, iface };
}

/** Another DEV key for the same app. */
export async function seedQueryKey(world: QueryWorld, solutionId: string, label: string): Promise<{ clientId: string; token: string }> {
  const token = `ce_test_${randomBytes(32).toString("base64url")}`;
  const client = await prisma.solutionClient.create({
    data: {
      organizationId: world.organizationId,
      solutionId,
      label,
      tokenHash: hashClientToken(token),
      tokenPrefix: "ce_test_",
      environment: "DEV",
      createdById: world.userId,
      expiresAt: new Date(Date.now() + 30 * DAY),
    },
    select: { id: true },
  });
  return { clientId: client.id, token };
}

/**
 * Turn queries on for one interface as the product does: the builder's
 * source on the row, then a verify of the service, which writes the basis and
 * compiles the policy. Returns the compiled policy's state.
 */
export async function enableQueries(world: QueryWorld, interfaceId: string, version: "V2" | "V4", source: QueryPolicySourceV1): Promise<string> {
  const scope = tenantScopeOf(world.organizationId);
  await prisma.interface.update({
    where: { id: interfaceId, organizationId: world.organizationId },
    data: { queryPolicy: source as unknown as Prisma.InputJsonValue },
  });
  const iface = await prisma.interface.findFirstOrThrow({
    where: { id: interfaceId, organizationId: world.organizationId },
    select: { id: true, version: true, externalId: true, entitySet: true, operation: true, mode: true, odataVersion: true },
  });
  const target = { ...iface, entitySet: iface.entitySet! };
  const heads = await loadRecordHeads(scope, target, "DEV");
  const outcome = await recordVerifiedContract({
    scope,
    iface: target,
    compiled: recordJob({ description: DESCRIPTION[version], entitySet: ENTITY_SET, ...heads }),
    heads,
    environment: "DEV",
    connectionId: world.connectionId,
    actorId: world.userId,
  });
  if (!("queryPolicy" in outcome) || outcome.queryPolicy === null) throw new Error(`no policy was compiled: ${JSON.stringify(outcome)}`);
  return outcome.queryPolicy.state;
}

export async function removeQueryWorld(world: QueryWorld): Promise<void> {
  const where = { organizationId: world.organizationId };
  await prisma.northboundAuditEvent.deleteMany({ where });
  await prisma.contractSnapshot.deleteMany({ where });
  await prisma.organization.delete({ where: { id: world.organizationId } });
  await prisma.user.deleteMany({ where: { id: world.userId } });
}

/**
 * Every form a host could take in text CoreEdge sends: as it is, in upper and
 * lower case, percent-encoded (each character, upper and lower hex), in hex,
 * in base64 and base64url at all three alignments, and with its port.
 */
export function hostForms(host: string = CANARY_HOST, port: string = CANARY_PORT): string[] {
  const forms = new Set<string>();
  const base = [host, `${host}:${port}`];
  for (const b of base) {
    forms.add(b);
    forms.add(b.toUpperCase());
    forms.add(b.toLowerCase());
    forms.add([...b].map((c) => `%${c.charCodeAt(0).toString(16).padStart(2, "0").toUpperCase()}`).join(""));
    forms.add([...b].map((c) => `%${c.charCodeAt(0).toString(16).padStart(2, "0")}`).join(""));
    forms.add(Buffer.from(b).toString("hex"));
    for (let pad = 0; pad < 3; pad++) {
      // The middle of a base64 encoding of the host at each alignment: what
      // any text containing it encodes to, whatever came before.
      const encoded = Buffer.from(`${"x".repeat(pad)}${b}`).toString("base64");
      const middle = encoded.slice(4, -4);
      forms.add(middle);
      forms.add(middle.replace(/\+/g, "-").replace(/\//g, "_"));
    }
  }
  // The punycode form of an ASCII host is the host itself; its labels are checked above.
  forms.add(host.split(".")[0]!);
  return [...forms].filter((f) => f.length >= 8);
}

/** The forms of the host that appear in `text`, or none. */
export function hostIn(text: string, forms: readonly string[] = hostForms()): string[] {
  return forms.filter((f) => text.includes(f));
}
