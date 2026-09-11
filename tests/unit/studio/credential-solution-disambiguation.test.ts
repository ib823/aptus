/**
 * Duplicate solution names, and the credential that looked correct anyway.
 *
 * `Solution.name` carries no uniqueness — the schema constrains
 * `@@unique([organizationId, slug])` and nothing else — so one organization
 * legitimately held two solutions called "QA-E2E-Main", separated only by slug
 * (`qa-e2e-main` and `qa-e2e-main-2`). A credential was minted against the empty
 * one. Every surface a human could check showed the name alone: the issue
 * picker, the credentials table, and the stored `<solution> · <environment>`
 * label. The northbound interface list came back `[]` — correct, because that
 * solution has no interfaces — with nothing on screen to say why.
 *
 * These assert the rule that closes it: qualify with the slug exactly when the
 * name does not identify one solution, and nowhere else.
 */
import { describe, expect, it } from "vitest";

import { ambiguousNames, disambiguate } from "@/components/studio/ClientCredentials";

describe("ambiguousNames", () => {
  it("finds nothing when every name is unique", () => {
    expect(ambiguousNames(["Alpha", "Beta", "Gamma"]).size).toBe(0);
  });

  it("flags a name held by two solutions", () => {
    const dupes = ambiguousNames(["QA-E2E-Main", "Other", "QA-E2E-Main"]);
    expect([...dupes]).toEqual(["QA-E2E-Main"]);
  });

  it("flags a name held by three, once", () => {
    expect([...ambiguousNames(["Dup", "Dup", "Dup"])]).toEqual(["Dup"]);
  });

  it("treats names differing only in case as distinct, as the database does", () => {
    expect(ambiguousNames(["Alpha", "alpha"]).size).toBe(0);
  });

  it("handles an empty list", () => {
    expect(ambiguousNames([]).size).toBe(0);
  });
});

describe("disambiguate", () => {
  const ambiguous = new Set(["QA-E2E-Main"]);

  it("leaves an unambiguous name alone — the common case stays clean", () => {
    expect(disambiguate("PO Insights App", "po-insights-app", ambiguous)).toBe("PO Insights App");
  });

  it("qualifies an ambiguous name with its slug", () => {
    expect(disambiguate("QA-E2E-Main", "qa-e2e-main", ambiguous)).toBe("QA-E2E-Main (qa-e2e-main)");
  });

  it("distinguishes the twins from each other", () => {
    const a = disambiguate("QA-E2E-Main", "qa-e2e-main", ambiguous);
    const b = disambiguate("QA-E2E-Main", "qa-e2e-main-2", ambiguous);
    expect(a).not.toBe(b);
  });

  /*
   * A credential outlives its solution row. `solutionSlug` is null then, and the
   * name — already "(unknown solution)" upstream — is all there is. Appending
   * "(null)" would be worse than saying nothing.
   */
  it("falls back to the bare name when no slug is available", () => {
    expect(disambiguate("QA-E2E-Main", null, ambiguous)).toBe("QA-E2E-Main");
  });

  it("does not qualify when nothing is ambiguous", () => {
    expect(disambiguate("QA-E2E-Main", "qa-e2e-main", new Set())).toBe("QA-E2E-Main");
  });
});

describe("the picker and the stored label agree", () => {
  /*
   * The defect was not that any one surface was wrong — it was that the picker,
   * the table and the label each rendered the name independently. Whatever the
   * rule is, all three must reach it the same way, or a credential qualified in
   * one place and bare in another is worse than none of them qualifying.
   */
  it("derives the same text for the option, the table cell and the label", () => {
    const solutions = [
      { name: "QA-E2E-Main", slug: "qa-e2e-main" },
      { name: "QA-E2E-Main", slug: "qa-e2e-main-2" },
      { name: "PO Insights App", slug: "po-insights-app" },
    ];
    const dupes = ambiguousNames(solutions.map((s) => s.name));
    const chosen = solutions[1]!;

    const option = disambiguate(chosen.name, chosen.slug, dupes);
    const tableCell = disambiguate(chosen.name, chosen.slug, dupes);
    const label = `${disambiguate(chosen.name, chosen.slug, dupes)} · TEST`;

    expect(option).toBe("QA-E2E-Main (qa-e2e-main-2)");
    expect(tableCell).toBe(option);
    expect(label).toBe("QA-E2E-Main (qa-e2e-main-2) · TEST");
  });
});
