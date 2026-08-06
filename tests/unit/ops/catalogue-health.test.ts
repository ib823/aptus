/**
 * Catalogue health — the deployment-scoped freshness panel FRESHNESS-RESPEC.md
 * called for, after refusing the org-scoped version.
 *
 * Two properties matter most, and both fail silently if lost:
 *
 * 1. THE GATE IS platform_admin, NOT support. The catalogue is one table for
 *    the whole deployment; behind the tenant-scoped guard this would be the
 *    third time its scope was confused for a tenant's.
 * 2. THE VERDICT IS TRACEABLE. "Stale" must mean exactly "newest row write
 *    older than CATALOGUE_STALE_AFTER_DAYS", and an empty type must render as
 *    its own state — an absence of an import is not a stale import.
 */

import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  CATALOGUE_STALE_AFTER_DAYS,
  catalogueFreshness,
} from "@/lib/sap-public/catalogue-health";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  hubGroupBy: vi.fn(),
  hubFindFirst: vi.fn(),
  cronFindFirst: vi.fn(),
  fallbackTenants: vi.fn(),
}));

vi.mock("@/lib/auth/admin-guard", () => ({
  requireAdmin: mocks.requireAdmin,
  isAdminError: (r: unknown) => r instanceof NextResponse,
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    sapHubContent: { groupBy: mocks.hubGroupBy, findFirst: mocks.hubFindFirst },
    cronRunLog: { findFirst: mocks.cronFindFirst },
  },
}));
vi.mock("@/lib/studio/tenants", () => ({
  deploymentFallbackTenants: mocks.fallbackTenants,
}));

import { GET } from "@/app/api/ops/catalogue-health/route";

const DAY = 24 * 60 * 60 * 1000;

describe("catalogueFreshness — the verdict is a threshold, not a feeling", () => {
  const now = new Date("2026-08-06T00:00:00Z");

  it("judges by the named constant, exactly at the boundary", () => {
    const inside = new Date(now.getTime() - (CATALOGUE_STALE_AFTER_DAYS - 1) * DAY);
    const outside = new Date(now.getTime() - (CATALOGUE_STALE_AFTER_DAYS + 1) * DAY);
    expect(catalogueFreshness(inside, now)).toBe("CURRENT");
    expect(catalogueFreshness(outside, now)).toBe("STALE");
  });

  it("renders no-rows as its own state, never as stale", () => {
    // An empty catalogue is not an old one; conflating them would tell an
    // admin to refresh something that was never imported.
    expect(catalogueFreshness(null, now)).toBe("NEVER_IMPORTED");
  });
});

describe("GET /api/ops/catalogue-health", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hubGroupBy.mockResolvedValue([]);
    mocks.hubFindFirst.mockResolvedValue(null);
    mocks.cronFindFirst.mockResolvedValue(null);
    mocks.fallbackTenants.mockReturnValue([]);
  });

  it("refuses a non-admin with the guard's own response, before any query", async () => {
    mocks.requireAdmin.mockResolvedValue(
      NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 }),
    );
    const res = await GET();
    expect(res.status).toBe(403);
    expect(mocks.hubGroupBy).not.toHaveBeenCalled();
  });

  it("reports every content type, including ones with no rows, and prints the constant", async () => {
    mocks.requireAdmin.mockResolvedValue({ user: { email: "a@b.c", role: "platform_admin" } });
    const newest = new Date("2026-08-01T00:00:00Z");
    mocks.hubGroupBy.mockImplementation((args: { where?: unknown }) =>
      Promise.resolve(
        args.where
          ? [] // the illustrative-rows grouping
          : [
              {
                contentType: "API",
                _count: { _all: 862 },
                _min: { updatedAt: new Date("2026-07-31T00:00:00Z") },
                _max: { updatedAt: newest },
                _sum: { itemCount: null },
              },
            ],
      ),
    );

    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: {
        stalenessDays: number;
        types: { contentType: string; loadedRows: number; freshness: string }[];
      };
    };

    expect(body.data.stalenessDays).toBe(CATALOGUE_STALE_AFTER_DAYS);

    const api = body.data.types.find((t) => t.contentType === "API");
    expect(api?.loadedRows).toBe(862);

    // A type with no rows still appears, as NEVER_IMPORTED — silence about a
    // missing type is exactly the "silently stale" this screen exists to end.
    const badi = body.data.types.find((t) => t.contentType === "BADI");
    expect(badi?.loadedRows).toBe(0);
    expect(badi?.freshness).toBe("NEVER_IMPORTED");
  });
});
