/**
 * Finding the platform's response limit (P1.4, 3.10.2): the pure part of
 * scripts/measure-response-limit.ts, kept here so it is tested.
 *
 * The question is the smallest body the platform refuses (Vercel's documented
 * "4.5 MB" is either 4,500,000 bytes or 4.5 MiB, and measured before or after
 * compression [unverified]), or whether it refuses any at all: Vercel says a
 * streamed function response has no such limit. A probe asks for one body size and says whether
 * it was served; the search assumes a single threshold (every size below it
 * served, every size at or above it refused) and checks the bounds it is given
 * first, so a probe that never refuses, or always does, is reported rather
 * than bisected into a wrong number.
 */

/** Whether a body of `bytes` bytes was served (true) or refused by the platform (false). */
export type Probe = (bytes: number) => Promise<boolean>;

export type Threshold =
  | {
      readonly ok: true;
      /** The largest size served. */
      readonly largestServed: number;
      /** The smallest size refused: largestServed + 1, to the search's resolution. */
      readonly smallestRefused: number;
      readonly probes: number;
    }
  | { readonly ok: false; readonly reason: "LOW_BOUND_REFUSED" | "HIGH_BOUND_SERVED"; readonly probes: number };

/**
 * The threshold between `low` (expected served) and `high` (expected refused),
 * by bisection to one byte. About log2(high - low) probes: some twenty for a
 * megabyte's window.
 */
export async function findThreshold(probe: Probe, low: number, high: number): Promise<Threshold> {
  if (!(Number.isInteger(low) && Number.isInteger(high) && low >= 1 && high > low)) {
    throw new RangeError("findThreshold needs integers 1 <= low < high.");
  }
  let probes = 0;
  const ask = async (n: number) => {
    probes += 1;
    return probe(n);
  };
  if (!(await ask(low))) return { ok: false, reason: "LOW_BOUND_REFUSED", probes };
  if (await ask(high)) return { ok: false, reason: "HIGH_BOUND_SERVED", probes };
  let served = low;
  let refused = high;
  while (refused - served > 1) {
    const mid = served + Math.floor((refused - served) / 2);
    if (await ask(mid)) served = mid;
    else refused = mid;
  }
  return { ok: true, largestServed: served, smallestRefused: refused, probes };
}

/** What LEGACY_RESPONSE_CAP becomes after a measurement: the largest body served, less a 16 KiB margin. */
export const CAP_MARGIN_BYTES = 16 * 1024;

export function recommendedCap(largestServed: number): number {
  return largestServed - CAP_MARGIN_BYTES;
}

/**
 * The window the measurement searches. Its top is above the largest body a
 * `?limit` read can produce (SAP's answer is read to 16 MiB, then stripped;
 * a megabyte more for the envelope and re-escaping), so a platform that
 * serves the top refuses no legacy answer at all: a streamed function
 * response has no 4.5 MB limit [Vercel's knowledge base, not measured here].
 */
export const SEARCH_WINDOW = { low: 4_000_000, high: 17 * 1024 * 1024 } as const;

/**
 * What a run on the incompressible body says to do with LEGACY_RESPONSE_CAP:
 *   cap       set it to the largest body served less the margin;
 *   no-guard  the window's top was served, so any cap below it would refuse
 *             an answer the platform serves: set it to Infinity;
 *   widen     even the window's bottom was refused: nothing to recommend.
 */
export type CapAdvice = { readonly kind: "cap"; readonly cap: number } | { readonly kind: "no-guard" } | { readonly kind: "widen" };

export function capAdvice(t: Threshold): CapAdvice {
  if (t.ok) return { kind: "cap", cap: recommendedCap(t.largestServed) };
  return t.reason === "HIGH_BOUND_SERVED" ? { kind: "no-guard" } : { kind: "widen" };
}
