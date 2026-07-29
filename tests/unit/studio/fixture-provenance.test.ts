/**
 * A recorded fixture says where it came from, or says that it cannot.
 *
 * THE DEFECT THIS CLOSES. A fixture carried {scenario, status, body} and
 * nothing else, so a genuine empty read — the tenant answered 200 with no rows
 * — and one captured while the Test Console was reporting a 403 as success were
 * BYTE-IDENTICAL. There was no field to tell them apart, which meant the
 * poisoned ones could not be found, could not be deleted without destroying the
 * legitimate ones alongside them, and stayed in the product.
 *
 * They also did not stay in the product. `fixtures.json` was stamped
 * "Recorded from real runs in CoreEdge Developer Studio" UNCONDITIONALLY and
 * downloaded into the consultant's own repository, where `npm run mock` served
 * an invented 200 for a call that really refuses. The file asserted provenance
 * on behalf of records that had none.
 *
 * So the rule is the product's own doctrine turned on its own records: a claim
 * has to be earned, and the absence of evidence is rendered as absence rather
 * than smoothed over. `sourceStatus: null` is not "probably fine" and it is not
 * "known wrong" — it is "nobody recorded it", and that is what the file says.
 */

import { describe, expect, it } from "vitest";

import { buildScaffold, type ScaffoldFixture } from "@/lib/studio/scaffold";

const IFACE = {
  id: "if_1",
  name: "Bank - Read",
  externalId: "API_BANKDETAIL_SRV",
  sapProduct: "s4hana",
  operation: "READ",
  entitySet: "A_BankDetail",
  version: 1,
  solutionName: "QA-Solution",
} as never;

function fixturesJson(fixtures: readonly ScaffoldFixture[]): {
  note: string;
  fixtures: { scenario: string; sourceStatus: number | null; unverified?: string }[];
} {
  // fixtures is the THIRD argument; the second is baseUrl. Passing them into the
  // baseUrl slot silently yields an empty fixture list and a note claiming all
  // is well — which is how this helper first "passed".
  const files = buildScaffold(IFACE, undefined, fixtures);
  const file = files.find((f) => f.path === "fixtures.json");
  expect(file, "the scaffold must still emit fixtures.json").toBeDefined();
  return JSON.parse(file!.contents);
}

const PROVEN: ScaffoldFixture = {
  scenario: "empty",
  status: 200,
  body: { records: [] },
  sourceStatus: 200,
  capturedAt: "2026-07-29T05:00:00.000Z",
};

/** Exactly what the poisoned records look like: no provenance at all. */
const UNPROVEN: ScaffoldFixture = {
  scenario: "empty",
  status: 200,
  body: { records: [] },
};

describe("the note is earned, not printed", () => {
  it("claims real runs only when every fixture can prove one", () => {
    const out = fixturesJson([PROVEN]);
    expect(out.note).toContain("Recorded from real runs");
    expect(out.note).toContain("the status the tenant returned");
  });

  it("does NOT claim real runs when a fixture cannot prove one", () => {
    const out = fixturesJson([UNPROVEN]);
    expect(
      out.note,
      "an unprovable fixture must not be shipped under a provenance claim — " +
        "this exact sentence travelled into a customer repository over a " +
        "fixture recorded from a 403",
    ).not.toContain("Recorded from real runs");
  });

  it("counts the unprovable ones and says what to do about them", () => {
    const out = fixturesJson([PROVEN, UNPROVEN]);
    expect(out.note).toContain("1 of 2");
    expect(out.note).toMatch(/re-run/i);
  });
});

describe("every fixture carries its own provenance, or its own absence", () => {
  it("marks the unprovable one in the file, not only in the note", () => {
    // A reader who skims the note still has to see it on the record itself.
    const out = fixturesJson([PROVEN, UNPROVEN]);
    const proven = out.fixtures.find((f) => f.sourceStatus === 200);
    const unproven = out.fixtures.find((f) => f.sourceStatus === null);

    expect(proven?.unverified, "a proven fixture must not be flagged").toBeUndefined();
    expect(unproven?.unverified, "an unprovable fixture must be flagged").toContain(
      "origin unknown",
    );
  });

  it("emits sourceStatus and capturedAt on every entry, null where unknown", () => {
    const out = fixturesJson([PROVEN, UNPROVEN]);
    for (const f of out.fixtures) {
      expect(f).toHaveProperty("sourceStatus");
      expect(f).toHaveProperty("capturedAt");
    }
    expect(out.fixtures.filter((f) => f.sourceStatus === null)).toHaveLength(1);
  });

  it("never invents a provenance value for a record that has none", () => {
    // The tempting bug: defaulting sourceStatus to the fixture's own `status`.
    // A poisoned record has status 200, so that would stamp it "the tenant said
    // 200" — manufacturing exactly the evidence this field exists to demand.
    const out = fixturesJson([UNPROVEN]);
    expect(out.fixtures[0]!.sourceStatus).toBeNull();
    expect(out.fixtures[0]!.sourceStatus).not.toBe(200);
  });
});
