/**
 * 2608 WS6 — the To-Be engine's "never invent" contract.
 */
import { describe, expect, it } from "vitest";

import { canonicalHash, clientView, generateTobePack, isOptionalStep, stepKey } from "@/lib/tobe/engine";

import { fixtureInput } from "./fixtures";

const item = (doc: ReturnType<typeof generateTobePack>, code: string) => doc.scopeItems.find((i) => i.code === code)!;
const step = (doc: ReturnType<typeof generateTobePack>, code: string, name: string) =>
  item(doc, code).steps.find((s) => s.name === name)!;

describe("defaults — nothing is inferred", () => {
  it("with no answers every in-scope step is STANDARD, optional steps flagged, all questions unanswered", () => {
    const doc = generateTobePack(fixtureInput());
    expect(doc.version).toBe(1);
    expect(doc.release).toBe("2608");
    for (const code of ["AAA", "BBB"]) {
      expect(item(doc, code).inScope).toBe(true);
      expect(item(doc, code).steps.every((s) => s.state === "STANDARD")).toBe(true);
      expect(item(doc, code).configurations).toEqual([]);
      expect(item(doc, code).gaps).toEqual([]);
    }
    expect(step(doc, "AAA", "Approve Quotation (Optional)").optional).toBe(true);
    expect(step(doc, "AAA", "Approve Quotation (Optional)").confirmInWorkshop).toBe(true);
    expect(step(doc, "AAA", "Create Sales Quotation").confirmInWorkshop).toBe(false);
    expect(item(doc, "AAA").unansweredQuestionIds).toEqual(["Q-1", "Q-2"]);
    expect(item(doc, "BBB").unansweredQuestionIds).toEqual(["Q-3", "Q-4"]);
    expect(doc.summary).toMatchObject({
      scopeItems: 2,
      steps: 7,
      unansweredQuestions: 4,
      answered: 0,
      gaps: 0,
      configuredSscuis: 0,
      answersOutsideScope: 0,
    });
    expect(doc.answersOutsideScope).toEqual([]);
    expect(doc.summary.byState).toEqual({ STANDARD: 6, CONFIGURED: 0, VARIANT: 0, GAP: 0, NOT_IN_SCOPE: 1 });
  });

  it("a chain item outside the scope set is NOT_IN_SCOPE on every step and never counted as a scope item", () => {
    const doc = generateTobePack(fixtureInput());
    const ccc = item(doc, "CCC");
    expect(ccc.inScope).toBe(false);
    expect(ccc.steps.map((s) => s.state)).toEqual(["NOT_IN_SCOPE"]);
    expect(ccc.confirmInWorkshop).toBe(false);
    expect(doc.chains[0]!.items.map((i) => [i.code, i.inScope])).toEqual([
      ["AAA", true],
      ["BBB", true],
      ["CCC", false],
    ]);
    expect(doc.summary.scopeItems).toBe(2);
  });

  it("an answer to a question naming no scoped item is listed as outside scope, never placed", () => {
    const doc = generateTobePack(
      fixtureInput({ scopeCodes: ["AAA"], answers: [{ questionId: "Q-3", choice: "deviate", reason: "plants" }] }),
    );
    expect(doc.answersOutsideScope).toEqual([{ questionId: "Q-3", choice: "deviate", reason: "plants" }]);
    expect(doc.summary.answersOutsideScope).toBe(1);
    expect(doc.summary.answered).toBe(0);
    expect(doc.summary.gaps).toBe(0);
  });

  it("a scope code without a 2608 data file is a placeholder with no steps, never fabricated ones", () => {
    const doc = generateTobePack(fixtureInput({ scopeCodes: ["AAA", "ZZZ"] }));
    const zzz = item(doc, "ZZZ");
    expect(zzz.hasBpd).toBe(false);
    expect(zzz.steps).toEqual([]);
    expect(zzz.title).toBe("ZZZ");
  });

  it("'standard' answers change nothing; 'discuss' flags the scope item only", () => {
    const doc = generateTobePack(
      fixtureInput({
        answers: [
          { questionId: "Q-1", choice: "standard", reason: null },
          { questionId: "Q-2", choice: "standard", reason: null },
          { questionId: "Q-3", choice: "standard", reason: null },
          { questionId: "Q-4", choice: "discuss", reason: "we will bring a list" },
        ],
      }),
    );
    expect(doc.summary.byState).toEqual({ STANDARD: 6, CONFIGURED: 0, VARIANT: 0, GAP: 0, NOT_IN_SCOPE: 1 });
    expect(item(doc, "AAA").confirmInWorkshop).toBe(true); // the optional step
    expect(item(doc, "BBB").discussQuestionIds).toEqual(["Q-4"]);
    expect(item(doc, "BBB").confirmInWorkshop).toBe(true);
    expect(doc.summary.answered).toBe(4);
  });
});

describe("rules fire only on their trigger", () => {
  it("deviate on Q-1: scope-wide xref rule → configuration + evidence on every AAA step; step rule → CONFIGURED on the named step", () => {
    const doc = generateTobePack(
      fixtureInput({ answers: [{ questionId: "Q-1", choice: "deviate", reason: "two-level approval" }] }),
    );
    const aaa = item(doc, "AAA");
    expect(aaa.configurations.map((c) => [c.ruleId, c.scopeWide])).toEqual([
      ["xref:Q-1:AAA", true],
      ["curated:Q-1:AAA", false],
    ]);
    expect(aaa.steps.every((s) => s.questionIds.includes("Q-1"))).toBe(true);
    expect(step(doc, "AAA", "Create Sales Quotation").state).toBe("STANDARD");
    const approve = step(doc, "AAA", "Approve Quotation (Optional)");
    expect(approve.state).toBe("CONFIGURED");
    expect(approve.sscuiId).toBe("102751");
    expect(approve.reasons).toEqual(["two-level approval"]);
    expect(approve.evidence).toEqual({ scopeCode: "AAA", bpd: "BPD 2608", sscuiId: "102751", questionIds: ["Q-1"] });
    expect(doc.summary.configuredSscuis).toBe(1);
    expect(aaa.gaps).toEqual([]);
  });

  it("the same rule does not fire on 'discuss' or 'standard'", () => {
    for (const choice of ["discuss", "standard"] as const) {
      const doc = generateTobePack(fixtureInput({ answers: [{ questionId: "Q-1", choice, reason: null }] }));
      expect(step(doc, "AAA", "Approve Quotation (Optional)").state).toBe("STANDARD");
      expect(item(doc, "AAA").configurations).toEqual([]);
    }
  });

  it("a 'discuss'-triggered VARIANT rule marks the step and forces confirm-in-workshop", () => {
    const doc = generateTobePack(fixtureInput({ answers: [{ questionId: "Q-3", choice: "discuss", reason: null }] }));
    const s = step(doc, "BBB", "Create Delivery");
    expect(s.state).toBe("VARIANT");
    expect(s.alternatePathId).toBe("alt-1");
    expect(s.confirmInWorkshop).toBe(true);
  });

  it("deviate with no rule for the question is an unclassified GAP on the scope item, no step changes", () => {
    const doc = generateTobePack(
      fixtureInput({ answers: [{ questionId: "Q-3", choice: "deviate", reason: "we ship from 3 plants" }] }),
    );
    const bbb = item(doc, "BBB");
    expect(bbb.gaps).toEqual([
      { questionId: "Q-3", reason: "we ship from 3 plants", gapType: null, ruleId: null, stepNames: [] },
    ]);
    expect(bbb.steps.every((s) => s.state === "STANDARD")).toBe(true);
    expect(bbb.confirmInWorkshop).toBe(true);
    expect(doc.summary.gaps).toBe(1);
  });

  it("a rule whose step name is not in the BPD targets nothing (never a guessed step)", () => {
    const doc = generateTobePack(
      fixtureInput({
        rules: [{ ...fixtureInput().rules[1]!, id: "curated:Q-1:AAA:typo", stepNames: ["Approve Quotation Twice"] }],
        answers: [{ questionId: "Q-1", choice: "deviate", reason: null }],
      }),
    );
    expect(item(doc, "AAA").steps.every((s) => s.state === "STANDARD")).toBe(true);
    // The configuration is still recorded — the SSCUI is real; only the step mapping missed.
    expect(item(doc, "AAA").configurations).toHaveLength(1);
  });
});

describe("precedence when several rules hit one step", () => {
  it("GAP beats CONFIGURED, and every contributing rule and question is kept", () => {
    const doc = generateTobePack(
      fixtureInput({
        answers: [
          { questionId: "Q-1", choice: "deviate", reason: "approval" },
          { questionId: "Q-2", choice: "deviate", reason: "extra step" },
        ],
      }),
    );
    const s = step(doc, "AAA", "Approve Quotation (Optional)");
    expect(s.state).toBe("GAP");
    expect(s.gapType).toBe("extension");
    expect(s.sscuiId).toBe("102751"); // the configuration evidence survives the override
    expect(s.ruleIds).toEqual(["curated:Q-1:AAA", "curated:Q-2:AAA"]);
    expect(s.questionIds).toEqual(["Q-1", "Q-2"]);
    expect(s.reasons).toEqual(["approval", "extra step"]);
    expect(item(doc, "AAA").counts).toEqual({ STANDARD: 2, CONFIGURED: 0, VARIANT: 0, GAP: 1, NOT_IN_SCOPE: 0 });
  });

  it("order of rules does not change the outcome", () => {
    const base = fixtureInput({
      answers: [
        { questionId: "Q-1", choice: "deviate", reason: null },
        { questionId: "Q-2", choice: "deviate", reason: null },
      ],
    });
    const a = generateTobePack(base);
    const b = generateTobePack({ ...base, rules: [...base.rules].reverse() });
    expect(step(b, "AAA", "Approve Quotation (Optional)").state).toBe(
      step(a, "AAA", "Approve Quotation (Optional)").state,
    );
    expect(b.hashes).toEqual(a.hashes);
  });
});

describe("hashes", () => {
  it("are canonical: key order and generatedAt do not matter; scope, answers, rules and release do", () => {
    const a = generateTobePack(fixtureInput());
    const b = generateTobePack(fixtureInput({ generatedAt: "2030-01-01T00:00:00.000Z", scopeCodes: ["BBB", "AAA"] }));
    expect(b.hashes).toEqual(a.hashes);
    expect(
      generateTobePack(fixtureInput({ answers: [{ questionId: "Q-1", choice: "standard", reason: null }] })).hashes
        .answers,
    ).not.toBe(a.hashes.answers);
    expect(generateTobePack(fixtureInput({ scopeCodes: ["AAA"] })).hashes.scope).not.toBe(a.hashes.scope);
    expect(generateTobePack(fixtureInput({ rules: [] })).hashes.rules).not.toBe(a.hashes.rules);
    expect(generateTobePack(fixtureInput({ release: "2602" })).hashes.inputs).not.toBe(a.hashes.inputs);
    expect(canonicalHash({ b: 1, a: [1, { d: 2, c: 3 }] })).toBe(canonicalHash({ a: [1, { c: 3, d: 2 }], b: 1 }));
  });
});

describe("helpers and views", () => {
  it("stepKey folds case and whitespace; isOptionalStep reads the BPD marker only", () => {
    expect(stepKey("  Check   Batches (Optional) ")).toBe("check batches (optional)");
    expect(isOptionalStep("Check Batches (Optional)")).toBe(true);
    expect(isOptionalStep("Optional Steps Review")).toBe(false);
  });

  it("clientView removes consultant notes and nothing else", () => {
    const doc = generateTobePack(fixtureInput({ consultantNotes: { AAA: "internal: pricing to be revisited" } }));
    expect(doc.consultantNotes).toEqual({ AAA: "internal: pricing to be revisited" });
    const cv = clientView(doc);
    expect(cv.consultantNotes).toBeUndefined();
    expect({ ...cv, consultantNotes: doc.consultantNotes }).toEqual(doc);
    expect(JSON.stringify(cv)).not.toContain("internal:");
  });
});
