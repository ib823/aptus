"use client";

import type { VoteTally } from "@/types/workshop";

interface WorkshopVoteTallyProps {
  tally: VoteTally | null;
}

const CLASSIFICATION_COLORS: Record<string, string> = {
  FIT: "bg-green-500",
  CONFIGURE: "bg-blue-500",
  GAP: "bg-amber-500",
  NA: "bg-gray-400",
};

export function WorkshopVoteTally({ tally }: WorkshopVoteTallyProps) {
  if (!tally || tally.totalVotes === 0) {
    return (
      <div className="text-sm text-muted-foreground text-center py-4">
        No votes yet
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{tally.totalVotes} vote{tally.totalVotes !== 1 ? "s" : ""}</span>
        {tally.hasConsensus && tally.consensus && (
          <span className="font-semibold text-green-700">
            Consensus: {tally.consensus} ({tally.consensusPercentage}%)
          </span>
        )}
      </div>
      {tally.entries.map((entry) => (
        <div key={entry.classification} className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium">{entry.classification}</span>
            <span className="text-muted-foreground">{entry.count} ({entry.percentage}%)</span>
          </div>
          <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${CLASSIFICATION_COLORS[entry.classification] ?? "bg-gray-400"}`}
              style={{ width: `${entry.percentage}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
