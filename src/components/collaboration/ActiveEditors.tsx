"use client";

import { useState, useEffect } from "react";
import { Pencil } from "lucide-react";

interface LockInfo {
  id: string;
  entityType: string;
  entityId: string;
  lockedById: string;
  lockedByName: string;
  expiresAt: string;
}

const POLL_INTERVAL_MS = 10_000;

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

  useEffect(() => {
    let cancelled = false;

    async function fetchLocks() {
      if (document.visibilityState === "hidden") return;
      try {
        const res = await fetch(`/api/assessments/${assessmentId}/locks`);
        if (res.ok) {
          const json = await res.json();
          const locks: LockInfo[] = json.data ?? [];
          const match = locks.find(
            (l) => l.entityType === entityType && l.entityId === entityId,
          );
          if (!cancelled) setLock(match ?? null);
        }
      } catch {
        // Silently fail
      }
    }

    void fetchLocks();
    const interval = setInterval(fetchLocks, POLL_INTERVAL_MS);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void fetchLocks();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [assessmentId, entityType, entityId]);

  if (!lock || lock.lockedById === currentUserId) return null;

  return (
    <div className="flex items-center gap-1.5 text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded">
      <Pencil className="w-3 h-3" />
      <span>{lock.lockedByName} is editing...</span>
    </div>
  );
}
