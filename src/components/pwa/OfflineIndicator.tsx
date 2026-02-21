"use client";

import { useSyncExternalStore } from "react";
import { WifiOffIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface OfflineIndicatorProps {
  pendingCount?: number | undefined;
}

function subscribe(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

function getSnapshot() {
  return navigator.onLine;
}

function getServerSnapshot() {
  return true;
}

export function OfflineIndicator({ pendingCount }: OfflineIndicatorProps) {
  const isOnline = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  if (isOnline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center justify-center gap-2 bg-yellow-600 px-4 py-2 text-sm font-medium text-white"
    >
      <WifiOffIcon className="size-4" />
      <span>You&apos;re offline. Changes will sync when you reconnect.</span>
      {pendingCount != null && pendingCount > 0 && (
        <Badge variant="secondary" className="ml-1 text-xs">
          {pendingCount} pending
        </Badge>
      )}
    </div>
  );
}
