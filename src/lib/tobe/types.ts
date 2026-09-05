/**
 * 2608 WS6 — Client To-Be Process Pack: the document shapes.
 *
 * A pack is generated from (a) the scope items of an affirm bundle and (b) the
 * client's BDC answers on it, against the 2608 BPD steps. Every step carries
 * one state and its evidence. The document is frozen as JSON on TobePack with
 * the hashes of its inputs; these types are that JSON.
 */

export type TobeStepState = "STANDARD" | "CONFIGURED" | "VARIANT" | "GAP" | "NOT_IN_SCOPE";
export const TOBE_STEP_STATES: TobeStepState[] = ["STANDARD", "CONFIGURED", "VARIANT", "GAP", "NOT_IN_SCOPE"];

export type TobeGapType = "extension" | "workaround" | "integration" | "out-of-scope";

/** The affirm choice vocabulary (AffirmResponse.choice). */
export type TobeTrigger = "standard" | "discuss" | "deviate";

export interface TobeRuleInput {
  id: string;
  questionId: string;
  scopeCode: string;
  trigger: TobeTrigger;
  state: TobeStepState;
  sscuiId: string | null;
  sscuiName: string | null;
  gapType: TobeGapType | null;
  alternatePathId: string | null;
  /** BPD step names the rule targets; empty = the whole scope item. */
  stepNames: string[];
  source: string;
  note: string | null;
}

export interface TobeAnswer {
  questionId: string;
  choice: TobeTrigger;
  reason: string | null;
}

export interface TobeQuestion {
  id: string;
  sapVerbatim: string | null;
  scopeItemRefs: string[];
  sscuiRef: string | null;
  sourceQuestionnaire: string | null;
  format: string;
}

export interface TobeChainAlternate {
  id: string;
  from: string;
  via: string[];
  to: string;
  note: string;
}

export interface TobeChain {
  id: string;
  name: string;
  valueStreamId: string;
  path: string[];
  alternates: TobeChainAlternate[];
  source: string;
}

/** The subset of ScopeItemContent the engine reads (src/lib/fts/types). */
export interface TobeScopeContent {
  code: string;
  title: string;
  release: string;
  business_roles: { name: string; id: string }[];
  process_steps: { name: string; role: string; app: string; expected: string }[];
}

export interface TobeEngineInput {
  release: string;
  scopeCodes: string[];
  contents: Record<string, TobeScopeContent>;
  answers: TobeAnswer[];
  questions: TobeQuestion[];
  rules: TobeRuleInput[];
  chains: TobeChain[];
  generatedAt: string;
  /** Consultant-only notes per scope code; stripped from the client view. */
  consultantNotes?: Record<string, string>;
}

export interface TobeEvidence {
  scopeCode: string;
  bpd: string;
  sscuiId: string | null;
  questionIds: string[];
}

export interface TobeStepDoc {
  index: number;
  name: string;
  role: string;
  app: string;
  expected: string;
  state: TobeStepState;
  sscuiId: string | null;
  sscuiName: string | null;
  gapType: TobeGapType | null;
  alternatePathId: string | null;
  /** The BPD marks the step "(Optional)" — a variant candidate until the client confirms. */
  optional: boolean;
  confirmInWorkshop: boolean;
  /** Client reasons from the answers that set this step's state. */
  reasons: string[];
  questionIds: string[];
  ruleIds: string[];
  evidence: TobeEvidence;
}

export interface TobeConfiguration {
  sscuiId: string;
  sscuiName: string | null;
  questionId: string;
  choice: TobeTrigger;
  reason: string | null;
  ruleId: string;
  /** True when the rule targets the whole scope item rather than named steps. */
  scopeWide: boolean;
  stepNames: string[];
}

export interface TobeGap {
  questionId: string;
  reason: string | null;
  gapType: TobeGapType | null;
  ruleId: string | null;
  stepNames: string[];
}

export interface TobeScopeItemDoc {
  code: string;
  title: string;
  release: string;
  inScope: boolean;
  /** No 2608 BPD data file for this code — the item renders as a placeholder, never invented steps. */
  hasBpd: boolean;
  roles: string[];
  steps: TobeStepDoc[];
  configurations: TobeConfiguration[];
  gaps: TobeGap[];
  counts: Record<TobeStepState, number>;
  /** Questions naming this scope item the client has not answered. */
  unansweredQuestionIds: string[];
  /** Questions naming this scope item the client asked to discuss. */
  discussQuestionIds: string[];
  confirmInWorkshop: boolean;
}

export interface TobeChainDoc {
  id: string;
  name: string;
  valueStreamId: string;
  source: string;
  items: { code: string; title: string; inScope: boolean; counts: Record<TobeStepState, number> }[];
  alternates: (TobeChainAlternate & { inScope: boolean })[];
}

export interface TobePackDoc {
  version: 1;
  release: string;
  generatedAt: string;
  hashes: { scope: string; answers: string; rules: string; inputs: string };
  chains: TobeChainDoc[];
  scopeItems: TobeScopeItemDoc[];
  summary: {
    scopeItems: number;
    steps: number;
    byState: Record<TobeStepState, number>;
    confirmInWorkshop: number;
    configuredSscuis: number;
    gaps: number;
    unansweredQuestions: number;
    answered: number;
    /** Answers whose question names no scope item of this engagement — recorded, never placed on a step. */
    answersOutsideScope: number;
  };
  /** The answers `summary.answersOutsideScope` counts, for the workshop list. */
  answersOutsideScope: TobeAnswer[];
  consultantNotes?: Record<string, string>;
}
