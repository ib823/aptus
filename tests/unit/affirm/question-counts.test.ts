/**
 * The bundle list and the bundle itself must report the SAME number of
 * questions.
 *
 * They did not. The list counted `AffirmBundleQuestion` rows (a per-bundle
 * override table, only populated at issue) while the bundle counted the
 * affirm-set union. One bundle read "6 questions" on the list and "2 of 5
 * answered" one click later. These tests pin the union predicate that
 * `countClientFacingQuestions` now shares with `getAffirmSetForBundle`.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const bundleFindMany = vi.fn();
  const questionFindMany = vi.fn();
  return {
    bundleFindMany,
    questionFindMany,
    prismaMock: {
      affirmBundle: { findMany: bundleFindMany },
      affirmQuestion: { findMany: questionFindMany },
    },
  };
});

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prismaMock }));

import { countClientFacingQuestions } from "@/lib/affirm/queries";

/** A bundle scoped to one scope item on stream S1, with no override rows. */
function bundle(overrides: Record<string, unknown> = {}) {
  return {
    id: "b1",
    scopeItems: [{ scopeItemId: "J60", scopeItem: { streamId: "S1" } }],
    questions: [],
    ...overrides,
  };
}

function question(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    streamId: "S1",
    scopeItemRefs: ["J60"],
    status: "suggested",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("countClientFacingQuestions", () => {
  it("returns an empty map without querying when given no bundles", async () => {
    const counts = await countClientFacingQuestions([]);
    expect(counts.size).toBe(0);
    expect(mocks.bundleFindMany).not.toHaveBeenCalled();
  });

  it("counts questions matched by scope-item ref", async () => {
    mocks.bundleFindMany.mockResolvedValue([bundle()]);
    mocks.questionFindMany.mockResolvedValue([
      question("L2-1"),
      question("L2-2"),
      question("L2-3", { scopeItemRefs: ["J59"] }), // different scope item
    ]);

    const counts = await countClientFacingQuestions(["b1"]);
    expect(counts.get("b1")).toBe(2);
  });

  it("includes stream-level questions that carry no scope-item refs", async () => {
    // 71 of 150 questions ship with empty refs and are unioned in by stream.
    mocks.bundleFindMany.mockResolvedValue([bundle()]);
    mocks.questionFindMany.mockResolvedValue([
      question("L2-1"),
      question("L2-2", { scopeItemRefs: [] }),
      question("L2-3", { scopeItemRefs: [], streamId: "S9" }), // other stream
    ]);

    const counts = await countClientFacingQuestions(["b1"]);
    expect(counts.get("b1")).toBe(2);
  });

  it("excludes questions whose status is excluded", async () => {
    mocks.bundleFindMany.mockResolvedValue([bundle()]);
    mocks.questionFindMany.mockResolvedValue([
      question("L2-1"),
      question("L2-2", { status: "excluded" }),
    ]);

    const counts = await countClientFacingQuestions(["b1"]);
    expect(counts.get("b1")).toBe(1);
  });

  it("honours a per-bundle override row that disables a question", async () => {
    mocks.bundleFindMany.mockResolvedValue([
      bundle({ questions: [{ questionId: "L2-2", enabled: false }] }),
    ]);
    mocks.questionFindMany.mockResolvedValue([question("L2-1"), question("L2-2")]);

    const counts = await countClientFacingQuestions(["b1"]);
    expect(counts.get("b1")).toBe(1);
  });

  it("never counts an excluded question back in via an enabled override", async () => {
    // Matches getAffirmSetForBundle's belt-and-braces forClient filter: a stale
    // join row must not resurrect a question SAP marked excluded.
    mocks.bundleFindMany.mockResolvedValue([
      bundle({ questions: [{ questionId: "L2-2", enabled: true }] }),
    ]);
    mocks.questionFindMany.mockResolvedValue([
      question("L2-1"),
      question("L2-2", { status: "excluded" }),
    ]);

    const counts = await countClientFacingQuestions(["b1"]);
    expect(counts.get("b1")).toBe(1);
  });

  it("counts a snapshot question that is out of the current scope", async () => {
    // Post-issue, the override row is what keeps a question in the bundle even
    // if the consultant later narrows scope.
    mocks.bundleFindMany.mockResolvedValue([
      bundle({ questions: [{ questionId: "L2-9", enabled: true }] }),
    ]);
    mocks.questionFindMany.mockResolvedValue([
      question("L2-1"),
      question("L2-9", { scopeItemRefs: ["J45"], streamId: "S7" }),
    ]);

    const counts = await countClientFacingQuestions(["b1"]);
    expect(counts.get("b1")).toBe(2);
  });

  it("reports zero for a bundle with no scope and no overrides", async () => {
    mocks.bundleFindMany.mockResolvedValue([bundle({ scopeItems: [], questions: [] })]);
    mocks.questionFindMany.mockResolvedValue([question("L2-1")]);

    const counts = await countClientFacingQuestions(["b1"]);
    expect(counts.get("b1")).toBe(0);
  });

  it("counts each bundle independently and defaults a missing bundle to zero", async () => {
    mocks.bundleFindMany.mockResolvedValue([
      bundle(),
      bundle({ id: "b2", scopeItems: [{ scopeItemId: "J59", scopeItem: { streamId: "S1" } }] }),
    ]);
    mocks.questionFindMany.mockResolvedValue([
      question("L2-1"),
      question("L2-2", { scopeItemRefs: ["J59"] }),
      question("L2-3", { scopeItemRefs: ["J59"] }),
    ]);

    const counts = await countClientFacingQuestions(["b1", "b2", "b3-deleted"]);
    expect(counts.get("b1")).toBe(1);
    expect(counts.get("b2")).toBe(2);
    expect(counts.get("b3-deleted")).toBe(0);
  });
});
