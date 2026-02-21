"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface CommentComposerProps {
  onSubmit: (content: string) => Promise<void>;
  placeholder?: string | undefined;
  submitLabel?: string | undefined;
  autoFocus?: boolean | undefined;
}

export function CommentComposer({
  onSubmit,
  placeholder,
  submitLabel,
  autoFocus,
}: CommentComposerProps) {
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    const trimmed = content.trim();
    if (!trimmed) return;

    setSubmitting(true);
    try {
      await onSubmit(trimmed);
      setContent("");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-2">
      <Textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder={placeholder ?? "Add a comment... Use @[Name](id) to mention someone"}
        rows={3}
        className="text-sm resize-none"
        autoFocus={autoFocus ?? false}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            handleSubmit();
          }
        }}
      />
      <div className="flex justify-end gap-2">
        <Button
          size="sm"
          onClick={handleSubmit}
          disabled={submitting || !content.trim()}
        >
          {submitLabel ?? "Comment"}
        </Button>
      </div>
    </div>
  );
}
