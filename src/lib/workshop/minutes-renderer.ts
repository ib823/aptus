/** Phase 21: Workshop minutes markdown renderer */

import type { WorkshopMinutesData } from "@/types/workshop";

/**
 * Render workshop minutes as structured markdown.
 * Pure function: no side effects.
 *
 * @param data Workshop data for the minutes
 * @returns Markdown string
 */
export function renderMinutesMarkdown(data: WorkshopMinutesData): string {
  const lines: string[] = [];

  // Header
  lines.push(`# Workshop Minutes: ${data.title}`);
  lines.push("");
  lines.push(`**Session Code:** ${data.sessionCode}`);
  lines.push(`**Facilitator:** ${data.facilitatorName}`);

  if (data.scheduledAt) {
    lines.push(`**Scheduled:** ${formatDate(data.scheduledAt)}`);
  }
  if (data.startedAt) {
    lines.push(`**Started:** ${formatDate(data.startedAt)}`);
  }
  if (data.completedAt) {
    lines.push(`**Completed:** ${formatDate(data.completedAt)}`);
  }
  lines.push("");

  // Attendees
  lines.push("## Attendees");
  lines.push("");
  if (data.attendees.length === 0) {
    lines.push("_No attendees recorded._");
  } else {
    lines.push("| Name | Role | Joined |");
    lines.push("|------|------|--------|");
    for (const att of data.attendees) {
      lines.push(`| ${att.name} | ${att.role} | ${formatDate(att.joinedAt)} |`);
    }
  }
  lines.push("");

  // Agenda
  if (data.agenda.length > 0) {
    lines.push("## Agenda");
    lines.push("");
    for (const item of data.agenda) {
      const statusIcon = item.status === "completed" ? "[x]" : "[ ]";
      const duration = item.duration ? ` (${item.duration} min)` : "";
      lines.push(`- ${statusIcon} ${item.title}${duration}`);
    }
    lines.push("");
  }

  // Decisions
  lines.push("## Decisions");
  lines.push("");
  if (data.decisions.length === 0) {
    lines.push("_No decisions recorded._");
  } else {
    lines.push("| Step | Classification | Votes | Consensus |");
    lines.push("|------|----------------|-------|-----------|");
    for (const dec of data.decisions) {
      lines.push(
        `| ${dec.stepTitle} | **${dec.classification}** | ${dec.totalVotes} | ${dec.consensusPercentage}% |`,
      );
    }
  }
  lines.push("");

  // Action Items
  lines.push("## Action Items");
  lines.push("");
  if (data.actionItems.length === 0) {
    lines.push("_No action items recorded._");
  } else {
    lines.push("| # | Title | Assigned To | Due Date | Priority | Status |");
    lines.push("|---|-------|-------------|----------|----------|--------|");
    data.actionItems.forEach((item, index) => {
      const dueDate = item.dueDate ? formatDate(item.dueDate) : "-";
      const assignee = item.assignedToName ?? "-";
      lines.push(
        `| ${index + 1} | ${item.title} | ${assignee} | ${dueDate} | ${item.priority} | ${item.status} |`,
      );
    });
  }
  lines.push("");

  // Statistics
  lines.push("## Statistics");
  lines.push("");
  const stats = data.statistics;
  lines.push(`- **Total Steps Reviewed:** ${stats.totalStepsReviewed}`);
  lines.push(`- **FIT:** ${stats.fitCount}`);
  lines.push(`- **CONFIGURE:** ${stats.configureCount}`);
  lines.push(`- **GAP:** ${stats.gapCount}`);
  lines.push(`- **N/A:** ${stats.naCount}`);
  lines.push(`- **Average Consensus:** ${stats.averageConsensus}%`);
  lines.push("");

  return lines.join("\n");
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dateStr;
  }
}
