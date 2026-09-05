/**
 * 2608 WS6 — To-Be rules from the BDC L2/L3 ↔ SSCUI cross-reference.
 *
 * SAP's BDC questionnaires carry, per question, the SSCUI ("SAP ID") the
 * answer configures and the scope items it applies to. The affirm question
 * bank carries the same questions (matched by verbatim text). Where both a
 * numeric SSCUI id and scope refs exist on a DECISION-format question, one
 * rule per (question, scope item) is seeded:
 *
 *   trigger "deviate" → CONFIGURED(sscuiId), scope-wide (no step named — the
 *   sheet does not say which BPD step the SSCUI touches, so the engine shows
 *   it on the scope item, not on a guessed step).
 *
 * Information-format questions (free text: "describe your sales offices") get
 * no rule: there is no "deviate" to trigger on. Curated rules (step-level) are
 * a separate, human-authored file.
 */
import type { TobeRuleInput } from "./types";

export interface XrefBankQuestion {
  id: string;
  sapVerbatim: string | null;
  scopeItemRefs: string[];
  sscuiRef: string | null;
  format?: string | null;
}

export interface XrefSheetQuestion {
  questionnaireId: string;
  row: number;
  question: string;
  sapId: string;
  configRef: string;
  scopeRefs: string[];
  level: string | null;
}

export function questionKey(q: string): string {
  return q
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[\s?.:;,]+$/g, "")
    .trim();
}

export const XREF_SOURCE = "bdc-sscui-xref-2608";

export function buildXrefRules(bank: XrefBankQuestion[], sheet: XrefSheetQuestion[]): TobeRuleInput[] {
  const bySheetKey = new Map<string, XrefSheetQuestion>();
  for (const s of sheet) {
    const k = questionKey(s.question);
    if (!bySheetKey.has(k)) bySheetKey.set(k, s);
  }
  const rules: TobeRuleInput[] = [];
  for (const q of bank) {
    if ((q.format ?? "decision") !== "decision" || !q.sapVerbatim) continue;
    const hit = bySheetKey.get(questionKey(q.sapVerbatim));
    if (!hit || !/^\d{5,6}$/.test(hit.sapId)) continue;
    const codes = Array.from(new Set([...hit.scopeRefs, ...q.scopeItemRefs])).filter((c) => /^[0-9A-Z]{3}$/.test(c));
    for (const code of codes) {
      rules.push({
        id: `xref:${q.id}:${code}`,
        questionId: q.id,
        scopeCode: code,
        trigger: "deviate",
        state: "CONFIGURED",
        sscuiId: hit.sapId,
        sscuiName: q.sscuiRef && q.sscuiRef !== "N/A" && q.sscuiRef !== "-" ? q.sscuiRef : hit.configRef || null,
        gapType: null,
        alternatePathId: null,
        stepNames: [],
        source: XREF_SOURCE,
        note: `${hit.questionnaireId} row ${hit.row}${hit.level ? ` (${hit.level})` : ""}`,
      });
    }
  }
  return rules;
}
