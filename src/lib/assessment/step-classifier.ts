/** Phase 12: Step classification engine — pure functions */

import type { StepCategory } from "@/types/assessment";

const STEP_TYPE_TO_CATEGORY: Record<string, StepCategory> = {
  // System access steps — non-classifiable (uppercase DB format)
  LOGON: "SYSTEM_ACCESS",
  LOGOFF: "SYSTEM_ACCESS",
  ACCESS_APP: "SYSTEM_ACCESS",

  // Reference steps — non-classifiable
  INFORMATION: "REFERENCE",
  NAVIGATION: "REFERENCE",

  // Business process steps — classifiable
  DATA_ENTRY: "BUSINESS_PROCESS",
  ACTION: "BUSINESS_PROCESS",
  VERIFICATION: "BUSINESS_PROCESS",
  PROCESS_STEP: "BUSINESS_PROCESS",

  // Lowercase SAP tag format (case-insensitive lookup via normalisation)
  logon: "SYSTEM_ACCESS",
  logoff: "SYSTEM_ACCESS",
  information: "REFERENCE",
  testprocedure: "TEST_INFO",
  businessprocess: "BUSINESS_PROCESS",
  configuration: "CONFIGURATION",
  reporting: "REPORTING",
  masterdata: "MASTER_DATA",
};

const CLASSIFIABLE_CATEGORIES: StepCategory[] = [
  "BUSINESS_PROCESS",
  "CONFIGURATION",
  "REPORTING",
  "MASTER_DATA",
];

/**
 * Classify a step type into a category.
 * Handles both uppercase DB format (LOGON, DATA_ENTRY) and
 * lowercase SAP tag format (logon, businessprocess, etc.) via case-insensitive lookup.
 */
export function classifyStep(stepType: string | null): StepCategory {
  if (stepType == null || stepType.trim() === "") return "BUSINESS_PROCESS";
  // Direct lookup first (covers uppercase DB format)
  const direct = STEP_TYPE_TO_CATEGORY[stepType];
  if (direct) return direct;
  // Case-insensitive fallback (covers mixed-case SAP tags like "LogOn", "BusinessProcess")
  const normalised = stepType.toLowerCase().trim();
  return STEP_TYPE_TO_CATEGORY[normalised] ?? "BUSINESS_PROCESS";
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
  const label = getStepCategoryLabel(step.stepCategory as StepCategory);
  if (step.activityTitle) {
    return `${label} — ${step.activityTitle}`;
  }
  return label;
}

/** Non-classifiable categories (used by grouper) */
export const NON_CLASSIFIABLE_CATEGORIES: StepCategory[] = [
  "REFERENCE",
  "SYSTEM_ACCESS",
  "TEST_INFO",
];

/**
 * Human-readable label for a step category.
 */
export function getStepCategoryLabel(category: StepCategory): string {
  const labels: Record<StepCategory, string> = {
    BUSINESS_PROCESS: "Business Process",
    CONFIGURATION: "Configuration",
    REPORTING: "Reporting",
    MASTER_DATA: "Master Data",
    REFERENCE: "Reference",
    SYSTEM_ACCESS: "System Access",
    TEST_INFO: "Test Information",
  };
  return labels[category] ?? category;
}

/**
 * Tailwind color class for a step category badge.
 */
export function getStepCategoryColor(category: StepCategory): string {
  const colors: Record<StepCategory, string> = {
    BUSINESS_PROCESS: "bg-blue-100 text-blue-700",
    CONFIGURATION: "bg-purple-100 text-purple-700",
    REPORTING: "bg-indigo-100 text-indigo-700",
    MASTER_DATA: "bg-teal-100 text-teal-700",
    REFERENCE: "bg-gray-100 text-gray-600",
    SYSTEM_ACCESS: "bg-gray-100 text-gray-500",
    TEST_INFO: "bg-gray-100 text-gray-500",
  };
  return colors[category] ?? "bg-gray-100 text-gray-600";
}
