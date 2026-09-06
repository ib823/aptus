// @vitest-environment node
/**
 * 2608 WS7 — the guard that keeps the flip from emptying the product.
 *
 * Catalogue reads are scoped to the active release and do NOT fall back, so
 * selecting a release with no rows serves an empty scope picker with a 200.
 * These pin the only three answers the guard is allowed to give.
 */
import { describe, expect, it } from "vitest";

import { classifyReleaseLanding } from "../../../scripts/assert-content-release-landed";

const some = { ScopeItem: 822, ProcessStep: 19158, ConfigActivity: 4328 };
const none = { ScopeItem: 0, ProcessStep: 0, ConfigActivity: 0 };

describe("classifyReleaseLanding", () => {
  it("passes when the selected release has content", () => {
    expect(classifyReleaseLanding(some, [{ release: "2602", counts: none }])).toEqual({ kind: "landed" });
  });

  it("refuses when the selected release is empty but another release is populated", () => {
    // The production case this was written for: 2608 selected, every row still 2602.
    const v = classifyReleaseLanding(none, [{ release: "2602", counts: { ScopeItem: 853, ProcessStep: 129481, ConfigActivity: 4210 } }]);
    expect(v.kind).toBe("not-landed");
    if (v.kind === "not-landed") expect(v.populated.map((p) => p.release)).toEqual(["2602"]);
  });

  it("passes on an unseeded database — nothing to lose, nothing to compare against", () => {
    // A fresh environment, a preview branch or CI before the seed must still build.
    expect(classifyReleaseLanding(none, [{ release: "2602", counts: none }])).toEqual({ kind: "unseeded" });
    expect(classifyReleaseLanding(none, [])).toEqual({ kind: "unseeded" });
  });

  it("counts a release as landed on any one scoped model, not all three", () => {
    expect(classifyReleaseLanding({ ...none, ScopeItem: 1 }, [])).toEqual({ kind: "landed" });
  });
});
