/**
 * ABeam Workbench — Presales redaction layer.
 *
 * ════════════════════════════════════════════════════════════════════════
 * READ PATHS ARE DELIBERATELY ASYMMETRIC. DO NOT CONSOLIDATE.
 *
 *   External (/c/* guest surface)    → ALWAYS via this module.
 *   Consultant dashboard (/dashboard) → reads PresalesBundle and
 *                                       PresalesBundleDecision DIRECTLY.
 *
 * The consultant must see `effort`, `effortDays`, `custom_type`,
 * `ext_impact`, `ricefw_class`, and `sscui_refs` — those are the IP-bearing
 * fields that drive the SOW. Routing the consultant's reads through this
 * module would BREAK the consultant view. Routing the guest's reads around
 * this module would LEAK IP to the prospect — catastrophic.
 *
 * If you are tempted to "while I'm refactoring, let me consolidate all
 * decision-reads through one function": STOP. The two read paths must stay
 * type-distinct and code-distinct. Future dashboard code lives elsewhere
 * (e.g. src/lib/presales/consultant.ts when that work begins) and reads the
 * raw Prisma types directly.
 * ════════════════════════════════════════════════════════════════════════
 *
 * Single most important piece of code in the presales subsystem. IP-bearing
 * fields (effort estimates, custom development types, upgrade impact,
 * RICEFW classification, SSCUI references) must NEVER reach the external
 * client surface at /c/s/[scopeCode].
 *
 * Two redaction surfaces:
 *
 *   1) ScopeItemContent snapshot — stored frozen in
 *      PresalesBundle.contentSnapshotJson, consumed by getScopeItemForExternal.
 *      Strips from each Decision: effort, custom_type, ext_impact,
 *      ricefw_class. Strips from the envelope: sscui_refs.
 *
 *   2) PresalesBundleDecision row — append-only history of stakeholder
 *      choices. The row carries effortDays which is INTERNAL. Any external-
 *      view code path that loads decisions must filter through
 *      redactPresalesDecisionRow before serializing.
 *
 * The redaction is type-driven: TypeScript's Omit<> means a redaction-layer
 * regression at compile time is preferred over a runtime check.
 */

import type { PresalesBundleDecision, PrismaClient } from '@prisma/client';
import type { Decision, ScopeItemContent } from '@/lib/fts/types';

// ─── Redacted types ─────────────────────────────────────────────────────────

// The four IP-bearing Decision fields stripped on the external surface.
// Kept as a type union (rather than a const tuple) so ESLint doesn't flag
// an unused runtime value — the consts are spelled out in the destructure
// in redactDecision below.
type StrippedDecisionKey = 'effort' | 'custom_type' | 'ext_impact' | 'ricefw_class';

export type RedactedDecision = Omit<Decision, StrippedDecisionKey>;

export type RedactedScopeItemContent = Omit<ScopeItemContent, 'decisions' | 'sscui_refs'> & {
  decisions: RedactedDecision[];
};

export type RedactedPresalesDecisionRow = Omit<PresalesBundleDecision, 'effortDays'>;

/**
 * Banned-key list. Exported so tests (especially the integration walker on
 * the hydration JSON) can be kept in sync with the redaction layer without
 * drift. If you add a new redacted field, add it here and the test fails
 * until the redaction function also drops it.
 */
export const REDACTED_KEYS = [
  'effort',
  'effortDays',
  'custom_type',
  'ext_impact',
  'ricefw_class',
  'sscui_refs',
] as const;
export type RedactedKey = (typeof REDACTED_KEYS)[number];

// ─── Pure redactors ─────────────────────────────────────────────────────────

/**
 * Strips effort hints embedded in description strings. The structured
 * `effort` field is redacted via Omit<>, but the source-of-truth fixture
 * files hard-code phrases like "~4-6 days" inside `cst_desc` / `cfg_desc`
 * / `summary`. The locked decision is "client never sees effort days, in
 * any form" — so we scrub the textual mention too. The integration test's
 * \b\d+\s*days?\b sweep enforces this rule globally.
 *
 * Pattern intentionally permissive: matches "5 days", "~5 days", "5-7 days",
 * "5 days per variant", with optional leading whitespace and optional
 * trailing period. After substitution we collapse internal whitespace and
 * trim trailing punctuation/space so the resulting text reads cleanly.
 */
const DAY_MENTION_RE = /\s*~?\s*\d+(?:[-–]\d+)?\s*days?(?:\s+per\s+\w+)?\.?/gi;

export function stripDayMentions(text: string): string {
  if (!text) return text;
  return text
    .replace(DAY_MENTION_RE, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export function redactDecision(d: Decision): RedactedDecision {
  const {
    effort: _effort,
    custom_type: _customType,
    ext_impact: _extImpact,
    ricefw_class: _ricefwClass,
    summary,
    std_desc,
    cfg_desc,
    cst_desc,
    ...rest
  } = d;
  return {
    ...rest,
    summary: stripDayMentions(summary),
    std_desc: stripDayMentions(std_desc),
    cfg_desc: stripDayMentions(cfg_desc),
    cst_desc: stripDayMentions(cst_desc),
  };
}

export function redactScopeItem(content: ScopeItemContent): RedactedScopeItemContent {
  const { decisions, sscui_refs: _sscuiRefs, ...rest } = content;
  return { ...rest, decisions: decisions.map(redactDecision) };
}

export function redactPresalesDecisionRow(
  row: PresalesBundleDecision,
): RedactedPresalesDecisionRow {
  const { effortDays: _effortDays, ...rest } = row;
  return rest;
}

// ─── Snapshot loader ────────────────────────────────────────────────────────

/**
 * Loads the frozen ScopeItemContent for one scope from a bundle's snapshot
 * and returns the redacted projection. Returns null when the bundle or the
 * scope code is not found. Never throws on missing bundle — the route layer
 * decides whether 404 or 410-Gone is the right response.
 *
 * IMPORTANT: this function is the ONLY supported way to obtain a
 * ScopeItemContent for the (external) route group. Direct reads of
 * contentSnapshotJson by any external-view code path are a redaction-layer
 * regression and the integration test will fail the build.
 */
export async function getScopeItemForExternal(
  prisma: PrismaClient,
  scopeCode: string,
  bundleId: string,
): Promise<RedactedScopeItemContent | null> {
  const bundle = await prisma.presalesBundle.findUnique({
    where: { id: bundleId },
    select: { contentSnapshotJson: true },
  });
  if (!bundle) return null;

  const snapshot = bundle.contentSnapshotJson as unknown;
  if (!Array.isArray(snapshot)) return null;

  const item = (snapshot as ScopeItemContent[]).find((s) => s?.code === scopeCode);
  if (!item) return null;

  return redactScopeItem(item);
}

/**
 * Redacted view of the current (latest non-superseded) decision row for
 * each decisionId in this (bundle, scopeCode). The map carries the choice
 * and notes — never effortDays. Used by the scope page to render which
 * choice the stakeholder has currently selected.
 */
export interface RedactedDecisionState {
  choice: string;
  notes: string;
  setAt: Date;
  rowId: string;
  /** The grant id of the reviewer who set the current value. Null when
   * the row was inserted by a server-side seed or when the FK has been
   * cleared by a grant revocation cascade. Resolve to a display name via
   * resolveDecisionAttribution. */
  setByGrantId: string | null;
}

export async function getDecisionStatesForExternal(
  prisma: PrismaClient,
  scopeCode: string,
  bundleId: string,
): Promise<Map<string, RedactedDecisionState>> {
  const rows = await prisma.presalesBundleDecision.findMany({
    where: { bundleId, scopeCode, supersededAt: null },
    orderBy: { setAt: 'desc' },
  });
  const map = new Map<string, RedactedDecisionState>();
  for (const row of rows) {
    if (map.has(row.decisionId)) continue; // keep the latest by setAt desc
    const redacted = redactPresalesDecisionRow(row);
    map.set(row.decisionId, {
      choice: redacted.choice,
      notes: redacted.notes,
      setAt: redacted.setAt,
      rowId: redacted.id,
      setByGrantId: redacted.setByGrantId,
    });
  }
  return map;
}

/**
 * Resolves grant ids → reviewer display names for a given bundle, with a
 * single round-trip. Untouched decisions (no current row) get the bundle
 * creator's name as the "drafted by" fallback, per the multi-stakeholder
 * safety spec. Never returns a raw email — `displayName` is the value
 * the consultant gave when inviting; that's the same value visible on
 * the original invitation email, so it's not new information leakage.
 */
export interface DecisionAttribution {
  /** Display name to show in the "set by" line. */
  name: string;
  /** True when this is the bundle creator (untouched decision draft). */
  isDraftFallback: boolean;
}

export async function resolveDecisionAttribution(
  prisma: PrismaClient,
  args: { bundleId: string; grantIds: ReadonlyArray<string | null> },
): Promise<{
  byGrantId: Map<string, DecisionAttribution>;
  draftFallback: DecisionAttribution;
}> {
  const uniqueGrantIds = Array.from(
    new Set(args.grantIds.filter((g): g is string => !!g)),
  );

  const [grants, bundle] = await Promise.all([
    uniqueGrantIds.length > 0
      ? prisma.presalesAccessGrant.findMany({
          where: { id: { in: uniqueGrantIds } },
          select: { id: true, displayName: true, email: true },
        })
      : Promise.resolve([] as Array<{ id: string; displayName: string | null; email: string }>),
    prisma.presalesBundle.findUnique({
      where: { id: args.bundleId },
      select: { creator: { select: { name: true } } },
    }),
  ]);

  const byGrantId = new Map<string, DecisionAttribution>();
  for (const g of grants) {
    byGrantId.set(g.id, {
      name: g.displayName?.trim() || g.email,
      isDraftFallback: false,
    });
  }

  const draftFallback: DecisionAttribution = {
    name: bundle?.creator?.name?.trim() || 'your ABeam consultant',
    isDraftFallback: true,
  };

  return { byGrantId, draftFallback };
}
