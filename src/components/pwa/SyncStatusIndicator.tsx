"use client";

import { useState } from "react";
import { RefreshCwIcon, CloudIcon, Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import type { OfflineSyncItem } from "@/types/pwa";

interface SyncStatusIndicatorProps {
  items?: OfflineSyncItem[] | undefined;
  onSyncNow?: (() => Promise<void>) | undefined;
}

export function SyncStatusIndicator({ items, onSyncNow }: SyncStatusIndicatorProps) {
  const [isSyncing, setIsSyncing] = useState(false);
  const pendingItems = items ?? [];

  async function handleSync() {
    if (!onSyncNow || isSyncing) return;
    setIsSyncing(true);
    try {
      await onSyncNow();
    } finally {
      setIsSyncing(false);
    }
  }

  const Icon = isSyncing ? Loader2Icon : pendingItems.length > 0 ? RefreshCwIcon : CloudIcon;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Sync status">
          <Icon className={isSyncing ? "size-4 animate-spin" : "size-4"} />
          {pendingItems.length > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 flex size-5 items-center justify-center p-0 text-[10px]"
            >
              {pendingItems.length}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="end">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold">Sync Queue</h4>
            {pendingItems.length > 0 && (
              <Badge variant="outline">{pendingItems.length} pending</Badge>
            )}
          </div>

          {pendingItems.length === 0 ? (
            <p className="text-muted-foreground text-sm">All changes are synced.</p>
          ) : (
            <ul className="max-h-48 space-y-2 overflow-y-auto">
              {pendingItems.map((item) => (
                <li
                  key={item.clientId}
                  className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
                >
                  <span className="truncate">{item.action.replace(/_/g, " ")}</span>
                  <span className="text-muted-foreground text-xs">
                    {new Date(item.queuedAt).toLocaleTimeString()}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {pendingItems.length > 0 && onSyncNow && (
            <Button
              onClick={handleSync}
              disabled={isSyncing}
              className="w-full"
              size="sm"
            >
              {isSyncing ? "Syncing..." : "Sync Now"}
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
