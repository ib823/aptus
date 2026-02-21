"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { WorkshopVoteTally } from "@/components/workshop/WorkshopVoteTally";
import type { VoteTally, VoteClassification } from "@/types/workshop";

interface WorkshopVotingPanelProps {
  assessmentId: string;
  sessionId: string;
  processStepId: string;
  initialTally?: VoteTally | undefined;
  onVoteSubmitted?: (() => void) | undefined;
}

const VOTE_OPTIONS: Array<{ value: VoteClassification; label: string; color: string }> = [
  { value: "FIT", label: "FIT", color: "bg-green-600 hover:bg-green-700" },
  { value: "CONFIGURE", label: "CONFIGURE", color: "bg-blue-600 hover:bg-blue-700" },
  { value: "GAP", label: "GAP", color: "bg-amber-600 hover:bg-amber-700" },
  { value: "NA", label: "N/A", color: "bg-gray-500 hover:bg-gray-600" },
];

export function WorkshopVotingPanel({
  assessmentId,
  sessionId,
  processStepId,
  initialTally,
  onVoteSubmitted,
}: WorkshopVotingPanelProps) {
  const [tally, setTally] = useState<VoteTally | null>(initialTally ?? null);
  const [submitting, setSubmitting] = useState(false);
  const [selectedVote, setSelectedVote] = useState<VoteClassification | null>(null);

  const submitVote = useCallback(async (classification: VoteClassification) => {
    setSubmitting(true);
    setSelectedVote(classification);
    try {
      const res = await fetch(
        `/api/assessments/${assessmentId}/workshops/${sessionId}/votes`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ processStepId, classification }),
        },
      );
      if (res.ok) {
        // Refresh tally
        const tallyRes = await fetch(
          `/api/assessments/${assessmentId}/workshops/${sessionId}/votes/${processStepId}`,
        );
        if (tallyRes.ok) {
          const tallyJson = await tallyRes.json() as { data: VoteTally };
          setTally(tallyJson.data);
        }
        onVoteSubmitted?.();
      }
    } finally {
      setSubmitting(false);
    }
  }, [assessmentId, sessionId, processStepId, onVoteSubmitted]);

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold">Cast Your Vote</h3>
      <div className="grid grid-cols-2 gap-2">
        {VOTE_OPTIONS.map((opt) => (
          <Button
            key={opt.value}
            className={`${opt.color} text-white ${selectedVote === opt.value ? "ring-2 ring-offset-2 ring-blue-500" : ""}`}
            disabled={submitting}
            onClick={() => void submitVote(opt.value)}
          >
            {opt.label}
          </Button>
        ))}
      </div>
      <WorkshopVoteTally tally={tally} />
    </div>
  );
}
