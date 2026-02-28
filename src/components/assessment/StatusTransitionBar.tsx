"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

interface StatusTransitionBarProps {
  assessmentId: string;
  currentStatus: string;
  onStatusChange?: (newStatus: string) => void;
}

const STATUS_DISPLAY: Record<string, { label: string; color: string }> = {
  draft: { label: "Draft", color: "bg-slate-50 text-slate-700" },
  scoping: { label: "Scope Selection", color: "bg-blue-50 text-blue-700" },
  in_progress: { label: "In Progress", color: "bg-indigo-50 text-indigo-700" },
  workshop_active: { label: "Workshop Active", color: "bg-purple-50 text-purple-700" },
  review_cycle: { label: "Review Cycle", color: "bg-amber-50 text-amber-700" },
  gap_resolution: { label: "Gap Resolution", color: "bg-orange-50 text-orange-700" },
  pending_validation: { label: "Pending Validation", color: "bg-yellow-50 text-yellow-700" },
  validated: { label: "Validated", color: "bg-lime-50 text-lime-700" },
  pending_sign_off: { label: "Pending Sign-Off", color: "bg-cyan-50 text-cyan-700" },
  signed_off: { label: "Signed Off", color: "bg-green-50 text-green-700" },
  handed_off: { label: "Handed Off", color: "bg-teal-50 text-teal-700" },
  archived: { label: "Archived", color: "bg-slate-50 text-slate-700" },
};

export function StatusTransitionBar({
  assessmentId,
  currentStatus,
  onStatusChange,
}: StatusTransitionBarProps) {
  const [availableTransitions, setAvailableTransitions] = useState<string[]>([]);
  const [transitioning, setTransitioning] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const fetchTransitions = useCallback(async () => {
    try {
      const res = await fetch(`/api/assessments/${assessmentId}/transitions`);
      if (res.ok) {
        const data = await res.json();
        setAvailableTransitions(data.data.availableTransitions ?? []);
      }
    } catch {
      // silent
    }
  }, [assessmentId]);

  useEffect(() => {
    fetchTransitions();
  }, [fetchTransitions, currentStatus]);

  const handleTransition = async () => {
    if (!confirmDialog) return;
    setTransitioning(true);
    setError(null);

    try {
      const res = await fetch(`/api/assessments/${assessmentId}/transitions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toStatus: confirmDialog, reason: reason || undefined }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error?.message ?? "Transition failed");
        setTransitioning(false);
        return;
      }

      setConfirmDialog(null);
      setReason("");
      setTransitioning(false);
      onStatusChange?.(confirmDialog);
      fetchTransitions();
    } catch {
      setError("Network error");
      setTransitioning(false);
    }
  };

  const statusInfo = STATUS_DISPLAY[currentStatus] ?? { label: currentStatus, color: "bg-slate-50 text-slate-700" };

  return (
    <>
      <div className="flex items-center gap-3 py-3 px-4 bg-muted/30 rounded-lg border mb-6">
        <span className="text-sm text-muted-foreground">Status:</span>
        <Badge className={statusInfo.color}>{statusInfo.label}</Badge>

        {availableTransitions.length > 0 && (
          <>
            <span className="text-xs text-muted-foreground ml-2">Next:</span>
            {availableTransitions.map((target) => {
              const targetInfo = STATUS_DISPLAY[target] ?? { label: target, color: "" };
              return (
                <Button
                  key={target}
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  onClick={() => setConfirmDialog(target)}
                >
                  {targetInfo.label}
                </Button>
              );
            })}
          </>
        )}
      </div>

      <Dialog open={!!confirmDialog} onOpenChange={(open) => { if (!open) { setConfirmDialog(null); setError(null); setReason(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Status Transition</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <p className="text-sm">
              Transition from <Badge className={statusInfo.color}>{statusInfo.label}</Badge>
              {" to "}
              <Badge className={(STATUS_DISPLAY[confirmDialog ?? ""] ?? { color: "" }).color}>
                {(STATUS_DISPLAY[confirmDialog ?? ""] ?? { label: confirmDialog }).label}
              </Badge>?
            </p>

            <div>
              <Label>Reason (optional)</Label>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Why is this transition being made?"
                className="mt-1"
              />
            </div>

            {error && <p className="text-sm text-red-600 bg-red-50 p-2 rounded">{error}</p>}

            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => { setConfirmDialog(null); setError(null); setReason(""); }}>
                Cancel
              </Button>
              <Button onClick={handleTransition} disabled={transitioning}>
                {transitioning ? "Transitioning..." : "Confirm"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
