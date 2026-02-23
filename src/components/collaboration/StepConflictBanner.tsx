"use client";

import { useState, useEffect } from "react";
import { ConflictBanner } from "@/components/collaboration/ConflictBanner";

interface ConflictData {
  id: string;
  entityType: string;
  entityId: string;
  status: string;
}

interface StepConflictBannerProps {
  assessmentId: string;
  entityType: string;
  entityId: string;
}

export function StepConflictBanner({
  assessmentId,
  entityType,
  entityId,
}: StepConflictBannerProps) {
  const [conflict, setConflict] = useState<ConflictData | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchConflicts() {
      try {
        const res = await fetch(`/api/assessments/${assessmentId}/conflicts`);
        if (res.ok) {
          const json = await res.json();
          const conflicts: ConflictData[] = json.data ?? [];
          const match = conflicts.find(
            (c) =>
              c.entityType === entityType &&
              c.entityId === entityId &&
              c.status !== "RESOLVED",
          );
          if (!cancelled) setConflict(match ?? null);
        }
      } catch {
        // Silently fail
      }
    }

    void fetchConflicts();

    return () => {
      cancelled = true;
    };
  }, [assessmentId, entityType, entityId]);

  if (!conflict) return null;

  return (
    <ConflictBanner
      entityType={conflict.entityType}
      entityId={conflict.entityId}
      conflictId={conflict.id}
      status={conflict.status}
    />
  );
}
