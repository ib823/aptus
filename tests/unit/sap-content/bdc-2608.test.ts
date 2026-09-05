// @vitest-environment node
// (adm-zip's inflate returns empty buffers under jsdom's cross-realm Uint8Array; these tests are pure Node.)
/**
 * 2608 WS5 — the BDC questionnaire parser against the COMMITTED 2608
 * workbooks, and the generated seed delta against the parser.
 */
import fs from "node:fs";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

// Real workbooks (the S&P questionnaire alone is 5 MB): allow a minute per test.
vi.setConfig({ testTimeout: 60_000 });

import { normaliseLevel, parseBdcWorkbook, questionKey, splitScopeRefs } from "../../../scripts/lib/bdc-2608/parse-bdc";
import { buildDelta } from "../../../scripts/load-2608-bdc";
import { BDC_2608 } from "../../../scripts/lib/sap-content-sources";

const ROOT = path.resolve(__dirname, "../../..");
const fileOf = (id: string) => BDC_2608.find((b) => b.id === id)!.file;

describe("BDC parser — helpers", () => {
  it("levels are read, never guessed", () => {
    expect(normaliseLevel("L2")).toBe("L2");
    expect(normaliseLevel(" l3 ")).toBe("L3");
    expect(normaliseLevel("")).toBeNull();
    expect(normaliseLevel("Level 2")).toBeNull();
  });
  it("scope refs split on SAP's separators and keep only 3-char codes", () => {
    expect(splitScopeRefs("BMD, BMK, BMR, BNX, J13, J45")).toEqual(["BMD", "BMK", "BMR", "BNX", "J13", "J45"]);
    expect(splitScopeRefs("SAP Build Process Automation Usecases")).toEqual([]);
  });
  it("questionKey folds case, whitespace and trailing punctuation only", () => {
    expect(questionKey("How many buyers  will be generating purchase orders? ")).toBe(
      "how many buyers will be generating purchase orders",
    );
    expect(questionKey("A?")).not.toBe(questionKey("B?"));
  });
});

describe("the five sheet layouts parse to the same shape", () => {
  it('S4H_706 Process Automation ("Questionnaire" sheet, no Level column values): 16 discovery questions', async () => {
    const q = await parseBdcWorkbook(fileOf("S4H_706"), "S4H_706", "Process Automation", ROOT);
    expect(q.sheet).toBe("Questionnaire");
    expect(q.counts.questions).toBe(16);
    expect(q.counts.byLevel).toEqual({ none: 16 });
    expect(q.questions[0]!.process).toBe("SAP Build Process Automation");
    expect(q.questions[0]!.question).toMatch(/^What business process\(es\) have you tried to automat/);
    // The merged "Process" cell is forward-filled; the hyperlink label in "Scope Items" is not a scope code.
    expect(q.questions.every((x) => x.process === "SAP Build Process Automation")).toBe(true);
    expect(q.questions.every((x) => x.scopeRefs.length === 0)).toBe(true);
  });

  it('S4H_1767 Retail ("Accelerator 2608" sheet): 93 questions, all L3, with SSCUI ids', async () => {
    const q = await parseBdcWorkbook(fileOf("S4H_1767"), "S4H_1767", "Retail", ROOT);
    expect(q.sheet).toBe("Accelerator 2608");
    expect(q.counts.questions).toBe(93);
    expect(q.counts.byLevel).toEqual({ L3: 93 });
    expect(q.questions[0]).toMatchObject({
      process: "Retail, Fashion and Vertical Business",
      sapId: "105801",
      level: "L3",
    });
    expect(q.questions[0]!.scopeRefs).toEqual(["3I3"]);
  });

  it("S4H_420 Sourcing & Procurement: 98 questions, 14 at L2 — the rows the 2602 affirm set carries", async () => {
    const q = await parseBdcWorkbook(fileOf("S4H_420"), "S4H_420", "Sourcing and Procurement", ROOT);
    expect(q.counts.questions).toBe(98);
    expect(q.counts.byLevel).toEqual({ L2: 14, L3: 84 });
  });

  it('S4H_1060 Asset Management ("Content Details" layout) maps its Configuration ID / Group columns', async () => {
    const q = await parseBdcWorkbook(fileOf("S4H_1060"), "S4H_1060", "Asset Management", ROOT);
    expect(q.sheet).toBe("Content Details");
    expect(q.counts.questions).toBe(54);
    const withId = q.questions.find((x) => /^\d{6}$/.test(x.sapId))!;
    expect(withId).toMatchObject({ sapId: "103771", area: "Asset Management", subarea: "Organization" });
  });
});

describe("the seed delta is the parser's output, nothing more", () => {
  it("dataset-2608.json regenerates from the workbooks: S4H_706 stream + 14 re-levelled S&P rows, 0 Retail rows", async () => {
    const base = JSON.parse(fs.readFileSync(path.join(ROOT, "prisma/seeds/value-stream/dataset.json"), "utf8")) as {
      questions: { id: string; sapVerbatim: string | null; sourceQuestionnaire: string | null }[];
    };
    const committed = JSON.parse(
      fs.readFileSync(path.join(ROOT, "prisma/seeds/value-stream/dataset-2608.json"), "utf8"),
    );
    const parsed = await Promise.all(
      BDC_2608.filter((b) => /BDC Questionnaire/.test(b.file)).map((b) => parseBdcWorkbook(b.file, b.id, b.id, ROOT)),
    );
    const rebuilt = buildDelta(parsed, base.questions, committed.meta.generatedAt);
    // The name in sourceQuestionnaire comes from the file name in the real run; compare everything else exactly.
    const normalise = (d: typeof rebuilt) => ({
      ...d,
      relevel: d.relevel.map((r) => ({ ...r, sourceQuestionnaire: r.sourceQuestionnaire.split(/\s+/)[0] })),
    });
    expect(normalise(rebuilt)).toEqual(normalise(committed));

    expect(committed.meta.counts).toMatchObject({
      newStreams: 1,
      newSubProcesses: 1,
      newQuestions: 16,
      relevelled: 14,
      relevelUnmatched: 0,
    });
    expect(committed.valueStreams).toEqual([
      { id: "process-automation", name: "Process Automation", isFoundation: false, displayOrder: 8 },
    ]);
    // Every S&P affirm row re-levelled, all to L2 (SAP kept them at L2 in 2608).
    const spIds = base.questions.filter((q) => q.sourceQuestionnaire?.startsWith("S4H_420")).map((q) => q.id);
    expect(committed.relevel.map((r: { id: string }) => r.id).sort()).toEqual(spIds.sort());
    expect(committed.relevel.every((r: { bdcLevel: string }) => r.bdcLevel === "L2")).toBe(true);
    // New questions: SAP verbatim only — no invented plain-language wording, no invented level.
    for (const q of committed.questions) {
      expect(q.bdcLevel).toBeNull();
      expect(q.format).toBe("information");
      expect(q.status).toBe("suggested");
      expect(q.sourceQuestionnaire).toMatch(/^S4H_706/);
      expect(q).not.toHaveProperty("plainLanguageSuggested");
    }
  });
});
