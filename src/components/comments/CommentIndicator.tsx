"use client";

import { MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";

interface CommentIndicatorProps {
  count: number;
  onClick: () => void;
  hasUnresolved?: boolean | undefined;
}

export function CommentIndicator({ count, onClick, hasUnresolved }: CommentIndicatorProps) {
  if (count === 0) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className="h-7 w-7 p-0 text-muted-foreground"
        onClick={onClick}
        aria-label="Add comment"
      >
        <MessageSquare className="w-3.5 h-3.5" />
      </Button>
    );
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      className={`h-7 gap-1 px-1.5 text-xs ${
        (hasUnresolved ?? false) ? "text-amber-600" : "text-muted-foreground"
      }`}
      onClick={onClick}
      aria-label={`${count} comment${count !== 1 ? "s" : ""}`}
    >
      <MessageSquare className="w-3.5 h-3.5" />
      <span>{count}</span>
    </Button>
  );
}
