/**
 * Finding the platform's response limit (P1.4, 3.10.2): the pure part of
 * scripts/measure-response-limit.ts, kept here so it is tested.
 *
 * The question is the smallest body the platform refuses (Vercel's documented
 * "4.5 MB" is either 4,500,000 bytes or 4.5 MiB, and measured before or after
 * compression [unverified]). A probe asks for one body size and says whether
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
