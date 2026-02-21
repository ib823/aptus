"use client";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

interface SnapshotTimelineItem {
  version: number;
  label?: string | undefined;
  createdAt: string;
  isActive?: boolean | undefined;
}

interface SnapshotTimelineViewProps {
  snapshots: SnapshotTimelineItem[];
  onSelect?: ((version: number) => void) | undefined;
  className?: string | undefined;
}

export function SnapshotTimelineView({ snapshots, onSelect, className }: SnapshotTimelineViewProps) {
  if (snapshots.length === 0) {
    return (
      <div className={cn("text-sm text-muted-foreground", className)}>
        No snapshots available
      </div>
    );
  }

  return (
    <div className={cn("flex items-center gap-0 overflow-x-auto pb-2", className)}>
      {snapshots.map((snapshot, index) => (
        <div key={snapshot.version} className="flex items-center">
          <button
            type="button"
            onClick={() => onSelect?.(snapshot.version)}
            className={cn(
              "flex flex-col items-center gap-1 rounded-lg border px-3 py-2 transition-colors",
              snapshot.isActive
                ? "border-blue-500 bg-blue-50 dark:bg-blue-950"
                : "border-border hover:bg-muted",
            )}
          >
            <Badge variant={snapshot.isActive ? "default" : "outline"} className="text-xs">
              v{snapshot.version}
            </Badge>
            {snapshot.label ? (
              <span className="text-xs font-medium">{snapshot.label}</span>
            ) : null}
            <span className="text-[10px] text-muted-foreground">
              {new Date(snapshot.createdAt).toLocaleDateString()}
            </span>
          </button>
          {index < snapshots.length - 1 ? (
            <div className="mx-1 h-px w-6 bg-border" />
          ) : null}
        </div>
      ))}
    </div>
  );
}
