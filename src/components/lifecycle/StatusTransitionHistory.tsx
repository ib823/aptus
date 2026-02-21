"use client";

import { useState, useEffect } from "react";
import { STATUS_LABELS } from "@/lib/assessment/status-machine";
import type { AssessmentStatusV2 } from "@/types/assessment";

interface TransitionEntry {
  id: string;
  fromStatus: string;
  toStatus: string;
  triggeredBy: string;
  triggeredByRole: string;
  reason: string | null;
  createdAt: string;
}

interface StatusTransitionHistoryProps {
  assessmentId: string;
}

export function StatusTransitionHistory({ assessmentId }: StatusTransitionHistoryProps) {
  const [entries, setEntries] = useState<TransitionEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/assessments/${assessmentId}/transitions/history`)
      .then((res) => res.json())
      .then((json) => {
        setEntries(json.data ?? []);
      })
      .catch(() => {/* ignore */})
      .finally(() => setLoading(false));
  }, [assessmentId]);

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading history...</p>;
  }

  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground">No status transitions recorded.</p>;
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
        Transition History
      </h3>
      <div className="space-y-2">
        {entries.map((entry) => (
          <div key={entry.id} className="flex items-start gap-3 text-sm border-l-2 border-gray-200 dark:border-gray-700 pl-3 py-1">
            <div className="flex-1">
              <p>
                <span className="font-medium">
                  {STATUS_LABELS[entry.fromStatus as AssessmentStatusV2] ?? entry.fromStatus}
                </span>
                {" -> "}
                <span className="font-medium">
                  {STATUS_LABELS[entry.toStatus as AssessmentStatusV2] ?? entry.toStatus}
                </span>
              </p>
              {entry.reason && (
                <p className="text-muted-foreground text-xs mt-0.5">{entry.reason}</p>
              )}
              <p className="text-muted-foreground text-xs mt-0.5">
                by {entry.triggeredBy} ({entry.triggeredByRole}) at{" "}
                {new Date(entry.createdAt).toLocaleString()}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
