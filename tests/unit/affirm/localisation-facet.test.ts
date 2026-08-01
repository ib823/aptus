/**
 * A question that says it is country-specific must SAY SO in its facet.
 *
 * A Malaysia-scoped bundle — company codes 5410/5430, MYR, step lists headed
 * "Mandatory Malaysia process steps" — asked the client to affirm L2-115
 * ("This is CZ specific requirement", Czech MT940 mapping) and L2-113/L2-114
 * ("Localized for AT"). There was no country facet, so nothing could filter
 * them out and nothing could notice they were wrong.
 *
 * This reads the shipped dataset and fails when a question's TEXT names a
 * country its `countryScope` does not. That is the part that has to be
 * automatic: the facet is cheap to add and easy to forget, and the failure mode
 * is silent — a client affirms a foreign localisation decision in a signed
 * record and nobody finds out until the workshop.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

interface SeedQuestion {
  id: string;
  sapVerbatim: string | null;
  plainLanguageSuggested: string | null;
  consultantWording: string | null;
  aboutText?: string | null;
  statusNote?: string | null;
  sscuiRef: string | null;
  countryScope?: string[];
  industryScope?: string[];
}

const dataset = JSON.parse(
  readFileSync(
    path.resolve(process.cwd(), "prisma/seeds/value-stream/dataset.json"),
    "utf8",
  ),
) as { questions: SeedQuestion[] };

const QUESTIONS = dataset.questions;

/** Text a consultant or client can actually read. */
function textOf(q: SeedQuestion): string {
  return [
    q.sapVerbatim,
    q.plainLanguageSuggested,
    q.consultantWording,
    q.aboutText,
    q.statusNote,
    q.sscuiRef,
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * Phrases that ASSERT a country binding, with the country they name.
 *
 * Deliberately narrow. "Malaysia" appearing in a step description is not a
 * claim that the question is Malaysia-only; "Localized for AT" is.
 */
const CLAIMS: Array<{ pattern: RegExp; country: (m: RegExpMatchArray) => string }> = [
  { pattern: /\bLocali[sz]ed for ([A-Z]{2})\b/, country: (m) => m[1]!.toUpperCase() },
  { pattern: /\bThis is ([A-Z]{2}) specific\b/, country: (m) => m[1]!.toUpperCase() },
  { pattern: /\b([A-Z]{2})[- ]specific requirement\b/, country: (m) => m[1]!.toUpperCase() },
  // D.G.I. is the Uruguayan tax authority. It appears on a question whose own
  // aboutText claims Austria, which is why the phrase is matched directly.
  { pattern: /\bD\.?G\.?I\.?\b/, country: () => "UY" },
];

function claimedCountries(q: SeedQuestion): string[] {
  const text = textOf(q);
  const found = new Set<string>();
  for (const { pattern, country } of CLAIMS) {
    const m = text.match(pattern);
    if (m) found.add(country(m));
  }
  return [...found].sort();
}

describe("the localisation facet exists on every question", () => {
  it("every question carries countryScope and industryScope arrays", () => {
    const missing = QUESTIONS.filter(
      (q) => !Array.isArray(q.countryScope) || !Array.isArray(q.industryScope),
    ).map((q) => q.id);
    expect(missing, "questions missing the facet fields").toEqual([]);
  });

  it("uses country codes, not names", () => {
    const bad = QUESTIONS.flatMap((q) =>
      (q.countryScope ?? [])
        .filter((c) => !/^[A-Z]{2}$/.test(c))
        .map((c) => `${q.id}: ${c}`),
    );
    expect(bad, "countryScope must hold ISO-3166-1 alpha-2 codes").toEqual([]);
  });
});

describe("a question that claims a country is scoped to it", () => {
  it("no question names a country its facet omits", () => {
    /*
     * THE ACTUAL GUARD. If this fails, a question's own words say it belongs to
     * one country while its facet lets it reach every other — which is the
     * defect that put Czech, Austrian and Uruguayan questions into a Malaysian
     * signed record.
     */
    const offenders = QUESTIONS.flatMap((q) => {
      const claimed = claimedCountries(q);
      if (claimed.length === 0) return [];
      const scope = q.countryScope ?? [];
      const unscoped = claimed.filter((c) => !scope.includes(c));
      if (unscoped.length === 0) return [];
      return [
        `${q.id} says ${claimed.join("/")} but countryScope is ` +
          `[${scope.join(", ") || "empty = universal"}]`,
      ];
    });

    expect(
      offenders,
      "Tag these in prisma/seeds/value-stream/dataset.json — a question that\n" +
        "names a country must not reach bundles for other countries:\n" +
        offenders.join("\n"),
    ).toEqual([]);
  });

  it("still finds the three known localisation-bound questions", () => {
    // A detector that stops detecting is worse than none. If the phrasing in
    // the dataset changes, this fails and someone re-checks the patterns
    // rather than the guard above silently passing on an empty set.
    const detected = QUESTIONS.filter((q) => claimedCountries(q).length > 0).map((q) => q.id);
    expect(detected.sort()).toEqual(["L2-113", "L2-114", "L2-115"]);
  });

  it("keeps L2-114 scoped to both countries its text disagrees about", () => {
    // Its aboutText says Austria; its SSCUI is the Uruguayan D.G.I. mapping.
    // Scoped to both so it stops leaking everywhere while a human resolves it.
    const q = QUESTIONS.find((x) => x.id === "L2-114");
    expect(q?.countryScope?.sort()).toEqual(["AT", "UY"]);
  });
});

describe("the facet stays cheap", () => {
  it("only a handful of questions are country-bound", () => {
    /*
     * Empty-means-universal is what makes this a day's work rather than a
     * 150-row curation project. If this number climbs a lot, the model is
     * being used to encode something else and deserves another look.
     */
    const scoped = QUESTIONS.filter((q) => (q.countryScope ?? []).length > 0);
    expect(scoped.length).toBeLessThanOrEqual(10);
    expect(scoped.length).toBeGreaterThan(0);
  });
});
