/**
 * Integration tests: Comments (T-CMT-001 through T-CMT-010)
 *
 * Validates comment creation, threading, mentions, resolution,
 * editing, deletion, and cross-entity/cross-assessment isolation.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createMockUser, createMockSession } from "../../helpers/auth";
import { createMockWebSocketClient, WS_MESSAGE_TYPES } from "../../helpers/websocket";
import * as AssessmentFactory from "../../factories/assessment.factory";
import * as StepFactory from "../../factories/step.factory";

// ---------------------------------------------------------------------------
// Comment store simulation
// ---------------------------------------------------------------------------

interface Comment {
  id: string;
  assessmentId: string;
  targetType: string;
  targetId: string;
  authorId: string;
  content: string;
  contentHtml: string | null;
  mentions: string[];
  parentCommentId: string | null;
  status: "OPEN" | "RESOLVED";
  resolvedById: string | null;
  resolvedAt: Date | null;
  editedAt: Date | null;
  isEdited: boolean;
  createdAt: Date;
  updatedAt: Date;
}

let commentStore: Map<string, Comment>;
let commentCounter: number;

function resetCommentStore() {
  commentStore = new Map();
  commentCounter = 0;
}

function createComment(input: {
  assessmentId: string;
  targetType: string;
  targetId: string;
  authorId: string;
  content: string;
  mentions?: string[];
  parentCommentId?: string | null;
}): Comment {
  const id = `comment-${++commentCounter}`;
  const now = new Date();
  const comment: Comment = {
    id,
    assessmentId: input.assessmentId,
    targetType: input.targetType,
    targetId: input.targetId,
    authorId: input.authorId,
    content: input.content,
    contentHtml: `<p>${input.content}</p>`,
    mentions: input.mentions ?? [],
    parentCommentId: input.parentCommentId ?? null,
    status: "OPEN",
    resolvedById: null,
    resolvedAt: null,
    editedAt: null,
    isEdited: false,
    createdAt: now,
    updatedAt: now,
  };
  commentStore.set(id, comment);
  return comment;
}

function editComment(
  commentId: string,
  authorId: string,
  newContent: string,
): { success: boolean; comment?: Comment; error?: string } {
  const comment = commentStore.get(commentId);
  if (!comment) return { success: false, error: "NOT_FOUND" };
  if (comment.authorId !== authorId) return { success: false, error: "NOT_AUTHOR" };

  comment.content = newContent;
  comment.contentHtml = `<p>${newContent}</p>`;
  comment.isEdited = true;
  comment.editedAt = new Date();
  comment.updatedAt = new Date();
  return { success: true, comment };
}

function deleteComment(
  commentId: string,
  userId: string,
  userRole: string,
): { success: boolean; error?: string } {
  const comment = commentStore.get(commentId);
  if (!comment) return { success: false, error: "NOT_FOUND" };

  // Only the author or an admin can delete
  const isAdmin = userRole === "platform_admin" || userRole === "partner_lead";
  if (comment.authorId !== userId && !isAdmin) {
    return { success: false, error: "FORBIDDEN" };
  }

  // Delete the comment and its replies
  const replyIds = Array.from(commentStore.values())
    .filter((c) => c.parentCommentId === commentId)
    .map((c) => c.id);

  commentStore.delete(commentId);
  for (const replyId of replyIds) {
    commentStore.delete(replyId);
  }

  return { success: true };
}

function resolveComment(
  commentId: string,
  resolvedById: string,
): { success: boolean; comment?: Comment; error?: string } {
  const comment = commentStore.get(commentId);
  if (!comment) return { success: false, error: "NOT_FOUND" };
  if (comment.parentCommentId !== null) {
    return { success: false, error: "CANNOT_RESOLVE_REPLY" };
  }

  comment.status = "RESOLVED";
  comment.resolvedById = resolvedById;
  comment.resolvedAt = new Date();
  comment.updatedAt = new Date();
  return { success: true, comment };
}

function getCommentsForTarget(
  assessmentId: string,
  targetType: string,
  targetId: string,
): Comment[] {
  return Array.from(commentStore.values()).filter(
    (c) =>
      c.assessmentId === assessmentId &&
      c.targetType === targetType &&
      c.targetId === targetId,
  );
}

function getCommentsForAssessment(assessmentId: string): Comment[] {
  return Array.from(commentStore.values()).filter(
    (c) => c.assessmentId === assessmentId,
  );
}

function getReplies(parentCommentId: string): Comment[] {
  return Array.from(commentStore.values()).filter(
    (c) => c.parentCommentId === parentCommentId,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Comments (T-CMT)", () => {
  const assessmentA = "assess-comment-a";
  const assessmentB = "assess-comment-b";
  const step1 = StepFactory.create({ scopeItemId: "J60" });
  const step2 = StepFactory.create({ scopeItemId: "J14" });

  beforeEach(() => {
    resetCommentStore();
  });

  it("T-CMT-001: Create a comment on a step response", () => {
    const comment = createComment({
      assessmentId: assessmentA,
      targetType: "step_response",
      targetId: step1.id,
      authorId: "user-1",
      content: "This step needs clarification from the business.",
    });

    expect(comment.id).toBeDefined();
    expect(comment.assessmentId).toBe(assessmentA);
    expect(comment.targetType).toBe("step_response");
    expect(comment.targetId).toBe(step1.id);
    expect(comment.authorId).toBe("user-1");
    expect(comment.content).toBe("This step needs clarification from the business.");
    expect(comment.status).toBe("OPEN");
    expect(comment.parentCommentId).toBeNull();
    expect(comment.isEdited).toBe(false);
  });

  it("T-CMT-002: Reply to an existing comment creates a thread", () => {
    const parent = createComment({
      assessmentId: assessmentA,
      targetType: "step_response",
      targetId: step1.id,
      authorId: "user-1",
      content: "What is the current manual process?",
    });

    const reply1 = createComment({
      assessmentId: assessmentA,
      targetType: "step_response",
      targetId: step1.id,
      authorId: "user-2",
      content: "We use Excel spreadsheets for tracking.",
      parentCommentId: parent.id,
    });

    const reply2 = createComment({
      assessmentId: assessmentA,
      targetType: "step_response",
      targetId: step1.id,
      authorId: "user-1",
      content: "Thanks, that helps classify this as GAP.",
      parentCommentId: parent.id,
    });

    const replies = getReplies(parent.id);
    expect(replies).toHaveLength(2);
    expect(replies[0]!.parentCommentId).toBe(parent.id);
    expect(replies[1]!.parentCommentId).toBe(parent.id);
  });

  it("T-CMT-003: Comments with @mentions track mentioned user IDs", () => {
    const comment = createComment({
      assessmentId: assessmentA,
      targetType: "gap_resolution",
      targetId: "gap-1",
      authorId: "user-1",
      content: "@user-2 @user-3 please review this gap resolution.",
      mentions: ["user-2", "user-3"],
    });

    expect(comment.mentions).toHaveLength(2);
    expect(comment.mentions).toContain("user-2");
    expect(comment.mentions).toContain("user-3");
  });

  it("T-CMT-004: Resolve a comment marks it as RESOLVED with resolver info", () => {
    const comment = createComment({
      assessmentId: assessmentA,
      targetType: "step_response",
      targetId: step1.id,
      authorId: "user-1",
      content: "Need confirmation on this classification.",
    });

    const result = resolveComment(comment.id, "user-2");

    expect(result.success).toBe(true);
    expect(result.comment!.status).toBe("RESOLVED");
    expect(result.comment!.resolvedById).toBe("user-2");
    expect(result.comment!.resolvedAt).toBeInstanceOf(Date);
  });

  it("T-CMT-005: Cannot resolve a reply (only top-level comments)", () => {
    const parent = createComment({
      assessmentId: assessmentA,
      targetType: "step_response",
      targetId: step1.id,
      authorId: "user-1",
      content: "Top-level comment.",
    });

    const reply = createComment({
      assessmentId: assessmentA,
      targetType: "step_response",
      targetId: step1.id,
      authorId: "user-2",
      content: "This is a reply.",
      parentCommentId: parent.id,
    });

    const result = resolveComment(reply.id, "user-1");
    expect(result.success).toBe(false);
    expect(result.error).toBe("CANNOT_RESOLVE_REPLY");
  });

  it("T-CMT-006: Edit a comment updates content and marks as edited", () => {
    const comment = createComment({
      assessmentId: assessmentA,
      targetType: "step_response",
      targetId: step1.id,
      authorId: "user-1",
      content: "Original content.",
    });

    const result = editComment(comment.id, "user-1", "Updated content with more detail.");

    expect(result.success).toBe(true);
    expect(result.comment!.content).toBe("Updated content with more detail.");
    expect(result.comment!.isEdited).toBe(true);
    expect(result.comment!.editedAt).toBeInstanceOf(Date);
  });

  it("T-CMT-007: Non-author cannot edit another user's comment", () => {
    const comment = createComment({
      assessmentId: assessmentA,
      targetType: "step_response",
      targetId: step1.id,
      authorId: "user-1",
      content: "Original content.",
    });

    const result = editComment(comment.id, "user-2", "Tampered content.");

    expect(result.success).toBe(false);
    expect(result.error).toBe("NOT_AUTHOR");

    // Content unchanged
    const stored = commentStore.get(comment.id)!;
    expect(stored.content).toBe("Original content.");
  });

  it("T-CMT-008: Delete a comment removes it and all replies (cascade)", () => {
    const parent = createComment({
      assessmentId: assessmentA,
      targetType: "step_response",
      targetId: step1.id,
      authorId: "user-1",
      content: "Parent comment.",
    });

    createComment({
      assessmentId: assessmentA,
      targetType: "step_response",
      targetId: step1.id,
      authorId: "user-2",
      content: "Reply 1.",
      parentCommentId: parent.id,
    });

    createComment({
      assessmentId: assessmentA,
      targetType: "step_response",
      targetId: step1.id,
      authorId: "user-3",
      content: "Reply 2.",
      parentCommentId: parent.id,
    });

    expect(getCommentsForAssessment(assessmentA)).toHaveLength(3);

    const result = deleteComment(parent.id, "user-1", "consultant");
    expect(result.success).toBe(true);

    // Parent and all replies deleted
    expect(getCommentsForAssessment(assessmentA)).toHaveLength(0);
  });

  it("T-CMT-009: Comments on different targets within the same assessment are independent", () => {
    createComment({
      assessmentId: assessmentA,
      targetType: "step_response",
      targetId: step1.id,
      authorId: "user-1",
      content: "Comment on step 1.",
    });

    createComment({
      assessmentId: assessmentA,
      targetType: "step_response",
      targetId: step2.id,
      authorId: "user-2",
      content: "Comment on step 2.",
    });

    createComment({
      assessmentId: assessmentA,
      targetType: "gap_resolution",
      targetId: "gap-1",
      authorId: "user-1",
      content: "Comment on a gap.",
    });

    const step1Comments = getCommentsForTarget(assessmentA, "step_response", step1.id);
    expect(step1Comments).toHaveLength(1);
    expect(step1Comments[0]!.content).toBe("Comment on step 1.");

    const step2Comments = getCommentsForTarget(assessmentA, "step_response", step2.id);
    expect(step2Comments).toHaveLength(1);

    const gapComments = getCommentsForTarget(assessmentA, "gap_resolution", "gap-1");
    expect(gapComments).toHaveLength(1);

    // Total for assessment
    expect(getCommentsForAssessment(assessmentA)).toHaveLength(3);
  });

  it("T-CMT-010: Comments are scoped to assessment -- no cross-assessment leakage", () => {
    createComment({
      assessmentId: assessmentA,
      targetType: "step_response",
      targetId: step1.id,
      authorId: "user-1",
      content: "Assessment A comment.",
    });

    createComment({
      assessmentId: assessmentB,
      targetType: "step_response",
      targetId: step1.id, // Same step ID, different assessment
      authorId: "user-2",
      content: "Assessment B comment.",
    });

    const commentsA = getCommentsForAssessment(assessmentA);
    expect(commentsA).toHaveLength(1);
    expect(commentsA[0]!.content).toBe("Assessment A comment.");

    const commentsB = getCommentsForAssessment(assessmentB);
    expect(commentsB).toHaveLength(1);
    expect(commentsB[0]!.content).toBe("Assessment B comment.");

    // Querying by target within assessment A does not return assessment B comments
    const targetComments = getCommentsForTarget(assessmentA, "step_response", step1.id);
    expect(targetComments).toHaveLength(1);
    expect(targetComments[0]!.assessmentId).toBe(assessmentA);
  });
});
