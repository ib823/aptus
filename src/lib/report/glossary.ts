/**
 * Plain-language glossary — single source of truth for SAP-term-to-client-language
 * translations across the entire bundle (PDFs, XLSX, app pill hovers).
 *
 * Mirrors §2.5 of `docs/APTUS-REPORTS-DESIGN-SPEC.md` v1.2. When you change a label
 * here, the spec doc and the design mocks must be updated too — they are the
 * canonical visual reference.
 *
 * Voice ladder (spec §5.4):
 *   - PLAIN tier (`label` + `whatItMeansForYou`) → client-facing PDFs
 *   - HYBRID tier (`label` only) → XLSX column headers, functional-lead PDFs
 *   - TECHNICAL tier (`term`) → audit / config / step-detail registers only
 */

import type { FitStatus, ResolutionType } from "@/types/assessment";

/** The dot color tier — matches print.css `.dot-{tier}` and the app's status pill. */
export type DotTier = "success" | "warning" | "info" | "danger" | "neutral";

/** Hex values for each dot tier — used by jsPDF code that needs raw colors. */
export const DOT_HEX: Record<DotTier, string> = {
  success: "#15803D",
  warning: "#B45309",
  info: "#1D4ED8",
  danger: "#B91C1C",
  neutral: "#52525B",
};

/** Light-tint hex (e.g. for XLSX outcome-cell conditional formatting). */
export const DOT_TINT_HEX: Record<DotTier, string> = {
  success: "#DCFCE7",
  warning: "#FEF3C7",
  info: "#DBEAFE",
  danger: "#FEE2E2",
  neutral: "#F4F4F5",
};

export interface GlossaryEntry {
  /** Technical / consulting term — TECHNICAL tier. Never appears in client PDFs. */
  term: string;
  /** Plain-language label — PLAIN/HYBRID tier. Safe everywhere. */
  label: string;
  /** ≤ 18-word client-facing explanation (spec §2.5 column 3). */
  explanation: string;
  /** Optional dot color when this entry doubles as a status indicator. */
  dot?: DotTier;
  /**
   * Optional one-liner for the "What it means for you" row in finding cards
   * (spec §4.4). Only the 8 ResolutionType entries carry this.
   */
  whatItMeansForYou?: string;
}

/** ResolutionType → outcome entry. The 8 outcomes a client sees in the Findings PDF. */
export const OUTCOME: Record<ResolutionType, GlossaryEntry> = {
  FIT: {
    term: "OOTB / FIT",
    label: "Standard SAP",
    explanation: "The software does this exactly as you described, with no setup or code needed.",
    dot: "success",
    whatItMeansForYou: "Nothing to build. Available from day one of go-live.",
  },
  CONFIGURE: {
    term: "CONFIGURE",
    label: "Configurable",
    explanation: "The software does this, but our team needs to set it up for you. No code is written.",
    dot: "warning",
    whatItMeansForYou: "Our team configures it once. Future changes are admin-level — no developer needed.",
  },
  ADAPT_PROCESS: {
    term: "ADAPT_PROCESS",
    label: "Adapt to SAP",
    explanation: "We recommend adjusting how your team works to match SAP's standard way. Cheaper, future-proof.",
    dot: "warning",
    whatItMeansForYou: "We recommend adjusting how this is handled today. SAP's standard approach is more efficient and avoids ongoing customisation cost.",
  },
  ISV: {
    term: "ISV",
    label: "Trusted add-on",
    explanation: "A third-party product certified for SAP fills this gap. Less risk than building from scratch.",
    dot: "info",
    whatItMeansForYou: "We deploy a certified third-party product. The vendor maintains it; your team doesn't carry the support burden.",
  },
  KEY_USER_EXT: {
    term: "KEY_USER_EXT",
    label: "Power-user extension",
    explanation: "One of your business users can build this in SAP's no-code tool — no developer needed.",
    dot: "info",
    whatItMeansForYou: "One of your power users builds it in SAP's no-code tool. About half a day of work, no developer required.",
  },
  BTP_EXT: {
    term: "BTP_EXT",
    label: "Cloud add-on (BTP)",
    explanation: "We build a small companion app on SAP's cloud platform. Modern, modular, decoupled from core SAP.",
    dot: "info",
    whatItMeansForYou: "We build a small companion app on SAP's cloud platform. Stays separate from core SAP — easier upgrades.",
  },
  CUSTOM_ABAP: {
    term: "CUSTOM_ABAP",
    label: "Custom build",
    explanation: "We write new code inside SAP. Reserved for unique competitive advantage — used sparingly.",
    dot: "danger",
    whatItMeansForYou: "Unique to your business, so we build it in SAP. We've kept these to a minimum to protect your upgrade path.",
  },
  OUT_OF_SCOPE: {
    term: "OUT_OF_SCOPE",
    label: "Out of scope",
    explanation: "Not addressed in this phase. May be revisited later or handled outside SAP.",
    dot: "neutral",
    whatItMeansForYou: "Not addressed in this phase. Can be revisited later or handled outside SAP.",
  },
};

/** FitStatus → entry. The verdict scale used at the step level. */
export const FIT_STATUS_ENTRY: Record<FitStatus, GlossaryEntry> = {
  FIT: OUTCOME.FIT,
  CONFIGURE: OUTCOME.CONFIGURE,
  GAP: {
    term: "GAP",
    label: "Needs work",
    explanation: "SAP doesn't do this as standard — we've chosen one of the resolution options above.",
    dot: "danger",
  },
  NA: {
    term: "NA",
    label: "Not applicable",
    explanation: "This requirement doesn't apply to your business model. Closed with no further action.",
    dot: "neutral",
  },
  PENDING: {
    term: "PENDING",
    label: "Not yet reviewed",
    explanation: "Awaiting consultant review.",
    dot: "neutral",
  },
};

/**
 * The full §2.5 glossary table — ordered exactly as it should print on
 * `04_Requirements_Findings.pdf` page 2.
 */
export const GLOSSARY_ENTRIES: ReadonlyArray<GlossaryEntry> = [
  OUTCOME.FIT,
  OUTCOME.CONFIGURE,
  OUTCOME.ADAPT_PROCESS,
  OUTCOME.ISV,
  OUTCOME.KEY_USER_EXT,
  OUTCOME.BTP_EXT,
  OUTCOME.CUSTOM_ABAP,
  OUTCOME.OUT_OF_SCOPE,
  FIT_STATUS_ENTRY.GAP,
  FIT_STATUS_ENTRY.NA,
  {
    term: "Mandatory",
    label: "Must-have",
    explanation: "You flagged this requirement as non-negotiable. We've prioritised it accordingly.",
  },
  {
    term: "L1 / L2 / L3 / L4",
    label: "Process area / family / group / step",
    explanation: "SAP organises business processes in a 4-level tree. L4 is the most detailed (e.g. \"Create sales order\").",
  },
  {
    term: "Fit-to-standard",
    label: "Fit assessment",
    explanation: "The structured exercise of comparing your needs against what SAP does as standard.",
  },
  {
    term: "Granularity",
    label: "Detail level",
    explanation: "How deeply we analysed each process — coarse (whole area), medium (sub-area), fine (each step).",
  },
  {
    term: "Workstream",
    label: "Project track",
    explanation: "A parallel band of work (Finance, HR, Logistics, etc.) inside the overall project.",
  },
  {
    term: "ECC / S/4HANA",
    label: "Old SAP / new SAP",
    explanation: "ECC is the prior generation. S/4HANA is what you're moving to — faster, simpler, cloud-ready.",
  },
  {
    term: "SmartForms / Adobe Forms",
    label: "Document templates",
    explanation: "The SAP feature for designing printable / emailable documents (invoices, POs).",
  },
  {
    term: "Transaction code (Tcode)",
    label: "SAP screen",
    explanation: "A short-code shortcut that opens a specific SAP screen. Power users still use them.",
  },
  {
    term: "Fiori",
    label: "Modern SAP screens",
    explanation: "The new web-based SAP user interface. Mobile-friendly, role-based.",
  },
  {
    term: "OData / API",
    label: "Data feed",
    explanation: "A standard way for one system to read or update data in another. Used by add-ons and portals.",
  },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Plain-language label for a ResolutionType (e.g. "Trusted add-on" for "ISV"). */
export function outcomeLabel(rt: ResolutionType): string {
  return OUTCOME[rt].label;
}

/** "What it means for you" sentence for a Findings card. */
export function outcomeMeans(rt: ResolutionType): string {
  return OUTCOME[rt].whatItMeansForYou ?? OUTCOME[rt].explanation;
}

/** Status dot tier for a ResolutionType. */
export function outcomeDot(rt: ResolutionType): DotTier {
  return OUTCOME[rt].dot ?? "neutral";
}

/** Plain-language label for a FitStatus. */
export function fitStatusLabel(fs: FitStatus): string {
  return FIT_STATUS_ENTRY[fs].label;
}

/** Status dot tier for a FitStatus. */
export function fitStatusDot(fs: FitStatus): DotTier {
  return FIT_STATUS_ENTRY[fs].dot ?? "neutral";
}

/** Hex color for a dot tier — for jsPDF / SVG generation. */
export function dotHex(tier: DotTier): string {
  return DOT_HEX[tier];
}

/** Light tint hex — for XLSX conditional cell fills. */
export function dotTintHex(tier: DotTier): string {
  return DOT_TINT_HEX[tier];
}
