// @vitest-environment node
/**
 * The search behind scripts/measure-response-limit.ts (P1.4, 3.10.2): the
 * smallest body the platform refuses, to one byte, and an honest answer when
 * the window it was given does not contain the threshold.
 */

import { describe, expect, it } from "vitest";

import { CAP_MARGIN_BYTES, findThreshold, recommendedCap } from "../../../scripts/lib/response-limit";

describe("findThreshold", () => {
  it.each([4_500_000, 4_718_592, 4_000_001, 5_499_999])("finds a limit of %i bytes exactly, in about twenty probes", async (limit) => {
    const asked: number[] = [];
    const t = await findThreshold(async (n) => (asked.push(n), n < limit), 4_000_000, 5_500_000);
    expect(t).toEqual({ ok: true, largestServed: limit - 1, smallestRefused: limit, probes: asked.length });
    expect(asked.length).toBeLessThanOrEqual(23);
  });

  it("says so when the low bound is already refused, or the high bound still served", async () => {
    expect(await findThreshold(async () => false, 4_000_000, 5_500_000)).toEqual({ ok: false, reason: "LOW_BOUND_REFUSED", probes: 1 });
    expect(await findThreshold(async () => true, 4_000_000, 5_500_000)).toEqual({ ok: false, reason: "HIGH_BOUND_SERVED", probes: 2 });
  });

  it("refuses a window that is not one", async () => {
    await expect(findThreshold(async () => true, 10, 10)).rejects.toThrow(RangeError);
  });

  it("recommends the largest body served less 16 KiB", () => {
    expect(CAP_MARGIN_BYTES).toBe(16_384);
    expect(recommendedCap(4_499_999)).toBe(4_483_615);
  });
});
