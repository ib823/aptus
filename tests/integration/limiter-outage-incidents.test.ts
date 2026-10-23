// @vitest-environment node
/**
 * A limiter outage does not raise an incident against SAP, on real PostgreSQL
 * (audit A44, roadmap P0.5).
 *
 * During an Upstash outage the northbound routes refuse with 503
 * LIMITER_UNAVAILABLE and audit a 503 with that failureReason. The
 * upstream-errors incident counts every audited 5xx and tells the operator "a
 * 5xx is the tenant's answer, not the broker's" — so it must leave these rows
 * out, while still counting every real upstream 5xx, which mostly carry a
 * reason of their own or none at all.
 *
 * Run against the database because the exclusion is SQL null semantics: a bare
 * `failureReason: { not: … }` is `"failureReason" <> …`, which is never true
 * for a NULL, and would have silently dropped every reason-less 5xx with it.
 * The throttled incident counts 429 only, so it never sees these rows.
 */
import { randomUUID } from "node:crypto";

import { NextRequest } from "next/server";
import { afterAll, describe, expect, it, vi } from "vitest";

import type * as Guard from "@/lib/ops/guard";

const ORG = `org_limiter_${randomUUID()}`;

vi.mock("@/lib/db/prisma", async () => {
  const { PrismaClient } = await import("@prisma/client");
  const { tenantScopeGuard } = await import("@/lib/db/tenant-guard");
  const base = new PrismaClient({
    datasourceUrl: process.env.TEST_DATABASE_URL ?? "postgresql://unused:unused@localhost:1/unused",
  });
  return { prisma: base.$extends(tenantScopeGuard()) };
});
vi.mock("@/lib/ops/guard", async (importOriginal) => ({
  ...(await importOriginal<typeof Guard>()),
  requireOperations: async () => ({
    ok: true,
    actor: { kind: "scoped", scope: { organizationId: ORG }, organizationId: ORG, userId: "user_ops" },
  }),
}));

import { GET } from "@/app/api/ops/incidents/route";
import { prisma } from "@/lib/db/prisma";

function row(status: number, failureReason: string | null) {
  return {
    organizationId: ORG,
    solutionId: "sol_1",
    interfaceId: "if_1",
    operation: "READ",
    externalId: "API_BUSINESS_PARTNER",
    environment: "PROD",
    status,
    rowCount: null,
    correlationId: randomUUID(),
    clientTokenId: "client_1",
    failureReason,
  };
}

async function incidents() {
  const res = await GET(new NextRequest("http://localhost/api/ops/incidents?hours=1"));
  const body = (await res.json()) as { data: { incidents: Array<{ id: string; observed: number }> } };
  return body.data.incidents;
}

describe.skipIf(!process.env.TEST_DATABASE_URL)("limiter outages and the incident rules", () => {
  afterAll(async () => {
    await prisma.northboundAuditEvent.deleteMany({ where: { organizationId: ORG } });
  });

  it("a wall of LIMITER_UNAVAILABLE 503s raises neither the upstream-errors nor the throttled incident", async () => {
    await prisma.northboundAuditEvent.createMany({
      data: Array.from({ length: 20 }, () => row(503, "LIMITER_UNAVAILABLE")),
    });
    const ids = (await incidents()).map((i) => i.id);
    expect(ids).not.toContain("upstream-errors");
    expect(ids).not.toContain("throttled");
  });

  it("real upstream 5xx are still all counted — those with no reason as well as those with one", async () => {
    await prisma.northboundAuditEvent.createMany({
      data: [row(502, null), row(502, null), row(504, "TIMEOUT"), row(502, "TOKEN_HTTP_503"), row(500, "HTTP_500")],
    });
    const upstream = (await incidents()).find((i) => i.id === "upstream-errors");
    expect(upstream?.observed).toBe(5);
  });

  /*
   * Consolidated review round 2: a /schema read refused by its
   * organisation's bucket names a credential that is under its own limit, so
   * it must not raise "a credential is being rate limited repeatedly".
   */
  it("429s of the organisation's /schema bucket (ORG_SCHEMA_RATE) do not raise throttled; a credential's own 429s still do", async () => {
    await prisma.northboundAuditEvent.createMany({ data: Array.from({ length: 20 }, () => row(429, "ORG_SCHEMA_RATE")) });
    expect((await incidents()).map((i) => i.id)).not.toContain("throttled");
    await prisma.northboundAuditEvent.createMany({ data: Array.from({ length: 10 }, () => row(429, null)) });
    expect((await incidents()).find((i) => i.id === "throttled")?.observed).toBe(10);
  });
});
