"use client";

import { Badge } from "@/components/ui/badge";

interface AttendeeInfo {
  id: string;
  name: string;
  role: string;
  connectionStatus: string;
  isPresenter: boolean;
}

interface WorkshopAttendeeListProps {
  attendees: AttendeeInfo[];
}

const STATUS_DOT: Record<string, string> = {
  connected: "bg-green-500",
  disconnected: "bg-gray-400",
  away: "bg-amber-500",
};

export function WorkshopAttendeeList({ attendees }: WorkshopAttendeeListProps) {
  const connected = attendees.filter((a) => a.connectionStatus === "connected");
  const other = attendees.filter((a) => a.connectionStatus !== "connected");

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Attendees</h3>
        <Badge variant="outline" className="text-xs">
          {connected.length} online
        </Badge>
      </div>
      <div className="space-y-1.5">
        {[...connected, ...other].map((att) => (
          <div key={att.id} className="flex items-center gap-2 text-sm">
            <div className={`w-2 h-2 rounded-full ${STATUS_DOT[att.connectionStatus] ?? STATUS_DOT.disconnected}`} />
            <span className="truncate">{att.name}</span>
            {att.isPresenter && (
              <Badge variant="outline" className="text-[10px] px-1 shrink-0">
                Presenter
              </Badge>
            )}
            {att.role === "facilitator" && (
              <Badge variant="outline" className="text-[10px] px-1 bg-blue-50 text-blue-700 shrink-0">
                Facilitator
              </Badge>
            )}
          </div>
        ))}
        {attendees.length === 0 && (
          <p className="text-xs text-muted-foreground">No attendees yet</p>
        )}
      </div>
    </div>
  );
}
