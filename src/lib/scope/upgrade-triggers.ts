/**
 * Upgrade Trigger Engine — pure logic (no I/O).
 *
 * Given the current state of an assessment (requirements + scope selections +
 * scope-item metadata), produce a ranked list of UpgradeSuggestion records
 * that the consultant can review and approve.
 *
 * Five rules (per design spec § B.4):
 *   1. ClientRequirement classified as Gap maps to scope item X → suggest Medium
 *   2. ClientRequirement count for scope item ≥ 10 → suggest Medium
 *   3. Scope item is in a Gap-prone area (HR / Procurement-Ariba / Tax-3rd-party) → Medium
 *   4. Scope item has >500 steps + assessment is in Realize-readiness mode → Fine
 *   5. Industry-specific trigger (Financial Services → Treasury at Fine)
 *
 * Output is sorted by impact (rough heuristic: Gap-likelihood × scope item size).
 */

export type Granularity = "coarse" | "medium" | "fine";

export interface UpgradeSuggestion {
  scopeItemId: string;
  scopeItemName: string;
  currentGranularity: Granularity;
  suggestedGranularity: Granularity;
  reason: string;
  triggerRule: 1 | 2 | 3 | 4 | 5;
  impactScore: number; // higher = more important
}

export interface RequirementSignal {
  module: string;          // Bursa module name e.g. "Procurement"
  code: string;            // requirement code e.g. "C1"
  classification: string;  // e.g. "G - Gap"
  matchedScopeItemIds: string[]; // parsed from erpModuleSupporting
}

export interface ScopeSelectionSignal {
  scopeItemId: string;
  scopeItemName: string;
  functionalArea: string | null;
  totalSteps: number;
  granularity: Granularity;
}

export interface AssessmentSignal {
  industry: string | null;
  status: string;
}

const GRANULARITY_RANK: Record<Granularity, number> = { coarse: 0, medium: 1, fine: 2 };

function nextTier(current: Granularity, target: Granularity): Granularity | null {
  if (GRANULARITY_RANK[target] > GRANULARITY_RANK[current]) return target;
  return null;
}

/**
 * Extract scope item IDs from a free-text field. SAP scope item IDs are 2-4
 * uppercase alphanumeric chars (J58, BFA, 5XU, BMD, etc.). Filters out short
 * common words by requiring at least 2 chars and at least one digit OR
 * specific known patterns.
 */
export function parseScopeItemIds(text: string | null | undefined): string[] {
  if (!text) return [];
  const matches = text.match(/\b[A-Z0-9]{2,4}\b/g) ?? [];
  // Filter to plausible IDs: must contain at least one digit (most SAP scope items do)
  // OR be in a known whitelist of letter-only IDs (like BFA, BMD, BPD, etc. — uncommon but exist)
  return matches.filter(
    (m) => /\d/.test(m) || /^B[A-Z]{2}$/.test(m), // letter-only IDs typically start with B (BFA, BMD)
  );
}

/**
 * Gap-prone area heuristic — encodes "this LoB tends to need depth in 2602
 * baseline because key capabilities live in separate licenses."
 */
const GAP_PRONE_AREAS = [
  { match: /human resources/i, reason: "HR functionality typically requires SuccessFactors EC + talent suite (separate licenses) in 2602." },
  { match: /sourcing|procurement/i, reason: "Strategic sourcing (E-RFQ/RFP) and supplier portal need Ariba (separate license)." },
  { match: /tax|reporting/i, reason: "Corporate tax computation (Form C, capital allowances) requires 3rd-party tax tool." },
];

const FINANCIAL_SERVICES_TREASURY_IDS = new Set([
  "1WV", "1X1", "1X3", "1X7", "1X9", "1XB", "1XD", "1XN", "1MN",
  "2NZ", "2O0", "1YI", "16R", "1EG", "4X8", "1S2",
  "2F2", "2OI", "2HU", "2O2", "2RW", "2UF", "2UN", "3WY",
]);

const REALIZE_PHASE_STATUSES = new Set(["validated", "pending_sign_off", "signed_off", "handed_off"]);

export function computeUpgradeSuggestions(
  requirements: RequirementSignal[],
  selections: ScopeSelectionSignal[],
  assessment: AssessmentSignal,
): UpgradeSuggestion[] {
  const suggestions = new Map<string, UpgradeSuggestion>();

  function add(s: UpgradeSuggestion): void {
    const existing = suggestions.get(s.scopeItemId);
    // Keep the highest-impact suggestion per scope item; prefer higher target tier
    if (!existing) {
      suggestions.set(s.scopeItemId, s);
      return;
    }
    if (
      GRANULARITY_RANK[s.suggestedGranularity] > GRANULARITY_RANK[existing.suggestedGranularity] ||
      (s.suggestedGranularity === existing.suggestedGranularity && s.impactScore > existing.impactScore)
    ) {
      suggestions.set(s.scopeItemId, s);
    }
  }

  const selectionByItem = new Map(selections.map((s) => [s.scopeItemId, s]));
  const isFinancialServices = (assessment.industry ?? "").toLowerCase().includes("financial");
  const isRealizePhase = REALIZE_PHASE_STATUSES.has(assessment.status);

  // RULE 1: Gap requirements → Medium (or Fine if Gap is severe)
  // RULE 2: ≥10 requirements per scope item → Medium
  // (Combine into one pass over requirements grouped by scopeItemId)
  const reqsByScopeItem = new Map<string, RequirementSignal[]>();
  for (const r of requirements) {
    for (const id of r.matchedScopeItemIds) {
      if (!reqsByScopeItem.has(id)) reqsByScopeItem.set(id, []);
      reqsByScopeItem.get(id)!.push(r);
    }
  }

  for (const [scopeItemId, reqs] of reqsByScopeItem.entries()) {
    const sel = selectionByItem.get(scopeItemId);
    if (!sel) continue;

    const gapCount = reqs.filter((r) => r.classification.startsWith("G")).length;
    const totalCount = reqs.length;

    // Rule 1
    if (gapCount > 0) {
      const target = nextTier(sel.granularity, "medium");
      if (target) {
        const sample = reqs.find((r) => r.classification.startsWith("G"))!;
        add({
          scopeItemId,
          scopeItemName: sel.scopeItemName,
          currentGranularity: sel.granularity,
          suggestedGranularity: target,
          reason: `${gapCount} of ${totalCount} mapped requirement${totalCount > 1 ? "s" : ""} classified as Gap (e.g. ${sample.module}/${sample.code}). Verdict + notes recommended.`,
          triggerRule: 1,
          impactScore: 100 + gapCount * 10 + Math.min(sel.totalSteps, 1000) / 100,
        });
      }
    }

    // Rule 2
    if (totalCount >= 10) {
      const target = nextTier(sel.granularity, "medium");
      if (target) {
        add({
          scopeItemId,
          scopeItemName: sel.scopeItemName,
          currentGranularity: sel.granularity,
          suggestedGranularity: target,
          reason: `${totalCount} requirements map to this scope item — per-item verdict recommended for proposal accuracy.`,
          triggerRule: 2,
          impactScore: 50 + totalCount * 2,
        });
      }
    }
  }

  // RULE 3: Gap-prone areas
  for (const sel of selections) {
    if (sel.granularity !== "coarse") continue;
    if (!sel.functionalArea) continue;
    for (const rule of GAP_PRONE_AREAS) {
      if (rule.match.test(sel.functionalArea)) {
        const target = nextTier(sel.granularity, "medium");
        if (target) {
          add({
            scopeItemId: sel.scopeItemId,
            scopeItemName: sel.scopeItemName,
            currentGranularity: sel.granularity,
            suggestedGranularity: target,
            reason: `${sel.functionalArea} — ${rule.reason}`,
            triggerRule: 3,
            impactScore: 40 + Math.min(sel.totalSteps, 500) / 25,
          });
        }
        break;
      }
    }
  }

  // RULE 4: Large scope items in Realize-readiness phase
  if (isRealizePhase) {
    for (const sel of selections) {
      if (sel.totalSteps <= 500) continue;
      if (sel.granularity === "fine") continue;
      const target = nextTier(sel.granularity, "fine");
      if (target) {
        add({
          scopeItemId: sel.scopeItemId,
          scopeItemName: sel.scopeItemName,
          currentGranularity: sel.granularity,
          suggestedGranularity: target,
          reason: `Large scope item (${sel.totalSteps} steps) and assessment is in Realize-readiness — step-level review reduces estimation risk.`,
          triggerRule: 4,
          impactScore: 60 + Math.min(sel.totalSteps, 2000) / 50,
        });
      }
    }
  }

  // RULE 5: Industry-specific (Financial Services → Treasury at Fine)
  if (isFinancialServices) {
    for (const sel of selections) {
      if (!FINANCIAL_SERVICES_TREASURY_IDS.has(sel.scopeItemId)) continue;
      if (sel.granularity === "fine") continue;
      const target = nextTier(sel.granularity, "fine");
      if (target) {
        add({
          scopeItemId: sel.scopeItemId,
          scopeItemName: sel.scopeItemName,
          currentGranularity: sel.granularity,
          suggestedGranularity: target,
          reason: `Treasury / risk scope item is critical-path for Financial Services engagements — recommend step-level review.`,
          triggerRule: 5,
          impactScore: 80 + Math.min(sel.totalSteps, 1000) / 50,
        });
      }
    }
  }

  return Array.from(suggestions.values()).sort((a, b) => b.impactScore - a.impactScore);
}
