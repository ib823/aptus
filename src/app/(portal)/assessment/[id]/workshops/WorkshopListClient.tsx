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
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/40 text-left">
                <th className="px-4 py-2 font-medium">Title</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Facilitator</th>
                <th className="px-4 py-2 font-medium">Date</th>
                <th className="px-4 py-2 font-medium text-center">Attendees</th>
                <th className="px-4 py-2 font-medium text-center">Actions</th>
                <th className="px-4 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => {
                const badge = STATUS_BADGES[s.status] ?? { label: s.status, className: "bg-slate-50 text-slate-600" };
                return (
                  <tr key={s.id} className="border-t hover:bg-muted/20">
                    <td className="px-4 py-3">
                      <Link
                        href={`/assessment/${assessmentId}/workshops/${s.id}`}
                        className="font-medium text-blue-600 hover:underline"
                      >
                        {s.title}
                      </Link>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Code: {s.sessionCode}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <Badge className={badge.className}>{badge.label}</Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{s.facilitatorName}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {s.scheduledAt ? formatDate(s.scheduledAt) : "Not scheduled"}
                      {s.duration !== null && (
                        <span className="text-xs ml-1">({s.duration} min)</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">{s.attendeeCount}</td>
                    <td className="px-4 py-3 text-center">{s.actionItemCount}</td>
                    <td className="px-4 py-3 text-right">
                      {s.hasMinutes && (
                        <Link
                          href={`/assessment/${assessmentId}/workshops/${s.id}?tab=minutes`}
                          className="text-xs text-blue-500 hover:text-blue-600"
                        >
                          View Minutes
                        </Link>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
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
