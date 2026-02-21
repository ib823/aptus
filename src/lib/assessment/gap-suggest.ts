/** Phase 13: Gap resolution auto-suggest engine — pure function */

interface Pattern {
  id: string;
  description: string;
  resolutionType: string;
  effortDays?: number | undefined;
  riskLevel?: string | undefined;
}

export interface SuggestedResolution {
  patternId: string;
  resolutionType: string;
  description: string;
  effortDays?: number | undefined;
  riskLevel?: string | undefined;
  matchScore: number;
}

/**
 * Tokenize a string into a set of lowercase words.
 */
function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2),
  );
}

/**
 * Compute Jaccard similarity between two token sets.
 */
function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;

  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection++;
  }

  const union = a.size + b.size - intersection;
  if (union === 0) return 0;

  return intersection / union;
}

const MIN_SIMILARITY = 0.15;
const MAX_RESULTS = 3;

/**
 * Suggest resolution patterns based on gap description similarity.
 * Pure function — receives patterns array for testability.
 */
export function suggestResolutions(
  gapDescription: string,
  patterns: Pattern[],
): SuggestedResolution[] {
  if (!gapDescription || patterns.length === 0) return [];

  const gapTokens = tokenize(gapDescription);
  if (gapTokens.size === 0) return [];

  const scored: SuggestedResolution[] = [];

  for (const pattern of patterns) {
    const patternTokens = tokenize(pattern.description);
    const matchScore = jaccardSimilarity(gapTokens, patternTokens);

    if (matchScore >= MIN_SIMILARITY) {
      scored.push({
        patternId: pattern.id,
        resolutionType: pattern.resolutionType,
        description: pattern.description,
        effortDays: pattern.effortDays,
        riskLevel: pattern.riskLevel,
        matchScore: Math.round(matchScore * 100) / 100,
      });
    }
  }

  // Sort by match score descending, take top N
  scored.sort((a, b) => b.matchScore - a.matchScore);
  return scored.slice(0, MAX_RESULTS);
}
