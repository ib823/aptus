"use client";

import { useState, useEffect } from "react";

interface PresenceUser {
  userId: string;
  userName: string;
  userRole: string;
  currentPage: string | null;
  lastSeenAt: string;
}

const POLL_INTERVAL_MS = 30_000;
const ROLE_COLORS: Record<string, string> = {
  partner_lead: "bg-blue-500",
  partner_manager: "bg-indigo-500",
  client_lead: "bg-green-500",
  client_admin: "bg-emerald-500",
  platform_admin: "bg-purple-500",
  it_lead: "bg-cyan-500",
  viewer: "bg-gray-400",
};

export function PresenceAvatars({ assessmentId }: { assessmentId: string }) {
  const [users, setUsers] = useState<PresenceUser[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function fetchPresence() {
      try {
        const res = await fetch(`/api/assessments/${assessmentId}/presence`);
        if (res.ok) {
          const json = await res.json();
          if (!cancelled) setUsers(json.data ?? []);
        }
      } catch {
        // Silently fail
      }
    }

    void fetchPresence();
    const interval = setInterval(fetchPresence, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [assessmentId]);

  if (users.length === 0) return null;

  const displayed = users.slice(0, 5);
  const overflow = users.length - 5;

  return (
    <div className="flex items-center gap-1">
      <span className="text-xs text-muted-foreground mr-1">Online:</span>
      <div className="flex -space-x-2">
        {displayed.map((u) => {
          const initials = u.userName
            .split(" ")
            .map((n) => n[0])
            .join("")
            .slice(0, 2)
            .toUpperCase();
          const bgColor = ROLE_COLORS[u.userRole] ?? "bg-gray-400";
          return (
            <div
              key={u.userId}
              className={`relative w-7 h-7 rounded-full ${bgColor} flex items-center justify-center text-[10px] font-medium text-white ring-2 ring-background`}
              title={`${u.userName} (${u.userRole.replace(/_/g, " ")})${u.currentPage ? ` — ${u.currentPage}` : ""}`}
            >
              {initials}
              <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-green-400 rounded-full ring-2 ring-background" />
            </div>
          );
        })}
        {overflow > 0 && (
          <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-[10px] font-medium text-muted-foreground ring-2 ring-background">
            +{overflow}
          </div>
        )}
      </div>
    </div>
  );
}
