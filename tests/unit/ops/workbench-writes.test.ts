// @vitest-environment node
/**
 * GET /api/ops/workbench-writes — where an operator sees the Workbench
 * write-backs (P0.7).
 *
 * What matters, and fails silently if wrong:
 *   - WHO may read it. These rows have no organization, so the tenant-scoped
 *     ops guard cannot scope them; only a platform admin may see them. The real
 *     admin guard runs here — only the session is a stand-in.
 *   - WHAT it never returns: the payload fingerprint or the outcome detail.
 *   - That an event with no outcome is reported, and told apart by age: still
 *     running, or a write nobody will ever know the result of.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  count: vi.fn(),
  findMany: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: { platformAuditEvent: { count: mocks.count, findMany: mocks.findMany } },
}));

import { GET } from "@/app/api/ops/workbench-writes/route";

const user = (role: string, organizationId: string | null) => ({
  id: `u_${role}`,
  email: `${role}@abeam.test`,
  name: role,
  role,
  organizationId,
  organizationMfaPolicy: null,
  mfaEnabled: false,
  mfaVerified: true,
  hasWebAuthn: false,
});

const req = (q = "") => new NextRequest(`https://x.test/api/ops/workbench-writes${q}`);

const NOW = Date.now();
const minutesAgo = (m: number) => new Date(NOW - m * 60 * 1000);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurrentUser.mockResolvedValue(user("platform_admin", null));
  mocks.count.mockResolvedValue(0);
  mocks.findMany.mockResolvedValue([]);
});

describe("who may read the Workbench write-backs", () => {
  it.each([
    ["support", "org_a"],
    ["consultant", "org_a"],
    ["partner_lead", "org_a"],
  ])("refuses %s — these rows are not an organization's to see", async (role, org) => {
    mocks.getCurrentUser.mockResolvedValue(user(role, org));
    const res = await GET(req());
    expect(res.status).toBe(403);
    expect(mocks.findMany).not.toHaveBeenCalled();
    expect(mocks.count).not.toHaveBeenCalled();
  });

  it("refuses an anonymous caller with 401", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    expect((await GET(req())).status).toBe(401);
  });

  it("serves a platform admin with no organization", async () => {
    expect((await GET(req())).status).toBe(200);
  });
});

describe("what the feed says", () => {
  it("never selects the payload fingerprint or the outcome detail", async () => {
    await GET(req());
    const select = mocks.findMany.mock.calls[0]![0].select;
    expect(select).not.toHaveProperty("payloadSha256");
    expect(select).not.toHaveProperty("payloadFields");
    expect(select.result.select).not.toHaveProperty("detail");
  });

  it("names the person and reports the outcome, and an old event with none as UNRESOLVED", async () => {
    const base = {
      action: "SAP_WORKBENCH_WRITE",
      actorUserId: "u_a",
      actorEmail: "admin@abeam.test",
      actorRole: "platform_admin",
      actorOrganizationId: null,
      product: "s4hana",
      tenantKey: "customizing",
      tenantLabel: "Customizing",
      serviceKey: "business-partner",
      entitySet: "A_BusinessPartner",
    };
    mocks.findMany.mockResolvedValue([
      { ...base, id: "e1", at: minutesAgo(1), correlationId: "c1", result: null },
      { ...base, id: "e2", at: minutesAgo(60), correlationId: "c2", result: null },
      {
        ...base,
        id: "e3",
        at: minutesAgo(90),
        correlationId: "c3",
        result: { outcome: "SUCCEEDED", sapStatus: 201, reason: null, durationMs: 90, at: minutesAgo(90) },
      },
    ]);
    const body = await (await GET(req())).json();
    const states = body.data.rows.map((r: { id: string; state: string }) => [r.id, r.state]);
    expect(states).toEqual([
      ["e1", "PENDING"],
      ["e2", "UNRESOLVED"],
      ["e3", "SUCCEEDED"],
    ]);
    expect(body.data.rows[2]).toMatchObject({ actorEmail: "admin@abeam.test", sapStatus: 201 });
    expect(body.data.rows[0]).not.toHaveProperty("result");
    expect(body.data.provenance.outcomes.UNRESOLVED).toMatch(/check SAP/);
  });

  it("counts over the whole window, every outcome present, PENDING split by age", async () => {
    mocks.count.mockImplementation(async ({ where }: { where: Record<string, unknown> }) => {
      const result = where.result as { is: null | { outcome: string } } | undefined;
      if (!result) return 12; // total
      if (result.is === null) {
        // The unresolved count bounds `at` above as well as below.
        return (where.at as { lte?: Date }).lte ? 2 : 3;
      }
      return result.is.outcome === "SUCCEEDED" ? 7 : result.is.outcome === "LEFT_BEHIND" ? 2 : 0;
    });
    const body = await (await GET(req())).json();
    expect(body.data.total).toBe(12);
    expect(body.data.counts).toEqual({
      SUCCEEDED: 7,
      BLOCKED: 0,
      SAP_REFUSED: 0,
      OUTCOME_UNKNOWN: 0,
      LEFT_BEHIND: 2,
      PENDING: 1,
      UNRESOLVED: 2,
    });
    expect(body.data.truncated).toBe(true);
  });
});
