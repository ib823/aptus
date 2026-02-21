"use client";

import { useState, useEffect } from "react";
import { PhaseProgressCard } from "@/components/lifecycle/PhaseProgressCard";
import { ASSESSMENT_PHASES } from "@/types/assessment";

interface PhaseData {
  id: string;
  phase: string;
  status: string;
  completionPct: number;
  blockedReason: string | null;
  startedAt: string | null;
  completedAt: string | null;
}

interface PhaseProgressTrackerProps {
  assessmentId: string;
}

const PHASE_LABELS: Record<string, string> = {
  scoping: "Scoping",
  process_review: "Process Review",
  gap_resolution: "Gap Resolution",
  integration: "Integration",
  data_migration: "Data Migration",
  ocm: "OCM",
  validation: "Validation",
  sign_off: "Sign-Off",
};

export function PhaseProgressTracker({ assessmentId }: PhaseProgressTrackerProps) {
  const [phases, setPhases] = useState<PhaseData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/assessments/${assessmentId}/phases`)
      .then((res) => res.json())
      .then((json) => {
        setPhases(json.data ?? []);
      })
      .catch(() => {/* ignore */})
      .finally(() => setLoading(false));
  }, [assessmentId]);

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading phase progress...</p>;
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
        Phase Progress
      </h3>
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
        {ASSESSMENT_PHASES.map((phaseKey) => {
          const phaseData = phases.find((p) => p.phase === phaseKey);
          return (
            <PhaseProgressCard
              key={phaseKey}
              label={PHASE_LABELS[phaseKey] ?? phaseKey}
              status={phaseData?.status ?? "not_started"}
              completionPct={phaseData?.completionPct ?? 0}
              blockedReason={phaseData?.blockedReason ?? null}
            />
          );
        })}
      </div>
    </div>
  );
}
