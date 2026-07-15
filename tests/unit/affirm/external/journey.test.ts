/**
 * Unit tests for the external journey aggregation (getGuestJourney / getGuestSummary).
 * The page-level flow is covered end-to-end by the gated e2e + the curl smoke
 * test in BUILD-LOG; here we pin the grouping/progress/bucket math.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  grantFindUnique: vi.fn(),
  responseFindMany: vi.fn(),
  getAffirmSetForGrant: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    affirmAccessGrant: { findUnique: mocks.grantFindUnique },
    affirmResponse: { findMany: mocks.responseFindMany },
    // unused by these two functions but referenced by the module
    affirmScopeItem: { findUnique: vi.fn() },
    affirmBundleScopeItem: { findUnique: vi.fn() },
  },
}));
vi.mock("@/lib/affirm/external/serializers", () => ({
  getAffirmSetForGrant: mocks.getAffirmSetForGrant,
}));
vi.mock("@/lib/affirm/process-flow", () => ({
  getStreamStories: vi.fn(),
  getChapteredFlow: vi.fn(),
  getProcessFlowForScopeItem: vi.fn(),
}));

import { getGuestJourney, getGuestSummary } from "@/lib/affirm/external/journey";

function q(id: string, streamId: string, streamName: string, sp = "sp1", spName = "SP One") {
  return {
    id,
    streamId,
    streamName,
    subProcessId: sp,
    subProcessName: spName,
    format: "decision" as const,
    displayOrder: 0,
    sapArea: null,
    sapTopic: null,
    sapVerbatim: null,
    plainLanguageSuggested: null,
    consultantWording: null,
    aboutText: null,
    standardMeans: null,
    scopeItemRefs: [],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.grantFindUnique.mockResolvedValue({
    bundleId: "b1",
    displayName: "Exec",
    roleLabel: "CFO",
    valueStreamIds: [],
  });
  mocks.getAffirmSetForGrant.mockResolvedValue({
    bundle: { client: "Acme", state: "issued" },
    questions: [
      q("L2-1", "lead-to-cash", "Lead to Cash", "sp-a", "Order"),
      q("L2-2", "lead-to-cash", "Lead to Cash", "sp-b", "Bill"),
      q("L2-3", "source-to-pay", "Source to Pay", "sp-c", "Buy"),
    ],
    scopeItems: [],
    flows: {},
  });
});

describe("getGuestJourney", () => {
  it("groups questions by stream with per-stream sub-processes and progress", async () => {
    mocks.responseFindMany.mockResolvedValue([{ questionId: "L2-1", choice: "standard" }]);
    const j = await getGuestJourney("g1");
    expect(j).not.toBeNull();
    expect(j!.streams).toHaveLength(2);
    const l2c = j!.streams.find((s) => s.streamId === "lead-to-cash")!;
    expect(l2c.total).toBe(2);
    expect(l2c.answered).toBe(1);
    expect(l2c.subProcesses.map((s) => s.id).sort()).toEqual(["sp-a", "sp-b"]);
    expect(j!.totals).toEqual({ total: 3, answered: 1 });
    expect(j!.grant).toEqual({ displayName: "Exec", roleLabel: "CFO" });
  });

  it("returns null for an unknown grant", async () => {
    mocks.grantFindUnique.mockResolvedValue(null);
    expect(await getGuestJourney("nope")).toBeNull();
  });
});

describe("getGuestSummary", () => {
  it("tallies the standard/discuss/deviate buckets over answered questions", async () => {
    mocks.responseFindMany.mockResolvedValue([
      { questionId: "L2-1", choice: "standard" },
      { questionId: "L2-2", choice: "deviate" },
      { questionId: "L2-3", choice: "discuss" },
    ]);
    const s = await getGuestSummary("g1");
    expect(s!.buckets).toEqual({ standard: 1, discuss: 1, deviate: 1 });
    expect(s!.answered).toBe(3);
    expect(s!.total).toBe(3);
  });
});
