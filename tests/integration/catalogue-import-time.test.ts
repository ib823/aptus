// @vitest-environment node
/**
 * Catalogue Health judges freshness from the IMPORT time, which no probe moves
 * (P0.3, A29) — against real PostgreSQL, through the real route.
 *
 * THE DEFECT. `catalogueFreshness` was handed MAX("updatedAt") on the grounds
 * that "rows are only written by imports". They are not: every capability
 * probe (probe-all, the explorer's own probe) merges its answer into
 * `rawMetadataJson` with `persistStoredProbe`, which stamps "updatedAt". One
 * "Probe all" on any tenant made a catalogue last imported years ago read
 * CURRENT, with the probe time printed as its newest row.
 *
 * Here a row is imported in 2024 and probed today. The route must still say
 * STALE, with 2024 as its newest import.
 *
 * Uses the VPUC type, which no other database test writes, so a row another
 * test inserts concurrently cannot move this type's aggregates. Opt-in on
 * TEST_DATABASE_URL like the other integration tests; rows are namespaced per
 * run and removed afterwards.
 */

import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";
import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/prisma", async () => {
  const { PrismaClient } = await import("@prisma/client");
  return {
    prisma: new PrismaClient({
      datasourceUrl: process.env.TEST_DATABASE_URL ?? "postgresql://unused:unused@localhost:1/unused",
    }),
  };
});
vi.mock("@/lib/auth/admin-guard", () => ({
  requireAdmin: async () => ({ user: { email: "admin@abeam.com", role: "platform_admin" } }),
  isAdminError: (r: unknown) => r instanceof NextResponse,
}));

import { prisma } from "@/lib/db/prisma";
import { GET } from "@/app/api/ops/catalogue-health/route";
import { persistStoredProbe } from "@/lib/sap-public/hub-probe-store";

const RUN = `a29-${randomUUID().slice(0, 8)}`;
const IMPORTED_AT = new Date("2024-03-01T00:00:00.000Z");
const created: string[] = [];

describe.skipIf(!process.env.TEST_DATABASE_URL)("catalogue freshness is the import time, not the last write (A29)", () => {
  afterAll(async () => {
    await prisma.sapHubContent.deleteMany({ where: { id: { in: created } } });
    await prisma.$disconnect();
  });

  it("a probe moves updatedAt and leaves importedAt, so an old catalogue still reads STALE after one", async () => {
    const row = await prisma.sapHubContent.create({
      data: {
        contentType: "VPUC",
        externalId: `${RUN}-vpuc`,
        title: "Validated partner use case",
        description: "",
        status: "Active",
        hubUrl: "https://api.sap.com/vpuc/x",
        // What the importer stamped at the time, and the import time itself.
        rawMetadataJson: { source: "bundled:VPUC", importedAt: IMPORTED_AT.toISOString() },
        importedAt: IMPORTED_AT,
        createdAt: IMPORTED_AT,
        updatedAt: IMPORTED_AT,
      },
      select: { id: true },
    });
    created.push(row.id);

    // Today, someone presses "Probe all".
    await persistStoredProbe(row.id, "org:probe-tenant", {
      http: 200,
      at: new Date().toISOString(),
      read: true,
      write: false,
    });

    const after = await prisma.sapHubContent.findUniqueOrThrow({
      where: { id: row.id },
      select: { updatedAt: true, importedAt: true },
    });
    expect(after.updatedAt.getTime()).toBeGreaterThan(IMPORTED_AT.getTime());
    expect(after.importedAt?.toISOString()).toBe(IMPORTED_AT.toISOString());

    const body = (await (await GET()).json()) as {
      data: {
        types: { contentType: string; freshness: string; newestRowAt: string | null; oldestRowAt: string | null; latestImport: { importedAt: string | null } }[];
        provenance: Record<string, string>;
      };
    };
    const vpuc = body.data.types.find((t) => t.contentType === "VPUC")!;
    expect(vpuc.freshness).toBe("STALE");
    expect(vpuc.newestRowAt).toBe(IMPORTED_AT.toISOString());
    expect(vpuc.oldestRowAt).toBe(IMPORTED_AT.toISOString());
    expect(vpuc.latestImport.importedAt).toBe(IMPORTED_AT.toISOString());
    // The screen says what the verdict is judged from.
    expect(body.data.provenance.stalenessBasis).toMatch(/import/i);
    expect(body.data.provenance.stalenessBasis).not.toMatch(/newest row write/i);
  });
});
