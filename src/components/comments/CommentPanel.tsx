"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CommentComposer } from "@/components/comments/CommentComposer";
import { CommentBubble } from "@/components/comments/CommentBubble";

interface CommentAuthor {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string | null | undefined;
  role: string;
}

interface CommentReply {
  id: string;
  content: string;
  contentHtml?: string | null | undefined;
  isEdited: boolean;
  createdAt: string;
  author: CommentAuthor;
}

interface CommentData {
  id: string;
  content: string;
  contentHtml?: string | null | undefined;
  status: string;
  isEdited: boolean;
  createdAt: string;
  author: CommentAuthor;
  resolvedBy?: { id: string; name: string } | null | undefined;
  replies: CommentReply[];
}

interface CommentPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assessmentId: string;
  targetType: string;
  targetId: string;
  targetLabel: string;
  currentUserId: string;
}

export function CommentPanel({
  open,
  onOpenChange,
  assessmentId,
  targetType,
  targetId,
  targetLabel,
  currentUserId,
}: CommentPanelProps) {
  const [comments, setComments] = useState<CommentData[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchComments = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/assessments/${assessmentId}/comments?targetType=${targetType}&targetId=${targetId}&limit=50`,
      );
      if (res.ok) {
        const json = await res.json();
        setComments(json.data ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [assessmentId, targetType, targetId]);

  useEffect(() => {
    if (open) {
      setLoading(true);
      fetchComments();
    }
  }, [open, fetchComments]);

  const handleCreate = async (content: string) => {
    const res = await fetch(`/api/assessments/${assessmentId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetType, targetId, content }),
    });
    if (res.ok) {
      await fetchComments();
    }
  };

  const handleReply = async (parentCommentId: string, content: string) => {
    const res = await fetch(`/api/assessments/${assessmentId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetType, targetId, content, parentCommentId }),
    });
    if (res.ok) {
      await fetchComments();
    }
  };

  const handleResolve = async (commentId: string) => {
    const res = await fetch(
      `/api/assessments/${assessmentId}/comments/${commentId}/resolve`,
      { method: "PUT" },
    );
    if (res.ok) {
      await fetchComments();
    }
  };

  const handleDelete = async (commentId: string) => {
    const res = await fetch(
      `/api/assessments/${assessmentId}/comments/${commentId}`,
      { method: "DELETE" },
    );
    if (res.ok) {
      await fetchComments();
    }
  };

  const handleEdit = async (commentId: string, content: string) => {
    const res = await fetch(
      `/api/assessments/${assessmentId}/comments/${commentId}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      },
    );
    if (res.ok) {
      await fetchComments();
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md flex flex-col">
        <SheetHeader>
          <SheetTitle>Comments</SheetTitle>
          <SheetDescription>{targetLabel}</SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1 -mx-4 px-4">
          {loading ? (
            <div className="text-center text-sm text-muted-foreground py-8">
              Loading comments...
            </div>
          ) : comments.length === 0 ? (
            <div className="text-center text-sm text-muted-foreground py-8">
              No comments yet. Start the conversation.
            </div>
          ) : (
            <div className="space-y-3">
              {comments.map((comment) => (
                <CommentBubble
                  key={comment.id}
                  id={comment.id}
                  content={comment.content}
                  contentHtml={comment.contentHtml}
                  status={comment.status}
                  isEdited={comment.isEdited}
                  createdAt={comment.createdAt}
                  author={comment.author}
                  resolvedBy={comment.resolvedBy}
                  replies={comment.replies}
                  currentUserId={currentUserId}
                  onReply={handleReply}
                  onResolve={handleResolve}
                  onDelete={handleDelete}
                  onEdit={handleEdit}
                />
              ))}
            </div>
          )}
        </ScrollArea>

        <div className="border-t pt-3 -mx-4 px-4">
          <CommentComposer onSubmit={handleCreate} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
