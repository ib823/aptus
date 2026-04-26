/**
 * Barrel export for Aptus shared components (App-2 of 8 redesign phases).
 *
 * Subsequent phases (App-3 onwards) import from "@/components/aptus".
 *
 * Convention: every component name starts with "Aptus" to make it visually
 * obvious in code reviews when a component is from the new design system
 * vs the existing shadcn/SAP-styled components.
 */

export { AptusMark, AptusWordmark } from "./AptusMark";
export { StatusPill, type StatusPillTone } from "./StatusPill";
export {
  CoverageBar,
  CoverageLegend,
  NumStat,
  Dot,
} from "./CoverageBar";
export {
  StepRail,
  STEPS,
  type AptusStep,
} from "./StepRail";

// App-3 — app shell
export { AptusShell } from "./AptusShell";
export { AptusTopbar } from "./AptusTopbar";
export { AptusSideRail } from "./AptusSideRail";
export { AptusUserMenu, type AptusUserMenuUser } from "./AptusUserMenu";

// App-4 — assessments list
export { AptusAssessmentsList } from "./AptusAssessmentsList";

// App-5 — assessment shell (5-step rail) + per-step sub-tabs
export { AptusAssessmentShell } from "./AptusAssessmentShell";
export { StepSubTabs, type StepSubTab } from "./StepSubTabs";

// App-7 — Cmd-K command palette (global ⌘K / Ctrl+K)
export { AptusCmdKProvider, useAptusCmdK } from "./AptusCmdK";
