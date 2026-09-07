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

/**
 * 2608 WS14 — where a step's content came from. The BPD data files publish an
 * expected result per step and the process-step master does not, so the two
 * are not interchangeable and the pack says which it used.
 */
export type TobeStepSource = "BPD" | "PROCESS_STEP_MASTER";
export const TOBE_STEP_SOURCES: TobeStepSource[] = ["BPD", "PROCESS_STEP_MASTER"];

/**
 * 2608 WS14 — the pre-award reading of a step or scope item.
 *
 * A bid pack has to separate what SAP publishes (and we can cite) from what
 * only the client can answer. These are those two labels, plus the third
 * state that is neither.
 *
 *   SAP_STANDARD_CITED   SAP publishes this and we cite the publication. No
 *                        client input is needed to assert it.
 *   CONFIRM_WITH_CLIENT  The step is optional in SAP's own content, or a
 *                        question naming it is unanswered or marked discuss,
 *                        or an answer made it a gap or a variant. Every one
 *                        of these needs the client.
 *   NOT_IN_SCOPE         Outside the engagement's scope set. Carries neither
 *                        label, because claiming either about an item nobody
 *                        is buying would be noise.
 */
export type TobeDisposition = "SAP_STANDARD_CITED" | "CONFIRM_WITH_CLIENT" | "NOT_IN_SCOPE";
export const TOBE_DISPOSITIONS: TobeDisposition[] = [
  "SAP_STANDARD_CITED",
  "CONFIRM_WITH_CLIENT",
  "NOT_IN_SCOPE",
];

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

/** One process step as a content source publishes it. */
export interface TobeSourcedStep {
  name: string;
  role: string;
  app: string;
  expected: string;
  /** The source publishes no expected result. The renderers say so; nothing fills it in. */
  expectedUnpublished: boolean;
  /** ISO-3166-1 alpha-2 countries the source names for this step. */
  countries: string[];
  isGlobal: boolean;
}

/** Steps and roles for one scope item, from whichever source published them. */
export interface TobeScopeContent {
  code: string;
  title: string;
  release: string;
  source: TobeStepSource;
  business_roles: { name: string; id: string }[];
  process_steps: TobeSourcedStep[];
  /** Steps the engagement's country footprint excluded. Reported, never silent. */
  stepsExcludedByCountry?: number;
}

/** A form SAP ships for this scope item (SapFormTemplate). */
export interface TobeForm {
  name: string;
  applicationArea: string;
  applicationObject: string;
  outputType: string;
  adobeFormTemplate: string;
}

/** An integration this scope item needs (ScopeItemCommScenario × SapCommScenario). */
export interface TobeIntegration {
  commScenarioId: string;
  /** SAP names 62 of 496 scenarios in the anonymous slice; null is "not published". */
  name: string | null;
  direction: string | null;
  mandatory: string | null;
  inboundServices: string[];
  outboundServices: string[];
  apiIds: string[];
  sourceUrl: string;
}

/**
 * Something SAP states it does not support (SapNotSupported).
 *
 * Pack-level, not per scope item, and that is a measurement rather than a
 * design preference: exactly 1 of the 539 rows carries a scope-item code. The
 * register keys on capability and country instead, so that is how the pack
 * carries it.
 */
export interface TobeRestriction {
  capability: string;
  /** Null on 264 of 539 rows: SAP states it about the product, not a country. */
  country: string | null;
  whatIsNotSupported: string;
  statementVerbatim: string;
  sourceUrl: string;
  /**
   * SAP's own words about whether support is planned, verbatim — this is free
   * text in the register, not a flag, and reducing it to a boolean would turn
   * "not yet supported in the optimized view mode" into a yes.
   */
  futureSupportStated: string | null;
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
  /** The engagement's country footprint, ISO-3166-1 alpha-2. Empty = not stated. */
  countries: string[];
  /** Forms per scope code (SapFormTemplate). */
  forms: Record<string, TobeForm[]>;
  /** Integrations per scope code (ScopeItemCommScenario × SapCommScenario). */
  integrations: Record<string, TobeIntegration[]>;
  /** Restrictions for the footprint. Pack-level: the register carries no scope codes. */
  restrictions: TobeRestriction[];
  /** Consultant-only notes per scope code; stripped from the client view. */
  consultantNotes?: Record<string, string>;
}

export interface TobeEvidence {
  scopeCode: string;
  /**
   * What publication this step came from, named precisely enough to look up.
   * WS6 hardcoded "BPD <release>" here and in the L3 row builder; with two
   * sources that string would be a lie on 652 of 661 scope items.
   */
  citation: string;
  source: TobeStepSource;
  sscuiId: string | null;
  questionIds: string[];
}

export interface TobeStepDoc {
  index: number;
  name: string;
  role: string;
  app: string;
  expected: string;
  /** The source publishes no expected result for this step. */
  expectedUnpublished: boolean;
  /** Which publication this step's content came from. */
  stepSource: TobeStepSource;
  /** SAP_STANDARD_CITED, or CONFIRM_WITH_CLIENT and why. */
  disposition: TobeDisposition;
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
  /**
   * No source publishes steps for this code — the item renders as a
   * placeholder, never invented steps. WS6 called this `hasBpd` when the BPD
   * files were the only source; 652 of 661 scope items now get their steps
   * from the process-step master instead, so the name would mislead.
   */
  hasSteps: boolean;
  /** Which publication the steps came from; null when there are none. */
  stepSource: TobeStepSource | null;
  /** Steps the engagement's country footprint excluded. Reported, never silent. */
  stepsExcludedByCountry: number;
  roles: string[];
  steps: TobeStepDoc[];
  /** Forms SAP ships for this scope item. */
  forms: TobeForm[];
  /** Integrations SAP publishes for this scope item. */
  integrations: TobeIntegration[];
  /** The pre-award reading for the item as a whole. */
  disposition: TobeDisposition;
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
  /** The engagement's country footprint. Empty means it was never stated. */
  countries: string[];
  chains: TobeChainDoc[];
  scopeItems: TobeScopeItemDoc[];
  /**
   * What SAP states it does not support, for this footprint. Pack-level
   * because the register carries no scope-item codes on 538 of its 539 rows.
   */
  restrictions: TobeRestriction[];
  summary: {
    scopeItems: number;
    steps: number;
    byState: Record<TobeStepState, number>;
    /** How many in-scope items took their steps from each publication. */
    bySource: Record<TobeStepSource, number>;
    /** Steps by pre-award reading — the bid pack's headline split. */
    byDisposition: Record<TobeDisposition, number>;
    /** In-scope items with no published steps from either source. */
    itemsWithoutSteps: number;
    /** Steps the country footprint excluded, across every in-scope item. */
    stepsExcludedByCountry: number;
    forms: number;
    integrations: number;
    restrictions: number;
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
