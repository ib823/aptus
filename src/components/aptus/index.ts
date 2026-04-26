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
