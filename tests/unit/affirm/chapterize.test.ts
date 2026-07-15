/**
 * Unit tests for the Affirm chapterization grouping (pure).
 *
 * The load-bearing invariant is RANGE INTEGRITY: chapters partition the steps —
 * every step appears in exactly one chapter, ranges are contiguous and ordered,
 * no gaps, no overlaps — for any step count.
 */

import { describe, expect, it } from "vitest";
import {
  deJargon,
  groupStepsIntoChapters,
  leadingTheme,
  type ChapterStepInput,
} from "@/lib/affirm/chapterize";

function makeSteps(n: number, opts: { varyApps?: boolean; varyTheme?: boolean } = {}): ChapterStepInput[] {
  const verbs = ["Create", "Post", "Manage", "Check", "Run", "Display"];
  return Array.from({ length: n }, (_, i) => ({
    stepNumber: i + 1,
    activity: `${opts.varyTheme ? verbs[i % verbs.length] : "Create"} thing ${i + 1}`,
    fioriApps: opts.varyApps ? [`App${i % 3}`] : [],
  }));
}

function assertPartitions(steps: ChapterStepInput[]) {
  const chapters = groupStepsIntoChapters(steps);
  // Reconstruct covered step numbers in order.
  const covered: number[] = [];
  let prevEnd = 0;
  for (const c of chapters) {
    expect(c.stepStart).toBeLessThanOrEqual(c.stepEnd);
    expect(c.stepStart).toBe(prevEnd + 1); // contiguous, no gap/overlap
    for (const s of c.steps) covered.push(s.stepNumber);
    prevEnd = c.stepEnd;
  }
  const expected = steps.map((s) => s.stepNumber);
  expect(covered).toEqual(expected); // every step exactly once, in order
  return chapters;
}

describe("groupStepsIntoChapters — range integrity", () => {
  for (const n of [0, 1, 2, 3, 4, 5, 6, 7, 9, 12, 20, 32]) {
    it(`partitions ${n} steps with no gap/overlap (varied apps+themes)`, () => {
      const chapters = assertPartitions(makeSteps(n, { varyApps: true, varyTheme: true }));
      expect(chapters.length).toBeLessThanOrEqual(9); // hard cap
      if (n > 0 && n < 5) expect(chapters.length).toBe(n); // one per step
      if (n >= 10) expect(chapters.length).toBeGreaterThanOrEqual(5); // floor on large flows
    });
  }

  it("caps at 9 chapters even when every step is a boundary", () => {
    const chapters = groupStepsIntoChapters(makeSteps(30, { varyApps: true, varyTheme: true }));
    expect(chapters.length).toBeLessThanOrEqual(9);
    // still full coverage
    const total = chapters.reduce((n, c) => n + c.steps.length, 0);
    expect(total).toBe(30);
  });

  it("returns empty for zero steps", () => {
    expect(groupStepsIntoChapters([])).toEqual([]);
  });

  it("keeps a uniform flow (no boundaries) as few chapters, fully covered", () => {
    const chapters = assertPartitions(makeSteps(8, { varyApps: false, varyTheme: false }));
    expect(chapters.length).toBeGreaterThanOrEqual(1);
  });
});

describe("leadingTheme / deJargon", () => {
  it("leadingTheme extracts the first verb, normalized", () => {
    expect(leadingTheme("Create Sales Order")).toBe("create");
    expect(leadingTheme("  Post Goods Issue")).toBe("post");
  });
  it("deJargon trims, collapses whitespace, and never empties a real activity", () => {
    const out = deJargon("  Automatic  Purchase  Order  Creation ");
    expect(out).not.toMatch(/^\s|\s$/); // trimmed
    expect(out).not.toMatch(/\s{2,}/); // collapsed
    expect(out.length).toBeGreaterThan(0);
    expect(deJargon("eDocument Cockpit").length).toBeGreaterThan(0);
    // "Creation" is de-jargonized to a plain verb
    expect(deJargon("Order Creation")).toContain("create");
  });
});
