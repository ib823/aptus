"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface WorkshopCreateDialogProps {
  assessmentId: string;
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

export function WorkshopCreateDialog({
  assessmentId,
  open,
  onClose,
  onCreated,
}: WorkshopCreateDialogProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(async () => {
    setSubmitting(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { title };
      if (description) body.description = description;
      if (scheduledAt) body.scheduledAt = new Date(scheduledAt).toISOString();

      const res = await fetch(`/api/assessments/${assessmentId}/workshops`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setTitle("");
        setDescription("");
        setScheduledAt("");
        onCreated();
        onClose();
      } else {
        const json = await res.json();
        setError(json.error?.message ?? "Failed to create workshop");
      }
    } finally {
      setSubmitting(false);
    }
  }, [assessmentId, title, description, scheduledAt, onCreated, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-background border rounded-lg shadow-lg p-6 w-full max-w-md">
        <h3 className="text-lg font-semibold mb-4">Schedule Workshop</h3>

        <div className="space-y-4">
          <div>
            <Label htmlFor="workshop-title">Title</Label>
            <Input
              id="workshop-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Finance Process Review"
              className="mt-1"
            />
          </div>

          <div>
            <Label htmlFor="workshop-desc">Description (optional)</Label>
            <textarea
              id="workshop-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="mt-1 w-full h-20 px-3 py-2 text-sm border border-input rounded-md bg-background resize-none"
              placeholder="Workshop objectives and agenda..."
            />
          </div>

          <div>
            <Label htmlFor="workshop-date">Scheduled Date/Time (optional)</Label>
            <Input
              id="workshop-date"
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              className="mt-1"
            />
          </div>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || !title}>
            {submitting ? "Creating..." : "Create Workshop"}
          </Button>
        </div>
      </div>
    </div>
  );
}
