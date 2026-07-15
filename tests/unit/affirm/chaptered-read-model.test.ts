/**
 * Unit tests for the PR-2 chaptered read model: getChapteredFlow (review gate +
 * step attach) and getStreamStories (review-gated summaries).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  storyFindUnique: vi.fn(),
  chapterFindMany: vi.fn(),
  flowFindUnique: vi.fn(),
  scopeItemFindMany: vi.fn(),
  // getProcessFlowsForBundle path (unused here) needs a bundle finder
  bundleFindUnique: vi.fn(),
  flowFindMany: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    affirmScopeItemStory: { findUnique: mocks.storyFindUnique },
    affirmProcessChapter: { findMany: mocks.chapterFindMany },
    affirmProcessFlow: { findUnique: mocks.flowFindUnique, findMany: mocks.flowFindMany },
    affirmBundleScopeItem: { findMany: mocks.scopeItemFindMany },
    affirmBundle: { findUnique: mocks.bundleFindUnique },
  },
}));

import { getChapteredFlow, getStreamStories } from "@/lib/affirm/process-flow";

const STORY = {
  scopeItemId: "31Q",
  headline: "Take a customer order, ship it, bill it.",
  outcomeBullets: ["a", "b"],
  kpiHints: ["k"],
  integrationNotes: ["n"],
  sourceAttribution: "SAP Best Practices, S/4HANA Cloud Public Edition 2602",
  processNavigatorUrl: null,
  reviewedAt: new Date("2026-07-15T00:00:00Z"),
  reviewedById: "user-1",
};

beforeEach(() => vi.clearAllMocks());

describe("getChapteredFlow review gate", () => {
  it("returns null when there is no story", async () => {
    mocks.storyFindUnique.mockResolvedValue(null);
    expect(await getChapteredFlow("31Q")).toBeNull();
  });

  it("returns null when the story is UNREVIEWED (render gate)", async () => {
    mocks.storyFindUnique.mockResolvedValue({ ...STORY, reviewedAt: null });
    expect(await getChapteredFlow("31Q")).toBeNull();
    // Gate short-circuits before loading chapters.
    expect(mocks.chapterFindMany).not.toHaveBeenCalled();
  });

  it("returns null when reviewed but no chapters", async () => {
    mocks.storyFindUnique.mockResolvedValue(STORY);
    mocks.chapterFindMany.mockResolvedValue([]);
    mocks.flowFindUnique.mockResolvedValue({ steps: [] });
    expect(await getChapteredFlow("31Q")).toBeNull();
  });

  it("attaches the correct SAP-verbatim steps to each chapter", async () => {
    mocks.storyFindUnique.mockResolvedValue(STORY);
    mocks.chapterFindMany.mockResolvedValue([
      { chapterNumber: 1, title: "Capture", summary: "s", stepStart: 1, stepEnd: 1, roles: [], fioriApps: [], benefitNote: null },
      { chapterNumber: 2, title: "Ship", summary: "s", stepStart: 2, stepEnd: 4, roles: [], fioriApps: [], benefitNote: null },
      { chapterNumber: 3, title: "Bill", summary: "s", stepStart: 5, stepEnd: 5, roles: [], fioriApps: [], benefitNote: null },
    ]);
    mocks.flowFindUnique.mockResolvedValue({
      steps: [1, 2, 3, 4, 5].map((n) => ({ stepNumber: n, activity: `Act ${n}`, fioriApps: [] })),
    });

    const flow = await getChapteredFlow("31Q");
    expect(flow).not.toBeNull();
    expect(flow!.chapters.map((c) => c.steps.map((s) => s.stepNumber))).toEqual([[1], [2, 3, 4], [5]]);
    // Every step is covered exactly once across chapters.
    const covered = flow!.chapters.flatMap((c) => c.steps.map((s) => s.stepNumber));
    expect(covered).toEqual([1, 2, 3, 4, 5]);
    expect(flow!.story.headline).toBe(STORY.headline);
  });
});

describe("getStreamStories", () => {
  it("returns the reviewed story or null (compact card) per scope item", async () => {
    mocks.scopeItemFindMany.mockResolvedValue([
      { scopeItem: { id: "31Q", description: "Kits", story: STORY, _count: { chapters: 3 } } },
      {
        scopeItem: {
          id: "1A8",
          description: "Draft item",
          story: { ...STORY, scopeItemId: "1A8", reviewedAt: null },
          _count: { chapters: 4 },
        },
      },
      { scopeItem: { id: "ZZZ", description: "No story", story: null, _count: { chapters: 0 } } },
    ]);

    const summaries = await getStreamStories("bundle-1", "lead-to-cash");
    expect(summaries).toHaveLength(3);
    expect(summaries[0]!.story?.headline).toBe(STORY.headline);
    expect(summaries[0]!.chapterCount).toBe(3);
    expect(summaries[1]!.story).toBeNull(); // unreviewed → compact card
    expect(summaries[2]!.story).toBeNull(); // no story at all
  });
});
