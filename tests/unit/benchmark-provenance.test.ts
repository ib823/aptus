// @vitest-environment node
/**
 * Aptus analytics — benchmark provenance guard.
 *
 * The analytics surfaces compare an assessment against OTHER ABEAM ENGAGEMENTS
 * recorded in Aptus. That is a legitimate and useful comparison set. It is not
 * an industry panel, and it is emphatically not APQC Open Standards
 * Benchmarking, which is a separate subscription product this repository holds
 * no data from.
 *
 * Until 2026-09-14 the product called it "Industry benchmarking" against
 * "industry-peer assessments", and generateInsights() reported deltas against
 * "the industry average". That wording is how a consultant reading this screen
 * ends up writing "industry benchmark" on a client proposal, with no panel
 * behind it if a reviewer asks.
 *
 * Two independent guards, same reasoning as the discovery vendor-term guard:
 * the phrase scan catches hardcoded copy, the unit tests catch a position being
 * computed from a sample that cannot support one.
 */

import { readdirSync, statSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

import { readSource, repoPath } from "../helpers/source-files";
import {
  computeBenchmarkComparison,
  generateInsights,
} from "@/lib/analytics/benchmark-engine";
import { MINIMUM_BENCHMARK_SAMPLE_SIZE } from "@/types/analytics";

/**
 * Every surface that can put an analytics figure in front of a human, plus the
 * types file that now holds the provenance label itself. Directories and single
 * files are both accepted.
 */
const ANALYTICS_ROOTS = [
  "src/lib/analytics",
  "src/components/analytics",
  "src/app/api/analytics",
  "src/app/(portal)/analytics",
  "src/app/(portal)/insights",
  "src/types/analytics.ts",
];

/**
 * Claims about the provenance of the comparison set that the data cannot
 * support. Matched case-insensitively against comment-stripped source.
 *
 * These are multi-word phrases on purpose: `benchmark.industry` and
 * `industry: string` are the schema's own field names and must keep working.
 * It is the claim "industry average" that is false, not the column.
 */
const FORBIDDEN_CLAIMS = [
  "industry benchmark",
  "industry average",
  "industry-peer",
  "industry peer",
  "apqc",
  "open standards benchmarking",
];

/** Strip comments so prose explaining the ban does not trip the ban. */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1")
    .replace(/^\s*\*.*$/gm, "");
}

function walk(dir: string, out: string[]): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx|ts)$/.test(name)) out.push(p);
  }
}

function analyticsSources(): string[] {
  const out: string[] = [];
  for (const root of ANALYTICS_ROOTS) {
    const p = join(process.cwd(), root);
    let isDir = false;
    try {
      isDir = statSync(p).isDirectory();
    } catch {
      continue;
    }
    if (isDir) walk(p, out);
    else out.push(p);
  }
  return out;
}

describe("analytics surfaces never claim an external benchmark panel", () => {
  it("scans a non-empty set of files — the guard is not vacuous", () => {
    expect(analyticsSources().length).toBeGreaterThan(5);
  });

  it("no analytics source claims industry benchmarking or APQC provenance", () => {
    const offenders: string[] = [];
    for (const file of analyticsSources()) {
      const body = stripComments(readSource(file)).toLowerCase();
      const hits = FORBIDDEN_CLAIMS.filter((claim) => body.includes(claim));
      if (hits.length > 0) {
        offenders.push(`${repoPath(file)}: ${hits.join(", ")}`);
      }
    }
    expect(
      offenders,
      `These claim a comparison set the product does not have. The cohort is ` +
        `ABeam's own engagements; say so:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  it("the comment-stripper works, so the guard is not matching its own prose", () => {
    expect(stripComments("const x = 'industry average';")).toContain("industry average");
    expect(stripComments("// never say industry average")).not.toContain("industry average");
    expect(stripComments("/* not an industry benchmark */")).not.toContain("industry benchmark");
    expect(stripComments(" * APQC is a separate product")).not.toContain("APQC");
  });
});

describe("a position is never reported from a sample that cannot support one", () => {
  const distribution = { avgFitRate: 70, p25FitRate: 60, p75FitRate: 80 };

  it("suppresses the comparison below the minimum sample size", () => {
    for (let n = 0; n < MINIMUM_BENCHMARK_SAMPLE_SIZE; n++) {
      expect(
        computeBenchmarkComparison(95, { ...distribution, sampleSize: n }),
        `sample of ${n} must not produce a position`,
      ).toBeNull();
    }
  });

  it("reports a position at and above the minimum sample size", () => {
    const result = computeBenchmarkComparison(95, {
      ...distribution,
      sampleSize: MINIMUM_BENCHMARK_SAMPLE_SIZE,
    });
    expect(result?.fitRatePercentile).toBe("above_average");
  });

  it("suppresses the comparison when the cohort has no quartiles", () => {
    // This is the removed "average plus or minus 5 points" fallback. It used to
    // return above_average here, inventing a distribution from a single mean.
    expect(
      computeBenchmarkComparison(80, {
        avgFitRate: 70,
        p25FitRate: null,
        p75FitRate: null,
        sampleSize: 50,
      }),
    ).toBeNull();
  });

  it("insights say why they are withheld rather than hedging", () => {
    const insights = generateInsights(95, { ...distribution, sampleSize: 2 });
    expect(insights).toHaveLength(1);
    expect(insights[0]).toContain("Not enough comparable engagements");
    expect(insights[0]).toContain(String(MINIMUM_BENCHMARK_SAMPLE_SIZE));
    expect(insights.join(" ")).not.toMatch(/above|below/i);
  });

  it("insights name the comparison set whenever they carry a figure", () => {
    const insights = generateInsights(95, { ...distribution, sampleSize: 12 });
    expect(insights.some((i) => i.includes("comparable ABeam engagements"))).toBe(true);
    expect(insights.some((i) => i.startsWith("Comparison set:"))).toBe(true);
    expect(insights.join(" ")).not.toMatch(/industry average/i);
  });
});
