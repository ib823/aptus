/** Phase 23: Attention engine — pure functions for computing attention items */

import type { AttentionItem, AttentionSeverity } from "@/types/dashboard";

interface PendingStep {
  id: string;
  scopeItemId: string;
  actionTitle: string;
  staleDays?: number | undefined;
}

interface UnresolvedGap {
  id: string;
  scopeItemId: string;
  gapDescription: string;
  createdAt: string;
}

interface OverdueDeadline {
  id: string;
  title: string;
  dueDate: string;
  assessmentId: string;
}

interface ConflictItem {
  id: string;
  entityType: string;
  entityId: string;
  assessmentId: string;
  createdAt: string;
}

interface StaleAssessment {
  id: string;
  companyName: string;
  lastActivityAt: string;
  staleDays: number;
}

/**
 * Compare two attention items for sorting: critical first, then warning, then info.
 * Within the same severity, more recent items come first.
 */
export function priorityComparator(a: AttentionItem, b: AttentionItem): number {
  const severityOrder: Record<AttentionSeverity, number> = {
    critical: 0,
    warning: 1,
    info: 2,
  };

  const severityDiff = severityOrder[a.severity] - severityOrder[b.severity];
  if (severityDiff !== 0) return severityDiff;

  // More recent first
  return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
}

/**
 * Compute attention items from pre-fetched data sources.
 * All inputs are plain data — no DB calls.
 */
export function computeAttentionItems(
  pendingSteps: PendingStep[],
  unresolvedGaps: UnresolvedGap[],
  overdueDeadlines: OverdueDeadline[],
  conflicts: ConflictItem[],
  staleAssessments: StaleAssessment[],
): AttentionItem[] {
  const items: AttentionItem[] = [];
  const now = new Date().toISOString();

  // Overdue deadlines are critical
  for (const deadline of overdueDeadlines) {
    items.push({
      id: `deadline-${deadline.id}`,
      severity: "critical",
      title: `Overdue: ${deadline.title}`,
      description: `Deadline was due on ${new Date(deadline.dueDate).toLocaleDateString()}.`,
      entityType: "deadline",
      entityId: deadline.id,
      actionUrl: `/assessments/${deadline.assessmentId}`,
      createdAt: deadline.dueDate,
    });
  }

  // Unresolved conflicts are warnings
  for (const conflict of conflicts) {
    items.push({
      id: `conflict-${conflict.id}`,
      severity: "warning",
      title: "Unresolved Classification Conflict",
      description: `Conflict on ${conflict.entityType} ${conflict.entityId} needs resolution.`,
      entityType: "conflict",
      entityId: conflict.id,
      actionUrl: `/assessments/${conflict.assessmentId}`,
      createdAt: conflict.createdAt,
    });
  }

  // Unresolved gaps > 7 days are warnings
  for (const gap of unresolvedGaps) {
    const ageMs = Date.now() - new Date(gap.createdAt).getTime();
    const ageDays = ageMs / (1000 * 60 * 60 * 24);
    if (ageDays > 7) {
      items.push({
        id: `gap-${gap.id}`,
        severity: "warning",
        title: "Unresolved Gap",
        description: gap.gapDescription.slice(0, 100),
        entityType: "gap",
        entityId: gap.id,
        createdAt: gap.createdAt,
      });
    }
  }

  // Stale assessments are info/warning based on days
  for (const assessment of staleAssessments) {
    items.push({
      id: `stale-${assessment.id}`,
      severity: assessment.staleDays > 14 ? "warning" : "info",
      title: `Stale Assessment: ${assessment.companyName}`,
      description: `No activity for ${assessment.staleDays} days.`,
      entityType: "assessment",
      entityId: assessment.id,
      actionUrl: `/assessments/${assessment.id}`,
      createdAt: assessment.lastActivityAt,
    });
  }

  // Pending steps with stale data are info
  for (const step of pendingSteps) {
    if (step.staleDays && step.staleDays > 7) {
      items.push({
        id: `step-${step.id}`,
        severity: "info",
        title: `Pending Step: ${step.actionTitle}`,
        description: `Step has been pending for ${step.staleDays} days.`,
        entityType: "step",
        entityId: step.id,
        createdAt: now,
      });
    }
  }

  return items.sort(priorityComparator);
}
