"use client";

import { useState, useEffect } from "react";

interface WorkshopData {
  id: string;
  sessionCode: string;
  title: string;
  description: string | null;
  status: string;
  facilitatorName: string;
  scheduledAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  attendeeCount: number;
}

const STATUS_BADGE: Record<string, string> = {
  scheduled: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  in_progress: "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300",
  completed: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300",
  cancelled: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
};

interface WorkshopSessionListProps {
  assessmentId: string;
}

export function WorkshopSessionList({ assessmentId }: WorkshopSessionListProps) {
  const [workshops, setWorkshops] = useState<WorkshopData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/assessments/${assessmentId}/workshops`)
      .then((res) => res.json())
      .then((json) => {
        setWorkshops(json.data ?? []);
      })
      .catch(() => {/* ignore */})
      .finally(() => setLoading(false));
  }, [assessmentId]);

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading workshops...</p>;
  }

  if (workshops.length === 0) {
    return <p className="text-sm text-muted-foreground">No workshop sessions scheduled.</p>;
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
        Workshop Sessions
      </h3>
      <div className="space-y-2">
        {workshops.map((w) => (
          <div key={w.id} className="border rounded-lg p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-sm">{w.title}</p>
                <p className="text-xs text-muted-foreground">
                  Code: <span className="font-mono">{w.sessionCode}</span> | Facilitator: {w.facilitatorName}
                </p>
              </div>
              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_BADGE[w.status] ?? STATUS_BADGE.scheduled}`}>
                {w.status.replace("_", " ")}
              </span>
            </div>
            {w.scheduledAt && (
              <p className="text-xs text-muted-foreground mt-1">
                Scheduled: {new Date(w.scheduledAt).toLocaleString()}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
