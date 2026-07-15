/**
 * ABeam Workbench — Affirm external serializers (THE LEAK BOUNDARY).
 *
 * Every object that reaches an /a/* page or route passes through an explicit
 * allowlist mapper here. Raw Prisma rows and the wide AffirmQuestionRow never
 * cross the boundary. Banned fields (statusNote, flag, enabled, sscuiRef,
 * status, isCustom, createdById, effort/IP-related, other grantees' data) are
 * dropped by construction — the walker test in tests/unit/affirm/external
 * asserts none of them appear at any depth of the serialized output.
 *
 * Decision: sscuiRef is consultant-facing configuration metadata — excluded
 * externally. sapArea / sapTopic are business-language grouping labels and are
 * safe to show. sapVerbatim / activity are SAP-verbatim public text, displayed
 * (collapsed) — never mutated.
 */

import { prisma } from "@/lib/db/prisma";
import { getAffirmSetForBundle, type AffirmQuestionRow } from "@/lib/affirm/queries";
import { getProcessFlowsForBundle, type ProcessFlow } from "@/lib/affirm/process-flow";

// ─── Output shapes ───────────────────────────────────────────────────────────

export interface GuestBundleSummary {
  client: string;
  state: string;
}

export interface GuestQuestion {
  id: string;
  streamId: string;
  streamName: string;
  subProcessId: string;
  subProcessName: string;
  format: "decision" | "information";
  displayOrder: number;
  sapArea: string | null;
  sapTopic: string | null;
  sapVerbatim: string | null;
  plainLanguageSuggested: string | null;
  consultantWording: string | null;
  aboutText: string | null;
  standardMeans: string | null;
  scopeItemRefs: string[];
}

export interface GuestScopeItem {
  id: string;
  description: string;
  streamId: string;
  subProcessId: string;
}

export interface GuestFlowStep {
  stepNumber: number;
  activity: string;
  fioriApps: string[];
}

export interface GuestFlow {
  scopeItemId: string;
  sapRelease: string;
  country: string;
  activityCount: number;
  optionalCount: number;
  myStepCount: number;
  steps: GuestFlowStep[];
}

export interface GuestAffirmSet {
  bundle: GuestBundleSummary;
  questions: GuestQuestion[];
  scopeItems: GuestScopeItem[];
  flows: Record<string, GuestFlow>;
}

// ─── Allowlist mappers ───────────────────────────────────────────────────────

export function toGuestBundleSummary(bundle: { client: string; state: string }): GuestBundleSummary {
  return { client: bundle.client, state: bundle.state };
}

export function toGuestQuestion(row: AffirmQuestionRow): GuestQuestion {
  return {
    id: row.id,
    streamId: row.streamId,
    streamName: row.streamName,
    subProcessId: row.subProcessId,
    subProcessName: row.subProcessName,
    format: row.format,
    displayOrder: row.displayOrder,
    sapArea: row.sapArea,
    sapTopic: row.sapTopic,
    sapVerbatim: row.sapVerbatim,
    plainLanguageSuggested: row.plainLanguageSuggested,
    consultantWording: row.consultantWording,
    aboutText: row.aboutText,
    standardMeans: row.standardMeans,
    scopeItemRefs: row.scopeItemRefs,
  };
}

export function toGuestScopeItem(item: {
  id: string;
  description: string;
  streamId: string;
  subProcessId: string;
}): GuestScopeItem {
  return {
    id: item.id,
    description: item.description,
    streamId: item.streamId,
    subProcessId: item.subProcessId,
  };
}

export function toGuestFlow(flow: ProcessFlow): GuestFlow {
  return {
    scopeItemId: flow.scopeItemId,
    sapRelease: flow.sapRelease,
    country: flow.country,
    activityCount: flow.activityCount,
    optionalCount: flow.optionalCount,
    myStepCount: flow.myStepCount,
    steps: flow.steps.map((s) => ({
      stepNumber: s.stepNumber,
      activity: s.activity,
      fioriApps: s.fioriApps,
    })),
  };
}

// ─── The grant-scoped read model ─────────────────────────────────────────────

/** True when a stream is in the grant's persona scope (empty scope = all). */
function inScope(valueStreamIds: string[], streamId: string): boolean {
  return valueStreamIds.length === 0 || valueStreamIds.includes(streamId);
}

/**
 * The single sanctioned external read. Wraps getAffirmSetForBundle(..,
 * {forClient:true}), filters scope items + questions to the grant's value
 * streams (empty = all streams in the bundle), and maps EVERY object through
 * the allowlist serializers. No raw Prisma object escapes.
 */
export async function getAffirmSetForGrant(grantId: string): Promise<GuestAffirmSet | null> {
  const grant = await prisma.affirmAccessGrant.findUnique({
    where: { id: grantId },
    select: { bundleId: true, valueStreamIds: true },
  });
  if (!grant) return null;

  const bundle = await prisma.affirmBundle.findUnique({
    where: { id: grant.bundleId },
    select: { client: true, state: true },
  });
  if (!bundle) return null;

  const streams = grant.valueStreamIds;

  const rows = await getAffirmSetForBundle(grant.bundleId, { forClient: true });
  const questions = rows.filter((r) => inScope(streams, r.streamId)).map(toGuestQuestion);

  const scopeRows = await prisma.affirmBundleScopeItem.findMany({
    where: { bundleId: grant.bundleId },
    select: {
      scopeItem: {
        select: { id: true, description: true, streamId: true, subProcessId: true },
      },
    },
  });
  const scopeItems = scopeRows
    .map((r) => r.scopeItem)
    .filter((s) => inScope(streams, s.streamId))
    .map(toGuestScopeItem);
  const inScopeItemIds = new Set(scopeItems.map((s) => s.id));

  const flowMap = await getProcessFlowsForBundle(grant.bundleId);
  const flows: Record<string, GuestFlow> = {};
  for (const [scopeItemId, flow] of flowMap.entries()) {
    if (inScopeItemIds.has(scopeItemId)) flows[scopeItemId] = toGuestFlow(flow);
  }

  return {
    bundle: toGuestBundleSummary(bundle),
    questions,
    scopeItems,
    flows,
  };
}
