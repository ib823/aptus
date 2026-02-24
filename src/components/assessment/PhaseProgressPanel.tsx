"use client";

import { useState, useEffect, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";

interface PhaseProgress {
  phase: string;
  status: string;
  completionPct: number;
  blockedReason: string | null;
}

interface PhaseProgressPanelProps {
  assessmentId: string;
  compact?: boolean;
}

const PHASE_LABELS: Record<string, string> = {
  scoping: "Scope Selection",
  process_review: "Process Review",
  gap_resolution: "Gap Resolution",
  integration: "Integration",
  data_migration: "Data Migration",
  ocm: "OCM",
  validation: "Validation",
  sign_off: "Sign-Off",
};

const STATUS_BADGE: Record<string, { label: string; color: string }> = {
  not_started: { label: "Not Started", color: "bg-gray-100 text-gray-600" },
  in_progress: { label: "In Progress", color: "bg-blue-100 text-blue-700" },
  completed: { label: "Completed", color: "bg-green-100 text-green-700" },
  blocked: { label: "Blocked", color: "bg-amber-100 text-amber-700" },
};

export function PhaseProgressPanel({ assessmentId, compact = false }: PhaseProgressPanelProps) {
  const [phases, setPhases] = useState<PhaseProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [recalculating, setRecalculating] = useState(false);

  const fetchPhases = useCallback(async () => {
    try {
      const res = await fetch(`/api/assessments/${assessmentId}/phases`);
      if (res.ok) {
        const data = await res.json();
        setPhases(data.data ?? []);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [assessmentId]);

  useEffect(() => {
    fetchPhases();
  }, [fetchPhases]);

  const handleRecalculate = async () => {
    setRecalculating(true);
    try {
      const res = await fetch(`/api/assessments/${assessmentId}/phases/recalculate`, {
        method: "POST",
      });
      if (res.ok) {
        await fetchPhases();
      }
    } catch {
      // silent
    } finally {
      setRecalculating(false);
    }
  };

  if (loading) {
    return <div className="text-sm text-muted-foreground p-4">Loading phases...</div>;
  }

  if (phases.length === 0) {
    return null;
  }

  return (
    <div className={compact ? "space-y-2" : "space-y-3"}>
      <div className="flex items-center justify-between">
        <h3 className={compact ? "text-xs font-semibold text-muted-foreground uppercase tracking-wider" : "text-sm font-semibold"}>
          Phase Progress
        </h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleRecalculate}
          disabled={recalculating}
          className="h-7 text-xs"
        >
          <RefreshCw className={`w-3 h-3 mr-1 ${recalculating ? "animate-spin" : ""}`} />
          {recalculating ? "..." : "Recalculate"}
        </Button>
      </div>

      {phases.map((phase) => {
        const label = PHASE_LABELS[phase.phase] ?? phase.phase;
        const badge = STATUS_BADGE[phase.status] ?? { label: "Not Started", color: "bg-gray-100 text-gray-600" };

        return (
          <div key={phase.phase} className={compact ? "space-y-0.5" : "space-y-1"}>
            <div className="flex items-center justify-between">
              <span className={compact ? "text-xs" : "text-sm"}>{label}</span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{phase.completionPct}%</span>
                {!compact && (
                  <Badge className={`text-[10px] py-0 ${badge.color}`}>{badge.label}</Badge>
                )}
              </div>
            </div>
            <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  phase.status === "blocked"
                    ? "bg-amber-500"
                    : phase.status === "completed"
                      ? "bg-green-500"
                      : "bg-blue-500"
                }`}
                style={{ width: `${phase.completionPct}%` }}
              />
            </div>
            {phase.status === "blocked" && phase.blockedReason && !compact && (
              <p className="text-xs text-amber-600 mt-0.5">{phase.blockedReason}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
