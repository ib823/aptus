/**
 * 2608 WS6 — the To-Be engine. Pure: scope set + answers + rules → pack doc.
 *
 * Rules of the engine (the "never invent" contract):
 *   - Steps come from the 2608 BPD data files only. A scope code without a
 *     data file yields a placeholder item (hasBpd=false), never fabricated steps.
 *   - Every step starts STANDARD. A rule changes a step's state only when the
 *     client's answer to the rule's question equals the rule's trigger.
 *   - "deviate" on a question that names the scope item but has no rule is a
 *     GAP the client has not classified (gapType null), scope-wide.
 *   - "discuss" and unanswered questions never change a state: they flag the
 *     scope item "confirm in workshop".
 *   - A step the BPD marks "(Optional)" is flagged optional + confirm in
 *     workshop; it stays STANDARD unless a rule says otherwise.
 *   - A chain item outside the bundle's scope set is NOT_IN_SCOPE, every step.
 *   - Precedence when several rules hit one step: NOT_IN_SCOPE > GAP > VARIANT
 *     > CONFIGURED > STANDARD; every contributing rule/question is recorded.
 */
import { createHash } from "node:crypto";

import type {
  TobeChainDoc,
  TobeConfiguration,
  TobeEngineInput,
  TobeGap,
  TobePackDoc,
  TobeRuleInput,
  TobeScopeItemDoc,
  TobeStepDoc,
  TobeStepState,
} from "./types";
import { TOBE_STEP_STATES } from "./types";

const PRECEDENCE: Record<TobeStepState, number> = { STANDARD: 0, CONFIGURED: 1, VARIANT: 2, GAP: 3, NOT_IN_SCOPE: 4 };

/** Canonical JSON (sorted keys) → sha256. Same inputs, same hash, whatever the key order. */
export function canonicalHash(value: unknown): string {
  return createHash("sha256").update(canonical(value)).digest("hex");
}

function canonical(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`)
    .join(",")}}`;
}

export function stepKey(name: string): string {
  return name.toLowerCase().replace(/\s+/g, " ").trim();
}

export function isOptionalStep(name: string): boolean {
  return /\(optional\)/i.test(name);
}

function emptyCounts(): Record<TobeStepState, number> {
  return Object.fromEntries(TOBE_STEP_STATES.map((s) => [s, 0])) as Record<TobeStepState, number>;
}

function applyState(step: TobeStepDoc, rule: TobeRuleInput, reason: string | null): void {
  step.ruleIds.push(rule.id);
  if (!step.questionIds.includes(rule.questionId)) step.questionIds.push(rule.questionId);
  if (reason && !step.reasons.includes(reason)) step.reasons.push(reason);
  if (PRECEDENCE[rule.state] < PRECEDENCE[step.state]) return;
  step.state = rule.state;
  if (rule.state === "CONFIGURED") {
    step.sscuiId = rule.sscuiId;
    step.sscuiName = rule.sscuiName;
  }
  if (rule.state === "GAP") step.gapType = rule.gapType;
  if (rule.state === "VARIANT") step.alternatePathId = rule.alternatePathId;
  step.evidence.sscuiId = step.sscuiId;
  step.evidence.questionIds = [...step.questionIds];
}

function buildScopeItem(code: string, input: TobeEngineInput, inScope: boolean): TobeScopeItemDoc {
  const content = input.contents[code];
  const answers = new Map(input.answers.map((a) => [a.questionId, a]));
  const relevant = input.questions.filter((q) => q.scopeItemRefs.includes(code));
  const unansweredQuestionIds = relevant.filter((q) => !answers.has(q.id)).map((q) => q.id);
  const discussQuestionIds = relevant.filter((q) => answers.get(q.id)?.choice === "discuss").map((q) => q.id);

  const steps: TobeStepDoc[] = (content?.process_steps ?? []).map((s, i) => ({
    index: i + 1,
    name: s.name,
    role: s.role,
    app: s.app,
    expected: s.expected,
    state: inScope ? "STANDARD" : "NOT_IN_SCOPE",
    sscuiId: null,
    sscuiName: null,
    gapType: null,
    alternatePathId: null,
    optional: isOptionalStep(s.name),
    confirmInWorkshop: inScope && isOptionalStep(s.name),
    reasons: [],
    questionIds: [],
    ruleIds: [],
    evidence: { scopeCode: code, bpd: `BPD ${input.release}`, sscuiId: null, questionIds: [] },
  }));
  const byKey = new Map(steps.map((s) => [stepKey(s.name), s]));

  const configurations: TobeConfiguration[] = [];
  const gaps: TobeGap[] = [];
  const firedRuleQuestionIds = new Set<string>();

  if (inScope) {
    for (const rule of input.rules) {
      if (rule.scopeCode !== code) continue;
      const answer = answers.get(rule.questionId);
      if (!answer || answer.choice !== rule.trigger) continue;
      firedRuleQuestionIds.add(rule.questionId);
      const targets =
        rule.stepNames.length > 0
          ? rule.stepNames.map((n) => byKey.get(stepKey(n))).filter((s): s is TobeStepDoc => s !== undefined)
          : steps;
      const scopeWide = rule.stepNames.length === 0;
      if (rule.state === "CONFIGURED" && rule.sscuiId) {
        configurations.push({
          sscuiId: rule.sscuiId,
          sscuiName: rule.sscuiName,
          questionId: rule.questionId,
          choice: answer.choice,
          reason: answer.reason,
          ruleId: rule.id,
          scopeWide,
          stepNames: rule.stepNames,
        });
        // Scope-wide configuration is evidence on every step, not a state on every step.
        if (scopeWide) {
          for (const s of steps) {
            if (!s.questionIds.includes(rule.questionId)) s.questionIds.push(rule.questionId);
            s.evidence.questionIds = [...s.questionIds];
          }
          continue;
        }
      }
      if (rule.state === "GAP")
        gaps.push({
          questionId: rule.questionId,
          reason: answer.reason,
          gapType: rule.gapType,
          ruleId: rule.id,
          stepNames: rule.stepNames,
        });
      for (const s of targets) {
        applyState(s, rule, answer.reason);
        if (rule.trigger === "discuss" || rule.state === "VARIANT") s.confirmInWorkshop = true;
      }
    }
    // A deviation with no rule to interpret it is a gap the client has not classified.
    for (const q of relevant) {
      const a = answers.get(q.id);
      if (!a || a.choice !== "deviate" || firedRuleQuestionIds.has(q.id)) continue;
      gaps.push({ questionId: q.id, reason: a.reason, gapType: null, ruleId: null, stepNames: [] });
    }
  }

  const counts = emptyCounts();
  for (const s of steps) counts[s.state]++;
  const confirmInWorkshop =
    inScope &&
    (unansweredQuestionIds.length > 0 ||
      discussQuestionIds.length > 0 ||
      steps.some((s) => s.confirmInWorkshop) ||
      gaps.some((g) => g.gapType === null));
  return {
    code,
    title: content?.title ?? code,
    release: content?.release ?? input.release,
    inScope,
    hasBpd: content !== undefined,
    roles: content ? content.business_roles.map((r) => r.name) : [],
    steps,
    configurations,
    gaps,
    counts,
    unansweredQuestionIds,
    discussQuestionIds,
    confirmInWorkshop,
  };
}

export function generateTobePack(input: TobeEngineInput): TobePackDoc {
  const scopeSet = new Set(input.scopeCodes);
  const chainCodes = input.chains.flatMap((c) => [...c.path, ...c.alternates.flatMap((a) => a.via)]);
  // Order: chain order first (so the L1 reads left to right), then any scoped item not in a chain.
  const uniqueChain = chainCodes.filter((c, i, arr) => arr.indexOf(c) === i);
  const ordered = [...uniqueChain, ...input.scopeCodes.filter((c) => !uniqueChain.includes(c))];

  const scopeItems = ordered.map((code) => buildScopeItem(code, input, scopeSet.has(code)));
  const byCode = new Map(scopeItems.map((s) => [s.code, s]));

  const chains: TobeChainDoc[] = input.chains.map((c) => ({
    id: c.id,
    name: c.name,
    valueStreamId: c.valueStreamId,
    source: c.source,
    items: c.path.map((code) => {
      const it = byCode.get(code)!;
      return { code, title: it.title, inScope: it.inScope, counts: it.counts };
    }),
    alternates: c.alternates.map((a) => ({ ...a, inScope: a.via.every((v) => scopeSet.has(v)) })),
  }));

  const byState = emptyCounts();
  let steps = 0;
  for (const it of scopeItems) {
    for (const s of it.steps) {
      byState[s.state]++;
      steps++;
    }
  }
  const inScopeItems = scopeItems.filter((s) => s.inScope);
  const answeredIds = new Set(input.answers.map((a) => a.questionId));
  const relevantQuestionIds = new Set(
    input.questions.filter((q) => q.scopeItemRefs.some((c) => scopeSet.has(c))).map((q) => q.id),
  );

  const hashes = {
    scope: canonicalHash([...input.scopeCodes].sort()),
    answers: canonicalHash([...input.answers].sort((a, b) => a.questionId.localeCompare(b.questionId))),
    rules: canonicalHash([...input.rules].sort((a, b) => a.id.localeCompare(b.id))),
    inputs: "",
  };
  hashes.inputs = canonicalHash({
    release: input.release,
    scope: hashes.scope,
    answers: hashes.answers,
    rules: hashes.rules,
    chains: input.chains.map((c) => c.id),
  });

  // An answer to a question that names no scope item here has nowhere to land.
  // It is neither dropped nor guessed onto a step: it is listed.
  const answersOutsideScope = [...input.answers]
    .filter((a) => !relevantQuestionIds.has(a.questionId))
    .sort((a, b) => a.questionId.localeCompare(b.questionId));

  const doc: TobePackDoc = {
    version: 1,
    release: input.release,
    generatedAt: input.generatedAt,
    hashes,
    chains,
    scopeItems,
    summary: {
      scopeItems: inScopeItems.length,
      steps,
      byState,
      confirmInWorkshop: inScopeItems.filter((s) => s.confirmInWorkshop).length,
      configuredSscuis: new Set(inScopeItems.flatMap((s) => s.configurations.map((c) => c.sscuiId))).size,
      gaps: inScopeItems.reduce((n, s) => n + s.gaps.length, 0),
      unansweredQuestions: [...relevantQuestionIds].filter((id) => !answeredIds.has(id)).length,
      answered: [...relevantQuestionIds].filter((id) => answeredIds.has(id)).length,
      answersOutsideScope: answersOutsideScope.length,
    },
    answersOutsideScope,
  };
  if (input.consultantNotes && Object.keys(input.consultantNotes).length > 0)
    doc.consultantNotes = input.consultantNotes;
  return doc;
}

/** The client-facing document: consultant notes removed, nothing else changed. */
export function clientView(doc: TobePackDoc): TobePackDoc {
  const { consultantNotes: _notes, ...rest } = doc;
  return rest;
}
