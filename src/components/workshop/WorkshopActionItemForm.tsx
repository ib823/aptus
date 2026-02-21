"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";

interface WorkshopActionItemFormProps {
  assessmentId: string;
  sessionId: string;
  relatedStepId?: string | undefined;
  relatedScopeItemId?: string | undefined;
  onCreated?: (() => void) | undefined;
}

export function WorkshopActionItemForm({
  assessmentId,
  sessionId,
  relatedStepId,
  relatedScopeItemId,
  onCreated,
}: WorkshopActionItemFormProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("medium");
  const [assignedToName, setAssignedToName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = useCallback(async () => {
    if (!title.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch(
        `/api/assessments/${assessmentId}/workshops/${sessionId}/action-items`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: title.trim(),
            description: description.trim() || undefined,
            priority,
            assignedToName: assignedToName.trim() || undefined,
            relatedStepId,
            relatedScopeItemId,
          }),
        },
      );
      if (res.ok) {
        setTitle("");
        setDescription("");
        setPriority("medium");
        setAssignedToName("");
        onCreated?.();
      }
    } finally {
      setSubmitting(false);
    }
  }, [assessmentId, sessionId, title, description, priority, assignedToName, relatedStepId, relatedScopeItemId, onCreated]);

  return (
    <div className="border rounded-lg p-3 space-y-2 bg-card">
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Action item title..."
        className="w-full border rounded px-2 py-1.5 text-sm bg-background"
      />
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Description (optional)"
        rows={2}
        className="w-full border rounded px-2 py-1.5 text-sm bg-background resize-none"
      />
      <div className="flex gap-2">
        <input
          type="text"
          value={assignedToName}
          onChange={(e) => setAssignedToName(e.target.value)}
          placeholder="Assigned to..."
          className="flex-1 border rounded px-2 py-1.5 text-sm bg-background"
        />
        <select
          value={priority}
          onChange={(e) => setPriority(e.target.value)}
          className="border rounded px-2 py-1.5 text-sm bg-background"
        >
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
          <option value="critical">Critical</option>
        </select>
      </div>
      <Button
        size="sm"
        onClick={() => void handleSubmit()}
        disabled={submitting || !title.trim()}
        className="w-full"
      >
        {submitting ? "Adding..." : "Add Action Item"}
      </Button>
    </div>
  );
}
