"use client";

import { useState, useEffect, useCallback } from "react";
import { Pencil } from "lucide-react";
import { useSSE } from "@/hooks/useSSE";

interface LockInfo {
  id: string;
  entityType: string;
  entityId: string;
  lockedById: string;
  lockedByName: string;
  expiresAt: string;
}

const FALLBACK_INTERVAL_MS = 60_000; // 60-second fallback (SSE handles real-time)

interface ActiveEditorsProps {
  assessmentId: string;
  entityType: string;
  entityId: string;
  currentUserId?: string | undefined;
}

export function ActiveEditors({
  assessmentId,
  entityType,
  entityId,
  currentUserId,
}: ActiveEditorsProps) {
  const [lock, setLock] = useState<LockInfo | null>(null);

  const fetchLocks = useCallback(async () => {
    if (document.visibilityState === "hidden") return;
    try {
      const res = await fetch(`/api/assessments/${assessmentId}/locks`);
      if (res.ok) {
        const json = await res.json();
        const locks: LockInfo[] = json.data ?? [];
        const match = locks.find(
          (l) => l.entityType === entityType && l.entityId === entityId,
        );
        setLock(match ?? null);
      }
    } catch {
      // Silently fail
    }
  }, [assessmentId, entityType, entityId]);

  // Use shared SSE manager for instant lock updates
  useSSE(assessmentId, "locks_updated", fetchLocks);

  useEffect(() => {
    void fetchLocks();

    // Fallback polling at 60s (SSE handles the real-time path)
    const interval = setInterval(fetchLocks, FALLBACK_INTERVAL_MS);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void fetchLocks();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [fetchLocks]);

  if (!lock || lock.lockedById === currentUserId) return null;

  return (
    <div className="flex items-center gap-1.5 text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded">
      <Pencil className="w-3 h-3" />
      <span>{lock.lockedByName} is editing...</span>
    </div>
  );
}
