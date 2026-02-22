/** Phase 12: Step grouping engine — groups steps by category/activity for sidebar navigation */

import type { StepCategory } from "@/types/assessment";
import { classifyStep, isStepClassifiable, getStepCategoryLabel } from "./step-classifier";

export interface StepInGroup {
  id: string;
  sequence: number;
  actionTitle: string;
  stepType: string;
  activityTitle: string | null;
  fitStatus: string;
  isClassifiable: boolean;
  stepCategory: StepCategory;
}

export interface StepGroup {
  key: string;
  label: string;
  category: StepCategory;
  steps: StepInGroup[];
  classifiableCount: number;
}

interface InputStep {
  id: string;
  sequence: number;
  actionTitle: string;
  stepType: string;
  activityTitle?: string | null;
  fitStatus?: string;
  stepCategory?: string | null;
  isClassifiable?: boolean | null;
  tag?: string | null;
  activity?: string | null;
}

/**
 * Groups steps by their category and activity for sidebar navigation.
 * Non-classifiable steps (REFERENCE, SYSTEM_ACCESS, TEST_INFO) are grouped
 * under their category label. Classifiable steps are grouped by activity.
 * Group ordering matches step encounter order (not alphabetical).
 */
export function groupSteps(steps: InputStep[]): StepGroup[] {
  if (steps.length === 0) return [];

  const groupOrder: string[] = [];
  const groupMap = new Map<string, StepGroup>();

  for (const step of steps) {
    // Determine category: prefer pre-computed stepCategory, then tag (more specific), then stepType
    const category: StepCategory = (step.stepCategory as StepCategory) ??
      classifyStep(step.tag ?? step.stepType ?? null);
    const classifiable = step.isClassifiable ?? isStepClassifiable(category);

    let groupKey: string;
    let label: string;

    if (!classifiable) {
      groupKey = `__category__:${category}`;
      label = getStepCategoryLabel(category);
    } else {
      const activityName = step.activityTitle ?? step.activity ?? "Process";
      groupKey = `activity:${activityName}`;
      label = activityName;
    }

    if (!groupMap.has(groupKey)) {
      groupOrder.push(groupKey);
      groupMap.set(groupKey, {
        key: groupKey,
        label,
        category,
        steps: [],
        classifiableCount: 0,
      });
    }

    const group = groupMap.get(groupKey)!;
    group.steps.push({
      id: step.id,
      sequence: step.sequence,
      actionTitle: step.actionTitle,
      stepType: step.stepType,
      activityTitle: step.activityTitle ?? step.activity ?? null,
      fitStatus: step.fitStatus ?? "PENDING",
      isClassifiable: classifiable,
      stepCategory: category,
    });

    if (classifiable) {
      group.classifiableCount++;
    }
  }

  return groupOrder.map((key) => groupMap.get(key)!);
}

/**
 * Compute classifiable progress across all groups.
 */
export function computeClassifiableProgress(groups: StepGroup[]): {
  totalClassifiable: number;
  totalClassified: number;
  totalSteps: number;
  percentage: number;
} {
  let totalClassifiable = 0;
  let totalClassified = 0;
  let totalSteps = 0;

  for (const group of groups) {
    totalSteps += group.steps.length;
    for (const step of group.steps) {
      if (step.isClassifiable) {
        totalClassifiable++;
        if (step.fitStatus !== "PENDING") {
          totalClassified++;
        }
      }
    }
  }

  return {
    totalClassifiable,
    totalClassified,
    totalSteps,
    percentage: totalClassifiable > 0
      ? Math.round((totalClassified / totalClassifiable) * 100)
      : 0,
  };
}
