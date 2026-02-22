import type { Comment } from "@prisma/client";

let counter = 0;
const nextId = () => `test-${++counter}`;

type CommentOverrides = Partial<Comment>;

function createBase(overrides: CommentOverrides = {}): Comment {
  const id = overrides.id ?? nextId();
  const now = new Date();
  return {
    id,
    assessmentId: overrides.assessmentId ?? nextId(),
    targetType: overrides.targetType ?? "step_response",
    targetId: overrides.targetId ?? nextId(),
    authorId: overrides.authorId ?? nextId(),
    content: overrides.content ?? `Comment content for ${id}`,
    contentHtml: overrides.contentHtml ?? null,
    mentions: overrides.mentions ?? [],
    parentCommentId: overrides.parentCommentId ?? null,
    status: overrides.status ?? "OPEN",
    resolvedById: overrides.resolvedById ?? null,
    resolvedAt: overrides.resolvedAt ?? null,
    editedAt: overrides.editedAt ?? null,
    isEdited: overrides.isEdited ?? false,
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
  };
}

export function create(overrides: CommentOverrides = {}): Comment {
  return createBase(overrides);
}

export function createMany(count: number, overrides: CommentOverrides = {}): Comment[] {
  return Array.from({ length: count }, () => createBase(overrides));
}

export function createThread(
  depth: number = 3,
  overrides: CommentOverrides = {},
): Comment[] {
  const assessmentId = overrides.assessmentId ?? nextId();
  const targetType = overrides.targetType ?? "step_response";
  const targetId = overrides.targetId ?? nextId();
  const authorId = overrides.authorId ?? nextId();

  const comments: Comment[] = [];
  let parentId: string | null = null;

  for (let i = 0; i < depth; i++) {
    const comment = createBase({
      assessmentId,
      targetType,
      targetId,
      authorId: i === 0 ? authorId : nextId(),
      content: i === 0
        ? "This step needs clarification on the expected output."
        : i === 1
          ? "I agree, the instructions are ambiguous. Can we add more detail?"
          : `Follow-up reply ${i}`,
      parentCommentId: parentId,
      ...overrides,
    });
    comments.push(comment);
    parentId = comment.id;
  }

  return comments;
}

export function createWithMentions(
  mentionedUserIds: string[],
  overrides: CommentOverrides = {},
): Comment {
  const mentionNames = mentionedUserIds.map((uid) => `@user_${uid}`);
  return createBase({
    content: `Attention ${mentionNames.join(", ")} - please review this item.`,
    contentHtml: `<p>Attention ${mentionNames.map((m) => `<span class="mention">${m}</span>`).join(", ")} - please review this item.</p>`,
    mentions: mentionedUserIds,
    ...overrides,
  });
}

export function createResolved(overrides: CommentOverrides = {}): Comment {
  const now = new Date();
  const resolverId = nextId();
  return createBase({
    status: "RESOLVED",
    resolvedById: resolverId,
    resolvedAt: now,
    content: "Issue identified during review - needs correction.",
    ...overrides,
  });
}
