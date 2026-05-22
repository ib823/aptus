/**
 * Fit-to-Standard Workbench — shared TypeScript types
 *
 * These types describe the data shape consumed by the workbench and preview
 * pages. They are framework-agnostic; the same types power server-side
 * loading, client-side interactivity, and the Excel export.
 */

/** A Tier-1 decision the executive sponsor signs off on pre-onboarding. */
export interface Decision {
  /** Stable identifier (e.g. "d1", "d2") — used as React key + Excel anchor. */
  id: string;

  /** 3–6 word title shown in the workbench. */
  title: string;

  /** 1–2 sentence plain-language description of the choice. */
  summary: string;

  /** Display reference shown under the title (e.g. "102495 — Configure Sales Document Types"). */
  sscui: string;

  /** Bare SSCUI ID for the Excel export and Cloud ALM linkage. */
  sscui_id: string;

  /** SSCUI display name for the Excel export. */
  sscui_name: string;

  /** What "accept standard" looks like. */
  std_desc: string;

  /** What "configure via SSCUI" looks like (included in base scope). */
  cfg_desc: string;

  /** What "custom development" looks like (chargeable, includes effort hint). */
  cst_desc: string;

  /** Estimated days for the custom option. */
  effort: number;

  /** Extensibility approach for the team backlog (e.g. "Developer Extensibility"). */
  custom_type: string;

  /** Upgrade impact qualifier (e.g. "Medium — retest each release"). */
  ext_impact: string;

  /** RICEFW classification: R / I / C / E / F / W. */
  ricefw_class: string;

  // ───────────────────────────────────────────────────────────────────
  // BDC enhancement fields — added for the first-wave Enhanced Workbench
  // (SAP Business-Driven Configuration model). Optional so the existing
  // hand-curated Tier-1 scope items (1IQ, BD9, BDG, ...) stay valid
  // without touching their data files. The new O2C-Sales value-stream
  // dataset populates these.
  // ───────────────────────────────────────────────────────────────────

  /** SAP BDC Level — "L1" (DDA confirm), "L2" (workbench affirm-set),
   * "L3" (workshop). Omitted on legacy Tier-1 items; treat as "L2". */
  level?: 'L1' | 'L2' | 'L3';

  /** Area / Topic from the SAP BDC questionnaire (e.g. "Organization",
   * "Sales Order Management and Processing — Sales Documents"). Drives
   * the area-band grouping in the enhanced workbench UI. */
  area_topic?: string;

  /** Scope item codes the SAP source flags as relevant (e.g. ["BD9",
   * "2EQ", "I9I"]). Display-only. */
  scope_item_refs?: string[];

  /** "narrative" = free-text Business Overview question (4 of 28 in
   * O2C-Sales). "decision" = the standard adopt/discuss/deviate
   * card. Defaults to "decision" when undefined for back-compat. */
  answer_kind?: 'narrative' | 'decision';

  /** Verbatim SAP question text from the BDC source. Shown in the
   * "Show SAP source" expander. */
  sap_verbatim?: string;

  /** Consultant-curated plain-language rephrase shown on the card. Null
   * until curated — page falls back to sap_verbatim. */
  client_rephrase?: string | null;
}

/** Choice surface for each decision. */
export type DecisionChoice = "open" | "std" | "cfg" | "cst";

/** Runtime state captured per decision as the user works through the workbench. */
export interface DecisionState {
  choice: DecisionChoice;
  effort: number;
  notes: string;
}

/** A single step in the BPD "Overview Table" (process steps). */
export interface ProcessStep {
  /** Short step name (e.g. "Create Sales Inquiry"). */
  name: string;

  /** Business role that performs the step. */
  role: string;

  /** SAP Fiori app used (e.g. "Manage Sales Inquiries (F2370)"). */
  app: string;

  /** Plain-language expected outcome. */
  expected: string;
}

/** Business role assigned to a scope item. */
export interface BusinessRole {
  /** Display name (e.g. "Internal Sales Representative"). */
  name: string;

  /** SAP role template ID (e.g. "SAP_BR_INTERNAL_SALES_REP"). */
  id: string;
}

/** Master data dependency (from the BPD). */
export interface MasterData {
  /** Data category (e.g. "Material", "Sold-to party"). */
  data: string;

  /** Sample value from the BPD. */
  sample: string;

  /** Details / explanation. */
  details: string;
}

/** Succeeding process this scope item flows into. */
export interface SucceedingProcess {
  /** Raw label from BPD (e.g. "BDG – Sales Quotation (optional)"). */
  raw: string;

  /** Description text. */
  description: string;
}

/** SSCUI reference relevant to this scope item. */
export interface SscuiRef {
  sscui_id: string;
  name: string;
  category: string;
  subarea: string;
}

/** Parsed content extracted from a single SAP BPD. */
export interface ScopeItemContent {
  /** Scope item code (e.g. "1IQ", "BD9"). */
  code: string;

  /** Display title (e.g. "Sales Inquiry"). */
  title: string;

  /** Plain-language process overview (1–2 sentences from BPD Purpose section). */
  overview: string;

  /** Primary role(s) using the process. */
  business_roles: BusinessRole[];

  /** SAP Fiori apps used. */
  fiori_apps: string[];

  /** Step-by-step process flow. */
  process_steps: ProcessStep[];

  /** Master data dependencies. */
  master_data: MasterData[];

  /** Processes that succeed this one. */
  succeeding_processes: SucceedingProcess[];

  /** Hand-curated Tier-1 decisions for the executive workbench. */
  decisions: Decision[];

  /** SSCUI references relevant to this scope item (audit appendix). */
  sscui_refs: SscuiRef[];

  /** Release identifier (e.g. "S/4HANA Cloud Public Edition 2602 — MY"). */
  release: string;

  /** Marks this catalog entry as a VALUE STREAM (e.g. O2C-SALES) rather
   * than a SAP scope item. The workbench page renders the enhanced
   * BDC-style UI (scorecard, area bands, default-to-standard decision
   * cards, narrative cards) instead of the legacy scope-item layout.
   * Optional + defaults to false so existing scope items are unchanged. */
  value_stream?: boolean;

  /** Optional source-of-record tag for the enhanced view sub-header
   * (e.g. "Generated from SAP BDC Questionnaire S4H_433 · release
   * S4CLD 2602"). */
  source_note?: string;
}

/** Excel export row shapes (typed for clarity). */
export interface ConfigBacklogRow {
  "Backlog ID": string;
  "Scope Item": string;
  "Scope Item Name": string;
  "Decision #": string;
  "Decision Title": string;
  "SSCUI ID": string;
  "SSCUI Name": string;
  "Client Intent (from workbench notes)": string;
  "Effort (days)": string;
  Status: string;
  Assignee: string;
  "Target Sprint / Wave": string;
  "Cloud ALM Req ID": string;
  Source: string;
}

export interface CustomBacklogRow {
  "RICEFW ID": string;
  "Scope Item": string;
  "Decision #": string;
  Title: string;
  "RICEFW Class": string;
  "Business Justification (from workbench notes)": string;
  "Extensibility Approach": string;
  "Upgrade Impact Risk": string;
  "Estimated Effort (days)": number;
  "Client Approved": string;
  Status: string;
  Assignee: string;
  "Target Sprint / Wave": string;
  "Regression Test Required": string;
  Source: string;
}
