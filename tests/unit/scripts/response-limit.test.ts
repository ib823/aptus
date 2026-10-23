// @vitest-environment node
/**
 * The search behind scripts/measure-response-limit.ts (P1.4, 3.10.2): the
 * smallest body the platform refuses, to one byte, and an honest answer when
 * the window it was given does not contain the threshold.
 */

import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));

import { MAX_READ_BODY_BYTES } from "@/lib/northbound/read";
import { LEGACY_RESPONSE_CAP } from "@/lib/northbound/query/page";

import { CAP_MARGIN_BYTES, capAdvice, findThreshold, recommendedCap, SEARCH_WINDOW } from "../../../scripts/lib/response-limit";

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

/*
 * A platform that streams function responses has no 4.5 MB limit (Vercel's
 * knowledge base). The search window reached only 5,500,000 bytes, so on such
 * a platform the run said "the limit is above the window" and failed, and
 * nothing told the operator that the 4.5 MiB cap refuses ?limit answers the
 * platform serves.
 */
describe("a platform that serves every legacy answer", () => {
  it("is searched above anything a ?limit read can produce, from below where the cap starts", () => {
    expect(SEARCH_WINDOW.high).toBeGreaterThan(MAX_READ_BODY_BYTES);
    expect(LEGACY_RESPONSE_CAP).toBeGreaterThan(SEARCH_WINDOW.low);
  });

  it("is told to set no guard; a measured limit, the cap below it; a window refused at its bottom, nothing", async () => {
    const streams = await findThreshold(async () => true, SEARCH_WINDOW.low, SEARCH_WINDOW.high);
    expect(capAdvice(streams)).toEqual({ kind: "no-guard" });
    const limited = await findThreshold(async (n) => n < 4_500_000, SEARCH_WINDOW.low, SEARCH_WINDOW.high);
    expect(capAdvice(limited)).toEqual({ kind: "cap", cap: 4_499_999 - CAP_MARGIN_BYTES });
    expect(capAdvice(await findThreshold(async () => false, SEARCH_WINDOW.low, SEARCH_WINDOW.high))).toEqual({ kind: "widen" });
  });
});
