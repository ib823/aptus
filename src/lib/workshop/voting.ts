/** Phase 21: Workshop voting logic */

import { prisma } from "@/lib/db/prisma";
import { computeVoteTally, type VoteInput } from "./vote-tally";
import { logActivity } from "@/lib/collaboration/activity-logger";
import { logDecision } from "@/lib/audit/decision-logger";
import type { UserRole } from "@/types/assessment";

export interface SubmitVoteInput {
  sessionId: string;
  userId: string;
  userName: string;
  processStepId: string;
  classification: string;
  confidence?: string | undefined;
  notes?: string | undefined;
}

/**
 * Submit or update a vote. Observers cannot vote.
 */
export async function submitVote(input: SubmitVoteInput) {
  // Check attendee is not an observer
  const attendee = await prisma.workshopAttendee.findUnique({
    where: {
      sessionId_userId: {
        sessionId: input.sessionId,
        userId: input.userId,
      },
    },
    select: { role: true },
  });

  if (attendee?.role === "observer") {
    throw new Error("Observers cannot vote");
  }

  return prisma.workshopVote.upsert({
    where: {
      sessionId_processStepId_userId: {
        sessionId: input.sessionId,
        processStepId: input.processStepId,
        userId: input.userId,
      },
    },
    update: {
      classification: input.classification,
      confidence: input.confidence ?? null,
      notes: input.notes ?? null,
      votedAt: new Date(),
    },
    create: {
      sessionId: input.sessionId,
      processStepId: input.processStepId,
      userId: input.userId,
      classification: input.classification,
      confidence: input.confidence ?? null,
      notes: input.notes ?? null,
    },
  });
}

/**
 * Get the vote tally for a specific step in a session.
 */
export async function getVoteTally(sessionId: string, processStepId: string) {
  const votes = await prisma.workshopVote.findMany({
    where: { sessionId, processStepId },
    select: { userId: true, classification: true },
  });

  const voteInputs: VoteInput[] = votes.map((v) => ({
    userId: v.userId,
    classification: v.classification,
  }));

  return computeVoteTally(processStepId, voteInputs);
}

/**
 * Finalize a vote: write the official StepResponse with the chosen classification.
 * Only facilitator or platform_admin should call this.
 */
export async function finalizeVote(
  sessionId: string,
  processStepId: string,
  classification: string,
  facilitatorId: string,
  facilitatorName: string,
  facilitatorRole: UserRole,
  notes?: string | undefined,
) {
  const session = await prisma.workshopSession.findUnique({
    where: { id: sessionId },
    select: { assessmentId: true },
  });

  if (!session) throw new Error("Session not found");

  // Get the step to find scopeItemId
  const step = await prisma.processStep.findUnique({
    where: { id: processStepId },
    select: { id: true, scopeItemId: true, actionTitle: true },
  });

  if (!step) throw new Error("Process step not found");

  // Get vote tally for the decision log
  await getVoteTally(sessionId, processStepId);

  // Upsert StepResponse
  const response = await prisma.stepResponse.upsert({
    where: {
      assessmentId_processStepId: {
        assessmentId: session.assessmentId,
        processStepId,
      },
    },
    update: {
      fitStatus: classification,
      clientNote: notes ?? null,
    },
    create: {
      assessmentId: session.assessmentId,
      processStepId,
      fitStatus: classification,
      clientNote: notes ?? null,
    },
  });

  // Log decision
  await logDecision({
    assessmentId: session.assessmentId,
    entityType: "step_response",
    entityId: processStepId,
    action: "MARKED_FIT",
    newValue: classification,
    actor: facilitatorName,
    actorRole: facilitatorRole,
    reason: `Workshop vote finalized (session: ${sessionId})`,
  });

  logActivity({
    assessmentId: session.assessmentId,
    actorId: facilitatorId,
    actorName: facilitatorName,
    actorRole: "facilitator",
    actionType: "classified_steps",
    summary: `finalized workshop vote for "${step.actionTitle}" as ${classification}`,
    entityType: "process_step",
    entityId: processStepId,
  }).catch((err) => console.error("[ACTIVITY] Failed to log workshop vote finalization:", err));

  return response;
}
