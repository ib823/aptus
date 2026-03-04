"use client";

import { useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { Clock, User, ArrowRight, MessageSquare, History } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";

interface HistoryEntry {
  id: string;
  actorName: string;
  actionType: string;
  previousStatus: string | null;
  newStatus: string;
  previousNote: string | null;
  newNote: string | null;
  createdAt: string;
  metadata?: Record<string, unknown> | null;
}

interface DecisionTimelineProps {
  assessmentId: string;
  processStepId: string;
}

interface AuditMetadata {
  bulk?: boolean;
  scopeItemId?: string;
  reason?: string;
}

const STATUS_LABELS: Record<string, string> = {
  FIT: "Matches",
  CONFIGURE: "Needs Adjustment",
  GAP: "Doesn't Match",
  NA: "Not Relevant",
  PENDING: "Unreviewed",
};

export function DecisionTimeline({ assessmentId, processStepId }: DecisionTimelineProps) {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchHistory() {
      try {
        const res = await fetch(`/api/assessments/${assessmentId}/steps/${processStepId}/history`);
        if (res.ok) {
          const json = await res.json();
          setHistory(json.data);
        }
      } catch {
        console.error("Failed to fetch history");
      } finally {
        setLoading(false);
      }
    }
    fetchHistory();
  }, [assessmentId, processStepId]);

  if (loading) {
    return (
      <div className="space-y-4 p-4">
        {[1, 2].map((i) => (
          <div key={i} className="flex gap-3">
            <Skeleton className="h-8 w-8 rounded-full" />
            <div className="space-y-2 flex-1">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-12 w-full" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (history.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <History className="size-8 mb-2 opacity-20" />
        <p className="text-sm">No history recorded yet.</p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-[400px] pr-4">
      <div className="relative pl-6 space-y-8 before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-0.5 before:bg-border">
        {history.map((entry) => {
          const meta = entry.metadata as AuditMetadata | undefined;
          
          return (
            <div key={entry.id} className="relative">
              {/* Timeline dot */}
              <div className="absolute -left-[25px] top-1.5 size-2.5 rounded-full bg-blue-500 border-2 border-background ring-4 ring-background" />
              
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5 font-medium text-foreground">
                    <User className="size-3 text-muted-foreground" />
                    {entry.actorName}
                  </div>
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <Clock className="size-3" />
                    {formatDistanceToNow(new Date(entry.createdAt), { addSuffix: true })}
                  </div>
                </div>

                <div className="p-3 bg-muted/30 rounded-lg border border-border/50">
                  <div className="flex items-center flex-wrap gap-2 mb-2">
                    <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">
                      {entry.actionType}
                    </span>
                    {entry.previousStatus && entry.previousStatus !== entry.newStatus && (
                      <div className="flex items-center gap-1">
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                          {STATUS_LABELS[entry.previousStatus] || entry.previousStatus}
                        </Badge>
                        <ArrowRight className="size-2.5 text-muted-foreground" />
                      </div>
                    )}
                    <Badge className={`text-[10px] px-1.5 py-0 ${
                      entry.newStatus === "FIT" ? "bg-green-100 text-green-700 hover:bg-green-100"
                      : entry.newStatus === "GAP" ? "bg-amber-100 text-amber-700 hover:bg-amber-100"
                      : "bg-blue-100 text-blue-700 hover:bg-blue-100"
                    }`}>
                      {STATUS_LABELS[entry.newStatus] || entry.newStatus}
                    </Badge>
                  </div>

                  {entry.newNote && (
                    <div className="flex gap-2 mt-2 pt-2 border-t border-border/30">
                      <MessageSquare className="size-3 text-muted-foreground shrink-0 mt-0.5" />
                      <p className="text-xs text-foreground italic">
                        &ldquo;{entry.newNote}&rdquo;
                      </p>
                    </div>
                  )}
                  
                  {meta?.bulk && (
                    <p className="text-[10px] text-muted-foreground/60 mt-2 italic">
                      * Part of a bulk classification
                    </p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}
