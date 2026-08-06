/**
 * The deployed API-reference import — the one content source that had no
 * deployed import path.
 *
 * Discover's API tile projects from SapApiReference; until this route, that
 * table was writable only by a laptop holding the production DATABASE_URL, so
 * a deployment whose reference predated product tags could never surface
 * private-edition or SuccessFactors APIs. These tests pin the gates (admin +
 * typed confirmation + pinned-SHA source), the shared-normalizer behavior
 * (editions derived from product tags), and the chunk contract (explicit
 * nextOffset).
 */

import { NextResponse } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  refFindMany: vi.fn(),
  refCreate: vi.fn(),
  refUpdate: vi.fn(),
  logDecision: vi.fn(),
}));

vi.mock("@/lib/auth/admin-guard", () => ({
  requireAdmin: mocks.requireAdmin,
  isAdminError: (r: unknown) => r instanceof NextResponse,
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    sapApiReference: {
      findMany: mocks.refFindMany,
      create: mocks.refCreate,
      update: mocks.refUpdate,
    },
  },
}));
vi.mock("@/lib/audit/decision-logger", () => ({ logDecision: mocks.logDecision }));

import { POST } from "@/app/api/sap/tdd/hub-content/api-reference-import/route";

const SHA = "a".repeat(40);
const CONFIRMATION = "REBUILD SAP HUB CATALOGUE";

function req(body: Record<string, unknown>): Request {
  return new Request("https://x.test/api/sap/tdd/hub-content/api-reference-import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const ENV_KEYS = ["HUB_HARVEST_REPO", "HUB_HARVEST_REF", "VERCEL_GIT_REPO_OWNER", "VERCEL_GIT_REPO_SLUG", "VERCEL_GIT_COMMIT_SHA"] as const;
const envBefore: Record<string, string | undefined> = {};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAdmin.mockResolvedValue({ user: { email: "admin@t.io", role: "platform_admin" } });
  mocks.refFindMany.mockResolvedValue([]);
  mocks.refCreate.mockResolvedValue({});
  mocks.refUpdate.mockResolvedValue({});
  mocks.logDecision.mockResolvedValue(undefined);
  for (const k of ENV_KEYS) envBefore[k] = process.env[k];
  process.env.HUB_HARVEST_REPO = "ib823/aptus";
  process.env.HUB_HARVEST_REF = SHA;
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (envBefore[k] === undefined) delete process.env[k];
    else process.env[k] = envBefore[k];
  }
  vi.unstubAllGlobals();
});

describe("gates, in order", () => {
  it("refuses a non-admin with the guard's own response, before any fetch", async () => {
    mocks.requireAdmin.mockResolvedValue(NextResponse.json({ error: {} }, { status: 403 }));
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const res = await POST(req({ confirmation: CONFIRMATION }) as never);
    expect(res.status).toBe(403);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("demands the exact confirmation phrase", async () => {
    const res = await POST(req({ confirmation: "yes please" }) as never);
    expect(res.status).toBe(400);
  });

  it("refuses without a pinned commit SHA — a branch is a moving target", async () => {
    delete process.env.HUB_HARVEST_REF;
    const res = await POST(req({ confirmation: CONFIRMATION }) as never);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: { state?: string } };
    expect(body.error?.state).toBe("NOT_CONFIGURED");
  });
});

describe("the import itself", () => {
  it("accepts the harvester envelope, derives editions from product tags, upserts by apiId", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            _provenance: { harvestedAt: "2026-07-31" },
            apis: [
              { apiId: "API_PUB", title: "Public API", product: "SAP S/4HANA Cloud", status: "Released" },
              { apiId: "API_PRIV", title: "Private API", product: "SAP S/4HANA Cloud Private Edition", status: "Released" },
              { apiId: "API_SF", title: "SF API", product: "SAP SuccessFactors", status: "Released" },
              { notAnApi: true },
            ],
          }),
          { status: 200 },
        ),
      ),
    );
    // API_PRIV already exists → update; the others are created.
    mocks.refFindMany.mockResolvedValue([{ id: "row-priv", apiId: "API_PRIV" }]);

    const res = await POST(req({ confirmation: CONFIRMATION }) as never);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: {
        inserted: number;
        updated: number;
        skipped: number;
        nextOffset: number | null;
        complete: boolean;
        editions: { public: number; private: number; untagged: number };
      };
    };

    expect(body.data).toMatchObject({ inserted: 2, updated: 1, skipped: 1, nextOffset: null, complete: true });
    // The shared normalizer's whole point: editions come from the tags.
    expect(body.data.editions.public).toBe(1);
    expect(body.data.editions.private).toBe(1);

    const privUpdate = mocks.refUpdate.mock.calls[0]?.[0] as {
      where: { id: string };
      data: { appliesToPrivate: boolean; appliesToPublic: boolean };
    };
    expect(privUpdate.where.id).toBe("row-priv");
    expect(privUpdate.data.appliesToPrivate).toBe(true);
    expect(privUpdate.data.appliesToPublic).toBe(false);

    // The SF row carries its product tag and no edition flag — addressable by
    // tag scope, exactly like SapHubContent rows.
    const sfCreate = mocks.refCreate.mock.calls.map((c) => c[0] as { data: Record<string, unknown> })
      .find((c) => c.data.apiId === "API_SF");
    expect(sfCreate?.data.productTags).toContain("SuccessFactors");
    expect(sfCreate?.data.appliesToPublic).toBe(false);
  });

  it("reports an unfinished file via nextOffset rather than leaving it inferred", async () => {
    const apis = Array.from({ length: 5 }, (_, i) => ({ apiId: `API_${i}`, product: "SAP S/4HANA Cloud" }));
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ apis }), { status: 200 })),
    );
    const res = await POST(req({ confirmation: CONFIRMATION, offset: 0, limit: 2 }) as never);
    const body = (await res.json()) as { data: { nextOffset: number | null; complete: boolean; total: number } };
    expect(body.data).toMatchObject({ nextOffset: 2, complete: false, total: 5 });
  });
});
