/**
 * Unit tests for the external journey aggregation (getGuestJourney / getGuestSummary).
 * Page-level flow is covered by the gated e2e + the curl smoke test; here we pin
 * the ribbon grouping/progress/process-node math and the summary buckets.
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

function q(id: string, streamId: string, streamName: string, refs: string[] = []) {
  return {
    id,
    streamId,
    streamName,
    subProcessId: "sp1",
    subProcessName: "SP One",
    format: "decision" as const,
    displayOrder: 0,
    sapArea: null,
    sapTopic: null,
    sapVerbatim: null,
    plainLanguageSuggested: null,
    consultantWording: `wording ${id}`,
    aboutText: null,
    standardMeans: null,
    scopeItemRefs: refs,
  };
}
function item(id: string, streamId: string) {
  return { id, description: `desc ${id}`, streamId, subProcessId: "sp1" };
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
      q("L2-1", "lead-to-cash", "Lead to Cash", ["BD9"]),
      q("L2-2", "lead-to-cash", "Lead to Cash", ["BD9"]),
      q("L2-3", "source-to-pay", "Source to Pay", ["J45"]),
    ],
    scopeItems: [item("BD9", "lead-to-cash"), item("J45", "source-to-pay")],
    flows: {},
  });
});

describe("getGuestJourney", () => {
  it("groups by stream with progress, process affirmation, and ribbon nodes", async () => {
    // BD9 fully answered (both its questions), J45 not answered.
    mocks.responseFindMany.mockResolvedValue([
      { questionId: "L2-1", choice: "standard" },
      { questionId: "L2-2", choice: "deviate" },
    ]);
    const j = await getGuestJourney("g1");
    expect(j).not.toBeNull();
    const l2c = j!.streams.find((s) => s.streamId === "lead-to-cash")!;
    expect(l2c.total).toBe(2);
    expect(l2c.answered).toBe(2);
    expect(l2c.processesAffirmed).toBe(1);
    expect(l2c.processesTotal).toBe(1);
    expect(l2c.status).toBe("complete");
    expect(l2c.nodes).toEqual([{ scopeItemId: "BD9", state: "done" }]);

    const s2p = j!.streams.find((s) => s.streamId === "source-to-pay")!;
    expect(s2p.status).toBe("not-started");
    expect(s2p.nodes).toEqual([{ scopeItemId: "J45", state: "none" }]);

    expect(j!.totals).toEqual({ total: 3, answered: 2 });
  });

  it("returns null for an unknown grant", async () => {
    mocks.grantFindUnique.mockResolvedValue(null);
    expect(await getGuestJourney("nope")).toBeNull();
  });
});

describe("getGuestSummary", () => {
  it("groups answered questions into standard/discuss/deviate buckets with counts", async () => {
    mocks.responseFindMany.mockResolvedValue([
      { questionId: "L2-1", choice: "standard", reason: null },
      { questionId: "L2-2", choice: "deviate", reason: "we differ here" },
      { questionId: "L2-3", choice: "discuss", reason: null },
    ]);
    const s = await getGuestSummary("g1");
    expect(s!.counts).toEqual({ standard: 1, discuss: 1, deviate: 1 });
    expect(s!.answered).toBe(3);
    expect(s!.total).toBe(3);
    expect(s!.buckets.deviate[0]!.reason).toBe("we differ here");
    expect(s!.buckets.deviate[0]!.scopeItemId).toBe("BD9");
  });
});
