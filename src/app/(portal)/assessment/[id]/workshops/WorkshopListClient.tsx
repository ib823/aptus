"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { WorkshopScheduleDialog } from "@/components/workshop/WorkshopScheduleDialog";

interface WorkshopSession {
  id: string;
  title: string;
  sessionCode: string;
  status: string;
  facilitatorName: string;
  scheduledAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  attendeeCount: number;
  duration: number | null;
  actionItemCount: number;
  voteCount: number;
  hasMinutes: boolean;
}

interface WorkshopListClientProps {
  assessmentId: string;
  sessions: WorkshopSession[];
}

const STATUS_BADGES: Record<string, { label: string; className: string }> = {
  scheduled: { label: "Scheduled", className: "bg-blue-50 text-blue-700" },
  in_progress: { label: "In Progress", className: "bg-green-50 text-green-700" },
  completed: { label: "Completed", className: "bg-slate-50 text-slate-600" },
  cancelled: { label: "Cancelled", className: "bg-red-50 text-red-600" },
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function WorkshopListClient({ assessmentId, sessions }: WorkshopListClientProps) {
  const [showSchedule, setShowSchedule] = useState(false);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Workshops</h2>
        <button
          onClick={() => setShowSchedule(true)}
          className="px-4 py-2 bg-primary text-primary-foreground text-sm rounded-md hover:bg-primary/90"
        >
          Schedule Workshop
        </button>
      </div>

      {sessions.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p>No workshops yet.</p>
          <p className="text-sm mt-1">Schedule a workshop to get started.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {sessions.map((s) => {
            const badge = STATUS_BADGES[s.status] ?? { label: s.status, className: "bg-slate-50 text-slate-600" };
            return (
              <Link
                key={s.id}
                href={`/assessment/${assessmentId}/workshops/${s.id}`}
                className="block border rounded-lg p-4 bg-card hover:bg-accent hover:shadow-sm transition-all"
              >
                <div className="flex items-start justify-between mb-2">
                  <h3 className="font-medium text-sm">{s.title}</h3>
                  <Badge className={badge.className}>{badge.label}</Badge>
                </div>

                <p className="text-xs text-muted-foreground mb-3">
                  Code: <span className="font-mono font-bold">{s.sessionCode}</span>
                  <span className="mx-1.5">&middot;</span>
                  {s.facilitatorName}
                </p>

                <div className="text-xs text-muted-foreground mb-3">
                  {s.scheduledAt ? formatDate(s.scheduledAt) : "Not scheduled"}
                  {s.duration !== null && <span className="ml-1">({s.duration} min)</span>}
                </div>

                <div className="flex items-center gap-3 text-xs">
                  <span>{s.attendeeCount} attendees</span>
                  <span>{s.actionItemCount} actions</span>
                  {s.voteCount > 0 && <span>{s.voteCount} votes</span>}
                  {s.hasMinutes && <span className="text-blue-600">Minutes</span>}
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <WorkshopScheduleDialog
        assessmentId={assessmentId}
        open={showSchedule}
        onClose={() => setShowSchedule(false)}
      />
    </div>
  );
}
