/** Phase 12: Step classification engine — pure functions */

import type { StepCategory } from "@/types/assessment";

const STEP_TYPE_TO_CATEGORY: Record<string, StepCategory> = {
  // System access steps — non-classifiable
  LOGON: "SYSTEM_ACCESS",
  ACCESS_APP: "SYSTEM_ACCESS",

  // Reference steps — non-classifiable
  INFORMATION: "REFERENCE",
  NAVIGATION: "REFERENCE",

  // Business process steps — classifiable
  DATA_ENTRY: "BUSINESS_PROCESS",
  ACTION: "BUSINESS_PROCESS",
  VERIFICATION: "BUSINESS_PROCESS",
  PROCESS_STEP: "BUSINESS_PROCESS",
};

const CLASSIFIABLE_CATEGORIES: StepCategory[] = [
  "BUSINESS_PROCESS",
  "CONFIGURATION",
  "REPORTING",
  "MASTER_DATA",
];

/**
 * Classify a step type into a category.
 */
export function classifyStep(stepType: string): StepCategory {
  return STEP_TYPE_TO_CATEGORY[stepType] ?? "BUSINESS_PROCESS";
}

/**
 * Check if a step category requires review (is classifiable).
 */
export function isStepClassifiable(category: StepCategory): boolean {
  return CLASSIFIABLE_CATEGORIES.includes(category);
}

/**
 * Derive a group key for grouping related steps.
 */
export function deriveGroupKey(step: { stepCategory: string; activityTitle: string | null }): string {
  const title = step.activityTitle ?? "ungrouped";
  return `${step.stepCategory}:${title}`;
}

/**
 * Derive a human-readable group label.
 */
export function deriveGroupLabel(step: { stepCategory: string; activityTitle: string | null }): string {
  const categoryLabels: Record<string, string> = {
    BUSINESS_PROCESS: "Business Process",
    CONFIGURATION: "Configuration",
    REPORTING: "Reporting",
    MASTER_DATA: "Master Data",
    REFERENCE: "Reference",
    SYSTEM_ACCESS: "System Access",
    TEST_INFO: "Test Information",
  };

  const label = categoryLabels[step.stepCategory] ?? step.stepCategory;
  if (step.activityTitle) {
    return `${label} — ${step.activityTitle}`;
  }
  return label;
}
