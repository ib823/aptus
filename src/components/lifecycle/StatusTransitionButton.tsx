"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { STATUS_LABELS } from "@/lib/assessment/status-machine";
import type { AssessmentStatusV2 } from "@/types/assessment";

interface StatusTransitionButtonProps {
  assessmentId: string;
  currentStatus: string;
  onTransitioned?: ((newStatus: string) => void) | undefined;
}

export function StatusTransitionButton({
  assessmentId,
  currentStatus,
  onTransitioned,
}: StatusTransitionButtonProps) {
  const [available, setAvailable] = useState<string[]>([]);
  const [showConfirm, setShowConfirm] = useState(false);
  const [selectedTarget, setSelectedTarget] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch(`/api/assessments/${assessmentId}/transitions`)
      .then((res) => res.json())
      .then((json) => {
        setAvailable(json.data?.availableTransitions ?? []);
      })
      .catch(() => {/* ignore */});
  }, [assessmentId, currentStatus]);

  const handleTransition = useCallback(async () => {
    if (!selectedTarget) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/assessments/${assessmentId}/transitions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toStatus: selectedTarget, reason: reason || undefined }),
      });
      if (res.ok) {
        setShowConfirm(false);
        setSelectedTarget(null);
        setReason("");
        onTransitioned?.(selectedTarget);
      }
    } finally {
      setSubmitting(false);
    }
  }, [assessmentId, selectedTarget, reason, onTransitioned]);

  if (available.length === 0) return null;

  return (
    <div className="relative">
      {available.length === 1 ? (
        <Button
          size="sm"
          onClick={() => {
            setSelectedTarget(available[0] ?? null);
            setShowConfirm(true);
          }}
        >
          Move to {STATUS_LABELS[available[0] as AssessmentStatusV2] ?? available[0]}
        </Button>
      ) : (
        <select
          value=""
          onChange={(e) => {
            if (e.target.value) {
              setSelectedTarget(e.target.value);
              setShowConfirm(true);
            }
          }}
          className="h-9 px-3 text-sm border border-input rounded-md bg-background"
        >
          <option value="">Transition to...</option>
          {available.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s as AssessmentStatusV2] ?? s}
            </option>
          ))}
        </select>
      )}

      {showConfirm && selectedTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-background border rounded-lg shadow-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-2">Confirm Transition</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Move assessment from <strong>{STATUS_LABELS[currentStatus as AssessmentStatusV2] ?? currentStatus}</strong> to{" "}
              <strong>{STATUS_LABELS[selectedTarget as AssessmentStatusV2] ?? selectedTarget}</strong>?
            </p>
            <div className="mb-4">
              <label htmlFor="transition-reason" className="text-sm font-medium">
                Reason (optional)
              </label>
              <textarea
                id="transition-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="mt-1 w-full h-20 px-3 py-2 text-sm border border-input rounded-md bg-background resize-none"
                placeholder="Why is this transition happening?"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowConfirm(false)} disabled={submitting}>
                Cancel
              </Button>
              <Button onClick={handleTransition} disabled={submitting}>
                {submitting ? "Transitioning..." : "Confirm"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
