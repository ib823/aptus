/** Phase 26: Anonymization engine for template and benchmark data */

import type {
  AnonymizedScopePattern,
  AnonymizedGapPattern,
} from "@/types/analytics";

/** Regex patterns for PII detection */
const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const PHONE_REGEX =
  /(?:\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}/g;
// Match capitalized proper names (2+ capitalized words in sequence)
const PROPER_NAME_REGEX =
  /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b/g;

/**
 * Strip PII from text: emails, phone numbers, proper names.
 * Returns the redacted text with placeholders.
 */
export function redactPII(text: string): string {
  let result = text;
  result = result.replace(EMAIL_REGEX, "[REDACTED_EMAIL]");
  result = result.replace(PHONE_REGEX, "[REDACTED_PHONE]");
  result = result.replace(PROPER_NAME_REGEX, "[REDACTED_NAME]");
  return result;
}

/**
 * Anonymize scope selections — strip all fields except scopeItemId, relevance, selected.
 */
export function anonymizeScopeSelections(
  selections: Array<{
    scopeItemId: string;
    relevance: string;
    selected: boolean;
    [key: string]: unknown;
  }>,
): AnonymizedScopePattern[] {
  return selections.map((s) => ({
    scopeItemId: s.scopeItemId,
    relevance: s.relevance,
    selected: s.selected,
  }));
}

/**
 * Anonymize gap patterns — aggregate by resolutionType + truncated description,
 * redact PII, and count frequency.
 */
export function anonymizeGapPatterns(
  gaps: Array<{ gapDescription: string; resolutionType: string }>,
): AnonymizedGapPattern[] {
  if (gaps.length === 0) return [];

  const aggregation = new Map<string, { description: string; resolutionType: string; frequency: number }>();

  for (const gap of gaps) {
    const redacted = redactPII(gap.gapDescription);
    // Truncate to first 100 chars for grouping
    const truncated = redacted.length > 100 ? redacted.substring(0, 100) : redacted;
    const key = `${gap.resolutionType}::${truncated}`;

    const existing = aggregation.get(key);
    if (existing) {
      existing.frequency += 1;
    } else {
      aggregation.set(key, {
        description: truncated,
        resolutionType: gap.resolutionType,
        frequency: 1,
      });
    }
  }

  return Array.from(aggregation.values()).sort(
    (a, b) => b.frequency - a.frequency,
  );
}
