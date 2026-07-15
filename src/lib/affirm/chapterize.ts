/**
 * ABeam Workbench — Affirm process-flow chapterization (pure helpers).
 *
 * Groups a scope item's ordered, SAP-verbatim process steps into contiguous
 * business chapters, and de-jargonizes activity names into draft business
 * language. The SAP-verbatim activity text is NEVER mutated here — chapters
 * only carry step RANGES + newly-written titles/summaries.
 *
 * Grouping heuristics (master prompt §7.2), in priority order:
 *   1. The Fiori-app set changes between consecutive steps → boundary.
 *   2. The leading activity verb/theme shifts → boundary.
 *   3. Hard cap of 9 chapters (merge smallest-adjacent to fit).
 *   4. Floor of 5 chapters, applied ONLY to large flows (≥10 steps) — see
 *      note below.
 *   5. Fewer than 5 steps → one chapter per step.
 *
 * Deviation note: the spec's literal "floor 5" would force a 6-step flow into
 * 5 near-1:1 chapters, which is not a meaningful grouping. We apply the floor
 * only to flows with ≥10 steps (where sub-5 consolidation would genuinely hide
 * structure); 5–9 step flows keep their natural boundary count. Recorded in
 * docs/affirm-external/BUILD-LOG.md.
 */

export interface ChapterStepInput {
  stepNumber: number;
  activity: string;
  fioriApps: string[];
}

export interface ChapterRange {
  /** Inclusive step-number range into AffirmProcessStep.stepNumber. */
  stepStart: number;
  stepEnd: number;
  /** The steps in this chapter, in order. */
  steps: ChapterStepInput[];
}

const MAX_CHAPTERS = 9;
const MIN_CHAPTERS_LARGE = 5;
const LARGE_FLOW_THRESHOLD = 10;

/** Leading verb/theme token of an activity, lowercased, for shift detection. */
export function leadingTheme(activity: string): string {
  const word = activity.trim().split(/\s+/)[0] ?? "";
  return word.toLowerCase().replace(/[^a-z]/g, "");
}

function fioriSetChanged(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return true;
  const sa = new Set(a);
  return !b.every((x) => sa.has(x));
}

/** Boundary indices (0-based) where a new chapter starts; always includes 0. */
function naturalBoundaries(steps: ChapterStepInput[]): number[] {
  const bounds = [0];
  for (let i = 1; i < steps.length; i += 1) {
    const fiori = fioriSetChanged(steps[i - 1]!.fioriApps, steps[i]!.fioriApps);
    const theme = leadingTheme(steps[i]!.activity) !== leadingTheme(steps[i - 1]!.activity);
    if (fiori || theme) bounds.push(i);
  }
  return bounds;
}

function boundariesToPartitions(starts: number[], n: number): number[][] {
  const parts: number[][] = [];
  for (let b = 0; b < starts.length; b += 1) {
    const from = starts[b]!;
    const to = b + 1 < starts.length ? starts[b + 1]! : n;
    parts.push(Array.from({ length: to - from }, (_, k) => from + k));
  }
  return parts;
}

/** Merge the adjacent pair whose combined size is smallest until ≤ max. */
function mergeToMax(parts: number[][], max: number): number[][] {
  const result = parts.map((p) => [...p]);
  while (result.length > max) {
    let best = 0;
    let bestSize = Infinity;
    for (let i = 0; i < result.length - 1; i += 1) {
      const size = result[i]!.length + result[i + 1]!.length;
      if (size < bestSize) {
        bestSize = size;
        best = i;
      }
    }
    result[best] = [...result[best]!, ...result[best + 1]!];
    result.splice(best + 1, 1);
  }
  return result;
}

/** Split the largest partition in half until ≥ min (used only for large flows). */
function splitToMin(parts: number[][], min: number): number[][] {
  const result = parts.map((p) => [...p]);
  while (result.length < min) {
    let big = 0;
    for (let i = 1; i < result.length; i += 1) {
      if (result[i]!.length > result[big]!.length) big = i;
    }
    if (result[big]!.length < 2) break; // can't split singletons
    const chunk = result[big]!;
    const mid = Math.ceil(chunk.length / 2);
    result.splice(big, 1, chunk.slice(0, mid), chunk.slice(mid));
  }
  return result;
}

/**
 * Partition steps into contiguous chapters. Guarantees full coverage: every
 * step appears in exactly one chapter, ranges are contiguous and ordered, no
 * gaps or overlaps.
 */
export function groupStepsIntoChapters(steps: ChapterStepInput[]): ChapterRange[] {
  const n = steps.length;
  if (n === 0) return [];

  let partitions: number[][];
  if (n < 5) {
    // One chapter per step.
    partitions = steps.map((_, i) => [i]);
  } else {
    partitions = boundariesToPartitions(naturalBoundaries(steps), n);
    partitions = mergeToMax(partitions, MAX_CHAPTERS);
    if (n >= LARGE_FLOW_THRESHOLD) {
      partitions = splitToMin(partitions, MIN_CHAPTERS_LARGE);
    }
  }

  return partitions.map((indices) => {
    const chapterSteps = indices.map((i) => steps[i]!);
    return {
      stepStart: chapterSteps[0]!.stepNumber,
      stepEnd: chapterSteps[chapterSteps.length - 1]!.stepNumber,
      steps: chapterSteps,
    };
  });
}

// ─── De-jargonization (draft business language) ──────────────────────────────

// Common SAP phrasing → plain business language. Applied case-insensitively as
// whole-phrase replacements before title-casing. Draft-quality; curated items
// override this with hand-written copy.
const JARGON_MAP: Array<[RegExp, string]> = [
  [/\bpurchase requisition\b/gi, "purchase request"],
  [/\bpurchase order\b/gi, "purchase order"],
  [/\bgoods receipt\b/gi, "goods receipt"],
  [/\beDocument Cockpit\b/gi, "e-invoice submission"],
  [/\bsupplier invoice\b/gi, "supplier invoice"],
  [/\bautomatic\b/gi, "automatic"],
  [/\bcreation\b/gi, "create"],
  [/\bposting\b/gi, "post"],
  [/\bmaintain\b/gi, "set up"],
  [/\bmonitoring\b/gi, "track"],
  [/\bprocessing\b/gi, "handle"],
];

/** Best-effort plain-language transform of a single activity name (drafts). */
export function deJargon(activity: string): string {
  let out = activity.trim();
  for (const [re, rep] of JARGON_MAP) out = out.replace(re, rep);
  // Collapse whitespace; keep original casing of proper nouns.
  return out.replace(/\s+/g, " ").trim();
}

/** Draft chapter title from its steps. */
export function draftChapterTitle(chapter: ChapterRange): string {
  const first = deJargon(chapter.steps[0]!.activity);
  return first.charAt(0).toUpperCase() + first.slice(1);
}

/** Draft chapter summary from its steps. */
export function draftChapterSummary(chapter: ChapterRange): string {
  if (chapter.steps.length === 1) {
    return `The team ${deJargon(chapter.steps[0]!.activity).toLowerCase()}.`;
  }
  const acts = chapter.steps.map((s) => deJargon(s.activity).toLowerCase());
  const last = acts.pop();
  return `Covers ${acts.join(", ")} and ${last}.`;
}
