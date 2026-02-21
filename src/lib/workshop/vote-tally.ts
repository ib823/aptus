/** Phase 21: Vote tally computation */

import type { VoteClassification, VoteTally, VoteTallyEntry } from "@/types/workshop";

/** Raw vote input */
export interface VoteInput {
  userId: string;
  classification: string;
}

const VALID_CLASSIFICATIONS: VoteClassification[] = ["FIT", "CONFIGURE", "GAP", "NA"];
const CONSENSUS_THRESHOLD = 0.5; // >50% majority

/**
 * Compute vote tally from raw votes with consensus detection.
 * Consensus is reached when >50% of votes agree on a single classification.
 *
 * @param processStepId  The step being voted on
 * @param votes          Array of vote inputs
 * @returns VoteTally with consensus information
 */
export function computeVoteTally(
  processStepId: string,
  votes: VoteInput[],
): VoteTally {
  const totalVotes = votes.length;

  if (totalVotes === 0) {
    return {
      processStepId,
      totalVotes: 0,
      entries: VALID_CLASSIFICATIONS.map((c) => ({
        classification: c,
        count: 0,
        percentage: 0,
        voters: [],
      })),
      consensus: null,
      consensusPercentage: 0,
      hasConsensus: false,
    };
  }

  // Count votes per classification
  const counts = new Map<VoteClassification, string[]>();
  for (const c of VALID_CLASSIFICATIONS) {
    counts.set(c, []);
  }

  for (const vote of votes) {
    const cls = vote.classification as VoteClassification;
    if (VALID_CLASSIFICATIONS.includes(cls)) {
      const voters = counts.get(cls);
      if (voters) {
        voters.push(vote.userId);
      }
    }
  }

  const entries: VoteTallyEntry[] = VALID_CLASSIFICATIONS.map((cls) => {
    const voters = counts.get(cls) ?? [];
    return {
      classification: cls,
      count: voters.length,
      percentage: totalVotes > 0 ? Math.round((voters.length / totalVotes) * 100) : 0,
      voters,
    };
  });

  // Sort by count descending for consensus detection
  const sorted = [...entries].sort((a, b) => b.count - a.count);
  const top = sorted[0];
  const hasConsensus = top != null && top.count / totalVotes > CONSENSUS_THRESHOLD;
  const consensus = hasConsensus && top != null ? top.classification : null;
  const consensusPercentage = top != null ? Math.round((top.count / totalVotes) * 100) : 0;

  return {
    processStepId,
    totalVotes,
    entries,
    consensus,
    consensusPercentage,
    hasConsensus,
  };
}
