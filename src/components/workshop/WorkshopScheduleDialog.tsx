"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

interface WorkshopScheduleDialogProps {
  assessmentId: string;
  open: boolean;
  onClose: () => void;
  onCreated?: ((sessionId: string) => void) | undefined;
}

export function WorkshopScheduleDialog({
  assessmentId,
  open,
  onClose,
  onCreated,
}: WorkshopScheduleDialogProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = useCallback(async () => {
    if (!title.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/assessments/${assessmentId}/workshops`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
          scheduledAt: scheduledAt || undefined,
        }),
      });
      if (res.ok) {
        const json = await res.json() as { data: { id: string } };
        setTitle("");
        setDescription("");
        setScheduledAt("");
        onCreated?.(json.data.id);
        onClose();
      } else {
        const err = await res.json() as { error?: { message?: string } };
        setError(err.error?.message ?? "Failed to create workshop");
      }
    } catch {
      setError("Failed to create workshop");
    } finally {
      setSubmitting(false);
    }
  }, [assessmentId, title, description, scheduledAt, onCreated, onClose]);

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Schedule Workshop</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium text-foreground">Title *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Workshop title..."
              className="w-full border rounded px-3 py-2 text-sm mt-1 bg-background"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Workshop description..."
              rows={3}
              className="w-full border rounded px-3 py-2 text-sm mt-1 bg-background resize-none"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground">Scheduled Date & Time</label>
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm mt-1 bg-background"
            />
          </div>
          {error && (
            <p className="text-xs text-red-600">{error}</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => void handleCreate()} disabled={submitting || !title.trim()}>
            {submitting ? "Creating..." : "Create Workshop"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
