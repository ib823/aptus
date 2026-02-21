"use client";

import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { MessageSquare, CheckCircle, Trash2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CommentComposer } from "@/components/comments/CommentComposer";

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

interface CommentBubbleProps {
  id: string;
  content: string;
  contentHtml?: string | null | undefined;
  status: string;
  isEdited: boolean;
  createdAt: string;
  author: CommentAuthor;
  resolvedBy?: { id: string; name: string } | null | undefined;
  replies?: CommentReply[] | undefined;
  currentUserId: string;
  onReply?: ((commentId: string, content: string) => Promise<void>) | undefined;
  onResolve?: ((commentId: string) => Promise<void>) | undefined;
  onDelete?: ((commentId: string) => Promise<void>) | undefined;
  onEdit?: ((commentId: string, content: string) => Promise<void>) | undefined;
}

export function CommentBubble({
  id,
  content,
  status,
  isEdited,
  createdAt,
  author,
  resolvedBy,
  replies,
  currentUserId,
  onReply,
  onResolve,
  onDelete,
  onEdit,
}: CommentBubbleProps) {
  const [showReplyBox, setShowReplyBox] = useState(false);
  const [editing, setEditing] = useState(false);
  const isOwner = author.id === currentUserId;
  const isResolved = status === "RESOLVED";

  const handleReply = async (replyContent: string) => {
    if (onReply) {
      await onReply(id, replyContent);
      setShowReplyBox(false);
    }
  };

  const handleEdit = async (editedContent: string) => {
    if (onEdit) {
      await onEdit(id, editedContent);
      setEditing(false);
    }
  };

  return (
    <div className={`border rounded-lg p-3 ${isResolved ? "opacity-60" : ""}`}>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-sm font-medium">{author.name}</span>
        <span className="text-xs text-muted-foreground">{author.role}</span>
        <span className="text-xs text-muted-foreground">
          {formatDistanceToNow(new Date(createdAt), { addSuffix: true })}
        </span>
        {isEdited && <span className="text-xs text-muted-foreground">(edited)</span>}
        {isResolved && (
          <Badge variant="secondary" className="text-xs">
            Resolved{resolvedBy ? ` by ${resolvedBy.name}` : ""}
          </Badge>
        )}
      </div>

      {editing ? (
        <CommentComposer
          onSubmit={handleEdit}
          submitLabel="Save"
          autoFocus
        />
      ) : (
        <p className="text-sm whitespace-pre-wrap">{content}</p>
      )}

      <div className="flex items-center gap-1 mt-2">
        {onReply && !isResolved && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => setShowReplyBox(!showReplyBox)}
          >
            <MessageSquare className="w-3 h-3 mr-1" />
            Reply
          </Button>
        )}
        {onResolve && !isResolved && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => onResolve(id)}
          >
            <CheckCircle className="w-3 h-3 mr-1" />
            Resolve
          </Button>
        )}
        {isOwner && onEdit && !isResolved && !editing && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => setEditing(true)}
          >
            <Pencil className="w-3 h-3 mr-1" />
            Edit
          </Button>
        )}
        {isOwner && onDelete && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-destructive hover:text-destructive"
            onClick={() => onDelete(id)}
          >
            <Trash2 className="w-3 h-3 mr-1" />
            Delete
          </Button>
        )}
      </div>

      {showReplyBox && (
        <div className="mt-2 ml-4">
          <CommentComposer
            onSubmit={handleReply}
            placeholder="Write a reply..."
            submitLabel="Reply"
            autoFocus
          />
        </div>
      )}

      {replies && replies.length > 0 && (
        <div className="mt-3 ml-4 space-y-2 border-l-2 pl-3">
          {replies.map((reply) => (
            <div key={reply.id} className="text-sm">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="font-medium">{reply.author.name}</span>
                <span className="text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(reply.createdAt), { addSuffix: true })}
                </span>
                {reply.isEdited && <span className="text-xs text-muted-foreground">(edited)</span>}
              </div>
              <p className="whitespace-pre-wrap">{reply.content}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
