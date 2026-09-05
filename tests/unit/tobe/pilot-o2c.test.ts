// @vitest-environment node
/**
 * 2608 WS6 — the Order-to-Cash pilot, end to end without a database: the
 * checked-in answer set + curated rules + the affirm question bank (seed
 * dataset) + the 2608 BPD data files + the O2C chain. Every SSCUI a curated
 * rule cites must exist in SSCUI_List 2608; every step a rule names must be a
 * 2608 BPD step; every drawn step must come from a 2608 data file.
 */
import fs from "node:fs";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import { chainsForScope } from "@/lib/tobe/chains";
import { generateTobePack } from "@/lib/tobe/engine";
import { ftsContents, releaseOf } from "@/lib/tobe/inputs";
import { renderL1Svg, renderL2Svg } from "@/lib/tobe/svg";
import type { TobeAnswer, TobeQuestion, TobeRuleInput } from "@/lib/tobe/types";

import { parseSscuiList } from "../../../scripts/lib/sap-2608/parse";
import { sapContentSourcesFor } from "../../../scripts/lib/sap-content-sources";

vi.setConfig({ testTimeout: 90_000 });

const ROOT = path.resolve(__dirname, "../../..");
const read = <T>(p: string): T => JSON.parse(fs.readFileSync(path.join(ROOT, p), "utf8")) as T;

const pilot = read<{ bundle: { scopeCodes: string[] }; answers: TobeAnswer[] }>("src/data/tobe/pilot-o2c-answers.json");
const curated = read<{
  rules: (Omit<TobeRuleInput, "gapType" | "alternatePathId" | "source"> & { gapType?: TobeRuleInput["gapType"] })[];
}>("src/data/tobe/rules-curated-o2c.json");
const dataset = read<{
  questions: {
    id: string;
    sapVerbatim: string | null;
    scopeItemRefs: string[];
    sscuiRef: string | null;
    sourceQuestionnaire: string | null;
    format: string;
  }[];
}>("prisma/seeds/value-stream/dataset.json");

const rules: TobeRuleInput[] = curated.rules.map((r) => ({
  ...r,
  gapType: r.gapType ?? null,
  alternatePathId: null,
  source: "curated",
}));
const scopeCodes = [...pilot.bundle.scopeCodes].sort();
const chains = chainsForScope(scopeCodes);
const allCodes = Array.from(
  new Set([...scopeCodes, ...chains.flatMap((c) => [...c.path, ...c.alternates.flatMap((a) => a.via)])]),
);
const contents = ftsContents(allCodes);
const questions: TobeQuestion[] = dataset.questions.filter((q) => q.scopeItemRefs.some((c) => allCodes.includes(c)));
const doc = generateTobePack({
  release: releaseOf(contents),
  scopeCodes,
  contents,
  answers: pilot.answers,
  questions,
  rules,
  chains,
  generatedAt: "2026-09-05T00:00:00.000Z",
});

describe("pilot O2C inputs", () => {
  it("the chain is the O2C pilot path and every code in it has a 2608 data file", () => {
    expect(chains.map((c) => c.id)).toEqual(["o2c-sales"]);
    expect(chains[0]!.path).toEqual(["1IQ", "BDG", "BD9", "J59"]);
    for (const code of allCodes) expect(contents[code], code).toBeDefined();
    expect(doc.release).toBe("2608");
  });

  it("every pilot answer names a question in the bank, and every curated rule's question and step exist", () => {
    const bank = new Set(dataset.questions.map((q) => q.id));
    for (const a of pilot.answers) expect(bank.has(a.questionId), a.questionId).toBe(true);
    for (const r of rules) {
      expect(bank.has(r.questionId), r.id).toBe(true);
      const q = dataset.questions.find((x) => x.id === r.questionId)!;
      expect(q.scopeItemRefs, `${r.id}: question does not name ${r.scopeCode}`).toContain(r.scopeCode);
      const names = new Set(contents[r.scopeCode]!.process_steps.map((s) => s.name));
      for (const n of r.stepNames)
        expect(names.has(n), `${r.id}: "${n}" is not a 2608 BPD step of ${r.scopeCode}`).toBe(true);
    }
  });

  it("every SSCUI a curated rule cites exists in SSCUI_List 2608 with the same name", async () => {
    const list = await parseSscuiList(sapContentSourcesFor("2608"));
    // "Configuration Activity ID" is the SSCUI id; "Configuration Item ID" is its parent item.
    const byId = new Map(list.map((r) => [r.activityId, r]));
    for (const r of rules) {
      const row = byId.get(r.sscuiId!);
      expect(row, `${r.id}: SSCUI ${r.sscuiId} not in SSCUI_List 2608`).toBeDefined();
      expect(row!.activityDescription, r.id).toBe(r.sscuiName);
    }
  });
});

describe("pilot O2C pack", () => {
  it("has five in-scope items, every step from a 2608 data file, and the expected states", () => {
    expect(doc.summary.scopeItems).toBe(5);
    expect(doc.scopeItems.map((i) => i.code)).toEqual(["1IQ", "BDG", "BD9", "J59", "2ET"]);
    for (const item of doc.scopeItems) {
      const src = contents[item.code]!;
      expect(item.steps.map((s) => s.name)).toEqual(src.process_steps.map((s) => s.name));
      for (const s of item.steps) expect(s.evidence).toMatchObject({ scopeCode: item.code, bpd: "BPD 2608" });
    }
    const bdg = doc.scopeItems.find((i) => i.code === "BDG")!;
    const configured = bdg.steps.filter((s) => s.state === "CONFIGURED");
    expect(configured.map((s) => s.name)).toEqual([
      "Process Sales Quotation Approval (Optional)",
      "Approve/Reject/Rework Quotation",
    ]);
    expect(configured.every((s) => s.sscuiId === "102751" && s.questionIds.includes("L2-077"))).toBe(true);
    const bd9 = doc.scopeItems.find((i) => i.code === "BD9")!;
    expect(bd9.steps.filter((s) => s.state === "CONFIGURED").map((s) => [s.name, s.sscuiId])).toEqual([
      ["Advanced Available-to-Promise Processing (Optional)", "101099"],
      ["Check Batches (Optional)", "102172"],
    ]);
    expect(doc.summary.byState.CONFIGURED).toBe(4);
    expect(doc.summary.byState.NOT_IN_SCOPE).toBe(0);
    expect(doc.summary.configuredSscuis).toBe(3);
    // Deviations the pilot did not curate a rule for are unclassified gaps, never guessed states.
    const gapQuestions = doc.scopeItems.flatMap((i) => i.gaps.map((g) => g.questionId)).sort();
    expect(gapQuestions).toEqual(["L2-090"]);
    expect(doc.scopeItems.flatMap((i) => i.gaps).every((g) => g.gapType === null && g.ruleId === null)).toBe(true);
    expect(doc.summary.byState.GAP).toBe(0);
    // L2-082 names no scope item in the bank: its deviation is listed, not placed and not lost.
    expect(doc.answersOutsideScope).toEqual([{ questionId: "L2-082", choice: "deviate", reason: expect.any(String) }]);
    expect(doc.summary.answersOutsideScope).toBe(1);
    expect(doc.summary.answered).toBe(pilot.answers.length - 1);
  });

  it("renders the L1 and every L2 as well-formed SVG", () => {
    const l1 = renderL1Svg(doc);
    expect(l1.startsWith("<svg")).toBe(true);
    for (const code of ["1IQ", "BDG", "BD9", "J59"]) expect(l1).toContain(`data-scope="${code}"`);
    for (const item of doc.scopeItems) {
      const svg = renderL2Svg(item);
      expect(svg.startsWith("<svg")).toBe(true);
      expect(svg.endsWith("</svg>")).toBe(true);
      expect(svg.split("<rect").length - 1).toBeGreaterThanOrEqual(item.steps.length);
    }
  });
});
