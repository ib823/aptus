"use client";

import { formatDistanceToNow } from "date-fns";
import { Bell, MessageSquare, AlertTriangle, CheckCircle, Users, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";

interface NotificationItemProps {
  id: string;
  type: string;
  title: string;
  body: string;
  status: string;
  deepLink?: string | null | undefined;
  sentAt: string;
  onMarkRead?: ((id: string) => void) | undefined;
}

const TYPE_ICONS: Record<string, typeof Bell> = {
  step_classified: CheckCircle,
  gap_created: AlertTriangle,
  comment_mention: MessageSquare,
  comment_reply: MessageSquare,
  workshop_invite: Users,
  workshop_starting: Clock,
  status_change: Bell,
  phase_completed: CheckCircle,
  phase_blocked: AlertTriangle,
  conflict_detected: AlertTriangle,
  conflict_resolved: CheckCircle,
  sign_off_request: Bell,
  deadline_reminder: Clock,
  stakeholder_added: Users,
  stakeholder_removed: Users,
};

export function NotificationItem({
  id,
  type,
  title,
  body,
  status,
  deepLink,
  sentAt,
  onMarkRead,
}: NotificationItemProps) {
  const Icon = TYPE_ICONS[type] ?? Bell;
  const isUnread = status === "unread";

  const handleClick = () => {
    if (isUnread && onMarkRead) {
      onMarkRead(id);
    }
    if (deepLink) {
      window.location.href = deepLink;
    }
  };

  return (
    <div
      className={`flex items-start gap-3 p-3 rounded-md transition-colors cursor-pointer ${
        isUnread ? "bg-primary/5" : "hover:bg-muted/50"
      }`}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleClick();
        }
      }}
    >
      <div className={`mt-0.5 ${isUnread ? "text-primary" : "text-muted-foreground"}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm ${isUnread ? "font-medium" : ""}`}>{title}</p>
        <p className="text-xs text-muted-foreground line-clamp-2">{body}</p>
        <p className="text-xs text-muted-foreground mt-1">
          {formatDistanceToNow(new Date(sentAt), { addSuffix: true })}
        </p>
      </div>
      {isUnread && (
        <Button
          variant="ghost"
          size="sm"
          className="shrink-0 h-6 w-6 p-0"
          onClick={(e) => {
            e.stopPropagation();
            onMarkRead?.(id);
          }}
          aria-label="Mark as read"
        >
          <div className="w-2 h-2 rounded-full bg-primary" />
        </Button>
      )}
    </div>
  );
}
