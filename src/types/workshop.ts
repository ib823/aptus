/** Phase 21: Workshop Management types */

export type WorkshopStatus = "scheduled" | "in_progress" | "completed" | "cancelled";

export type AttendeeRole = "facilitator" | "attendee" | "observer";

export type ConnectionStatus = "connected" | "disconnected" | "away";

export type VoteClassification = "FIT" | "CONFIGURE" | "GAP" | "NA";

export type VoteConfidence = "high" | "medium" | "low";

export type ActionItemStatus = "open" | "in_progress" | "completed" | "cancelled";

export type ActionItemPriority = "low" | "medium" | "high" | "critical";

/** Agenda item in a workshop session */
export interface AgendaItem {
  id: string;
  title: string;
  scopeItemId?: string | undefined;
  duration?: number | undefined; // minutes
  status: "pending" | "in_progress" | "completed" | "skipped";
  order: number;
}

/** Tally result for a single classification */
export interface VoteTallyEntry {
  classification: VoteClassification;
  count: number;
  percentage: number;
  voters: string[];
}

/** Full vote tally for a process step */
export interface VoteTally {
  processStepId: string;
  totalVotes: number;
  entries: VoteTallyEntry[];
  consensus: VoteClassification | null;
  consensusPercentage: number;
  hasConsensus: boolean;
}

/** Workshop attendee info */
export interface WorkshopAttendeeInfo {
  id: string;
  userId: string;
  name: string;
  role: AttendeeRole;
  connectionStatus: ConnectionStatus;
  isFollowing: boolean;
  isPresenter: boolean;
  joinedAt: string;
}

/** Workshop minutes data for renderer */
export interface WorkshopMinutesData {
  title: string;
  sessionCode: string;
  scheduledAt?: string | undefined;
  startedAt?: string | undefined;
  completedAt?: string | undefined;
  facilitatorName: string;
  attendees: Array<{
    name: string;
    role: string;
    joinedAt: string;
  }>;
  decisions: Array<{
    processStepId: string;
    stepTitle: string;
    classification: string;
    totalVotes: number;
    consensusPercentage: number;
  }>;
  actionItems: Array<{
    title: string;
    assignedToName?: string | undefined;
    dueDate?: string | undefined;
    status: string;
    priority: string;
  }>;
  agenda: AgendaItem[];
  statistics: {
    totalStepsReviewed: number;
    fitCount: number;
    configureCount: number;
    gapCount: number;
    naCount: number;
    averageConsensus: number;
  };
}
