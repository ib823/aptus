import { describe, it, expect } from "vitest";
import { renderMinutesMarkdown } from "@/lib/workshop/minutes-renderer";
import type { WorkshopMinutesData } from "@/types/workshop";

describe("renderMinutesMarkdown (Phase 21)", () => {
  const baseData: WorkshopMinutesData = {
    title: "Finance Review Workshop",
    sessionCode: "ABC123",
    facilitatorName: "John Smith",
    scheduledAt: "2025-06-01T10:00:00Z",
    startedAt: "2025-06-01T10:05:00Z",
    completedAt: "2025-06-01T12:00:00Z",
    attendees: [
      { name: "Alice", role: "facilitator", joinedAt: "2025-06-01T10:00:00Z" },
      { name: "Bob", role: "attendee", joinedAt: "2025-06-01T10:02:00Z" },
    ],
    decisions: [
      {
        processStepId: "step-1",
        stepTitle: "Create Purchase Order",
        classification: "FIT",
        totalVotes: 5,
        consensusPercentage: 80,
      },
    ],
    actionItems: [
      {
        title: "Review gap for payment processing",
        assignedToName: "Alice",
        dueDate: "2025-06-15T00:00:00Z",
        status: "open",
        priority: "high",
      },
    ],
    agenda: [
      { id: "a1", title: "Procure-to-Pay Review", status: "completed", order: 1 },
      { id: "a2", title: "Order-to-Cash Review", status: "pending", order: 2, duration: 30 },
    ],
    statistics: {
      totalStepsReviewed: 25,
      fitCount: 15,
      configureCount: 5,
      gapCount: 3,
      naCount: 2,
      averageConsensus: 75,
    },
  };

  it("renders title and session info", () => {
    const md = renderMinutesMarkdown(baseData);
    expect(md).toContain("# Workshop Minutes: Finance Review Workshop");
    expect(md).toContain("**Session Code:** ABC123");
    expect(md).toContain("**Facilitator:** John Smith");
  });

  it("renders attendees table", () => {
    const md = renderMinutesMarkdown(baseData);
    expect(md).toContain("## Attendees");
    expect(md).toContain("| Alice | facilitator |");
    expect(md).toContain("| Bob | attendee |");
  });

  it("renders agenda with status checkboxes", () => {
    const md = renderMinutesMarkdown(baseData);
    expect(md).toContain("## Agenda");
    expect(md).toContain("- [x] Procure-to-Pay Review");
    expect(md).toContain("- [ ] Order-to-Cash Review (30 min)");
  });

  it("renders decisions table", () => {
    const md = renderMinutesMarkdown(baseData);
    expect(md).toContain("## Decisions");
    expect(md).toContain("| Create Purchase Order | **FIT** | 5 | 80% |");
  });

  it("renders action items table", () => {
    const md = renderMinutesMarkdown(baseData);
    expect(md).toContain("## Action Items");
    expect(md).toContain("| 1 | Review gap for payment processing | Alice |");
    expect(md).toContain("| high | open |");
  });

  it("renders statistics", () => {
    const md = renderMinutesMarkdown(baseData);
    expect(md).toContain("## Statistics");
    expect(md).toContain("**Total Steps Reviewed:** 25");
    expect(md).toContain("**FIT:** 15");
    expect(md).toContain("**GAP:** 3");
    expect(md).toContain("**Average Consensus:** 75%");
  });

  it("handles empty attendees", () => {
    const data = { ...baseData, attendees: [] };
    const md = renderMinutesMarkdown(data);
    expect(md).toContain("_No attendees recorded._");
  });

  it("handles empty decisions", () => {
    const data = { ...baseData, decisions: [] };
    const md = renderMinutesMarkdown(data);
    expect(md).toContain("_No decisions recorded._");
  });

  it("handles empty action items", () => {
    const data = { ...baseData, actionItems: [] };
    const md = renderMinutesMarkdown(data);
    expect(md).toContain("_No action items recorded._");
  });

  it("handles empty agenda", () => {
    const data = { ...baseData, agenda: [] };
    const md = renderMinutesMarkdown(data);
    // No agenda section rendered
    expect(md).not.toContain("## Agenda");
  });

  it("handles missing optional dates", () => {
    const data: WorkshopMinutesData = {
      ...baseData,
      scheduledAt: undefined,
      startedAt: undefined,
      completedAt: undefined,
    };
    const md = renderMinutesMarkdown(data);
    expect(md).not.toContain("**Scheduled:**");
    expect(md).not.toContain("**Started:**");
    expect(md).not.toContain("**Completed:**");
  });

  it("handles action items without assignee or due date", () => {
    const data: WorkshopMinutesData = {
      ...baseData,
      actionItems: [
        {
          title: "Unassigned task",
          assignedToName: undefined,
          dueDate: undefined,
          status: "open",
          priority: "low",
        },
      ],
    };
    const md = renderMinutesMarkdown(data);
    expect(md).toContain("| 1 | Unassigned task | - | - | low | open |");
  });
});
