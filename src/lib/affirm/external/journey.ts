/**
 * ABeam Workbench — Affirm external journey read model (PR-3).
 *
 * Aggregates the grant-scoped, leak-safe GuestAffirmSet (getAffirmSetForGrant)
 * with the guest's responses and the chaptered content into the shapes the
 * /a/* journey pages need: the L0 value-chain ribbon, the L1 stream index, the
 * L1 process story, and the L2 in-context questions. Everything reaches the
 * pages already serialized through the allowlist (GuestQuestion), so no raw
 * Prisma object crosses the boundary.
 */

import { prisma } from "@/lib/db/prisma";
import {
  getChapteredFlow,
  getProcessFlowForScopeItem,
  getStreamStories,
  type ChapteredFlow,
  type ProcessFlow,
} from "@/lib/affirm/process-flow";
import { getAffirmSetForGrant, type GuestQuestion } from "./serializers";
import type { AffirmChoice } from "@/lib/affirm/types";

async function loadGrant(grantId: string) {
  return prisma.affirmAccessGrant.findUnique({
    where: { id: grantId },
    select: {
      bundleId: true,
      displayName: true,
      roleLabel: true,
      valueStreamIds: true,
    },
  });
}

function inGrantScope(valueStreamIds: string[], streamId: string): boolean {
  return valueStreamIds.length === 0 || valueStreamIds.includes(streamId);
}

async function responsesByQuestion(bundleId: string): Promise<Map<string, AffirmChoice>> {
  const rows = await prisma.affirmResponse.findMany({
    where: { bundleId },
    select: { questionId: true, choice: true },
  });
  return new Map(rows.map((r) => [r.questionId, r.choice as AffirmChoice]));
}

// ─── L0: home value-chain ribbon ─────────────────────────────────────────────

export type NodeState = "done" | "some" | "none";

export interface RibbonNode {
  scopeItemId: string;
  state: NodeState;
}

export interface JourneyStreamSummary {
  streamId: string;
  streamName: string;
  /** Questions answered / total in the stream (drives the progress ring). */
  answered: number;
  total: number;
  /** Processes (scope items with questions) fully affirmed / total. */
  processesAffirmed: number;
  processesTotal: number;
  status: "complete" | "started" | "not-started";
  nodes: RibbonNode[];
}

export interface GuestJourney {
  grant: { displayName: string; roleLabel: string | null };
  bundle: { client: string; state: string };
  streams: JourneyStreamSummary[];
  totals: { total: number; answered: number };
}

export async function getGuestJourney(grantId: string): Promise<GuestJourney | null> {
  const grant = await loadGrant(grantId);
  if (!grant) return null;
  const set = await getAffirmSetForGrant(grantId);
  if (!set) return null;
  const answers = await responsesByQuestion(grant.bundleId);

  // Per-scope-item question tallies (a "process" = a scope item with questions).
  const itemTally = new Map<string, { streamId: string; total: number; answered: number }>();
  for (const item of set.scopeItems) {
    const itemQs = set.questions.filter((q) => q.scopeItemRefs.includes(item.id));
    if (itemQs.length === 0) continue;
    itemTally.set(item.id, {
      streamId: item.streamId,
      total: itemQs.length,
      answered: itemQs.filter((q) => answers.has(q.id)).length,
    });
  }

  const byStream = new Map<string, JourneyStreamSummary>();
  const streamName = (id: string) =>
    set.questions.find((q) => q.streamId === id)?.streamName ?? id;
  for (const q of set.questions) {
    const s =
      byStream.get(q.streamId) ??
      {
        streamId: q.streamId,
        streamName: q.streamName,
        answered: 0,
        total: 0,
        processesAffirmed: 0,
        processesTotal: 0,
        status: "not-started" as const,
        nodes: [] as RibbonNode[],
      };
    s.total += 1;
    if (answers.has(q.id)) s.answered += 1;
    byStream.set(q.streamId, s);
  }

  for (const [scopeItemId, t] of itemTally) {
    const s =
      byStream.get(t.streamId) ??
      {
        streamId: t.streamId,
        streamName: streamName(t.streamId),
        answered: 0,
        total: 0,
        processesAffirmed: 0,
        processesTotal: 0,
        status: "not-started" as const,
        nodes: [] as RibbonNode[],
      };
    s.processesTotal += 1;
    const state: NodeState = t.answered >= t.total ? "done" : t.answered > 0 ? "some" : "none";
    if (state === "done") s.processesAffirmed += 1;
    s.nodes.push({ scopeItemId, state });
    byStream.set(t.streamId, s);
  }

  const streams = [...byStream.values()].map((s) => ({
    ...s,
    nodes: s.nodes.sort((a, b) => a.scopeItemId.localeCompare(b.scopeItemId)),
    status:
      s.processesTotal > 0 && s.processesAffirmed >= s.processesTotal
        ? ("complete" as const)
        : s.answered > 0
          ? ("started" as const)
          : ("not-started" as const),
  }));

  const total = streams.reduce((n, s) => n + s.total, 0);
  const answered = streams.reduce((n, s) => n + s.answered, 0);

  return {
    grant: { displayName: grant.displayName, roleLabel: grant.roleLabel },
    bundle: set.bundle,
    streams,
    totals: { total, answered },
  };
}

// ─── L1: stream index ────────────────────────────────────────────────────────

export interface StreamIndexCard {
  scopeItemId: string;
  description: string;
  headline: string | null;
  outcomeBullets: string[];
  chapterCount: number;
  questionCount: number;
  answered: number;
}

export interface GuestStreamIndex {
  bundle: { client: string; state: string };
  streamId: string;
  streamName: string;
  cards: StreamIndexCard[];
}

/** Null when the stream is not in the grant's scope. */
export async function getGuestStreamIndex(
  grantId: string,
  streamId: string,
): Promise<GuestStreamIndex | null> {
  const grant = await loadGrant(grantId);
  if (!grant || !inGrantScope(grant.valueStreamIds, streamId)) return null;
  const set = await getAffirmSetForGrant(grantId);
  if (!set) return null;

  const answers = await responsesByQuestion(grant.bundleId);
  const stories = await getStreamStories(grant.bundleId, streamId);
  const streamName = set.questions.find((q) => q.streamId === streamId)?.streamName ?? streamId;

  const cards: StreamIndexCard[] = stories.map((s) => {
    const itemQs = set.questions.filter((q) => q.scopeItemRefs.includes(s.scopeItemId));
    return {
      scopeItemId: s.scopeItemId,
      description: s.description,
      headline: s.story?.headline ?? null,
      outcomeBullets: s.story?.outcomeBullets ?? [],
      chapterCount: s.chapterCount,
      questionCount: itemQs.length,
      answered: itemQs.filter((q) => answers.has(q.id)).length,
    };
  });

  return { bundle: set.bundle, streamId, streamName, cards };
}

// ─── L1: process story ───────────────────────────────────────────────────────

export interface GuestProcessPage {
  bundle: { client: string; state: string };
  scopeItemId: string;
  description: string;
  streamId: string;
  /** Present when the scope item has a reviewed, chaptered story. */
  chaptered: ChapteredFlow | null;
  /** Flat fallback flow (used when chaptered is null). */
  flatFlow: ProcessFlow | null;
  questionCount: number;
  answered: number;
}

/** Null when the scope item is not in the grant's scope. */
export async function getGuestProcessPage(
  grantId: string,
  scopeItemId: string,
): Promise<GuestProcessPage | null> {
  const grant = await loadGrant(grantId);
  if (!grant) return null;
  const item = await prisma.affirmScopeItem.findUnique({
    where: { id: scopeItemId },
    select: { id: true, description: true, streamId: true },
  });
  if (!item || !inGrantScope(grant.valueStreamIds, item.streamId)) return null;
  // Must be in this bundle too.
  const inBundle = await prisma.affirmBundleScopeItem.findUnique({
    where: { bundleId_scopeItemId: { bundleId: grant.bundleId, scopeItemId } },
    select: { bundleId: true },
  });
  if (!inBundle) return null;

  const set = await getAffirmSetForGrant(grantId);
  if (!set) return null;

  const chaptered = await getChapteredFlow(scopeItemId);
  const flatFlow = chaptered ? null : await getProcessFlowForScopeItem(scopeItemId);
  const itemQs = set.questions.filter((q) => q.scopeItemRefs.includes(scopeItemId));
  const answers = await responsesByQuestion(grant.bundleId);

  return {
    bundle: set.bundle,
    scopeItemId,
    description: item.description,
    streamId: item.streamId,
    chaptered,
    flatFlow,
    questionCount: itemQs.length,
    answered: itemQs.filter((q) => answers.has(q.id)).length,
  };
}

// ─── L2: in-context questions ────────────────────────────────────────────────

export interface GuestScopeAffirm {
  bundle: { client: string; state: string };
  scopeItemId: string;
  description: string;
  streamId: string;
  questions: GuestQuestion[];
  answers: Array<{ questionId: string; choice: AffirmChoice; reason: string | null }>;
  /** Chapter titles for context headers, when the item has reviewed chapters. */
  chapterTitles: string[];
}

/** Null when the scope item is not in the grant's scope. */
export async function getGuestScopeAffirm(
  grantId: string,
  scopeItemId: string,
): Promise<GuestScopeAffirm | null> {
  const grant = await loadGrant(grantId);
  if (!grant) return null;
  const item = await prisma.affirmScopeItem.findUnique({
    where: { id: scopeItemId },
    select: { id: true, description: true, streamId: true },
  });
  if (!item || !inGrantScope(grant.valueStreamIds, item.streamId)) return null;

  const set = await getAffirmSetForGrant(grantId);
  if (!set) return null;
  const questions = set.questions.filter((q) => q.scopeItemRefs.includes(scopeItemId));

  const rows = await prisma.affirmResponse.findMany({
    where: { bundleId: grant.bundleId, questionId: { in: questions.map((q) => q.id) } },
    select: { questionId: true, choice: true, reason: true },
  });
  const answers = rows.map((r) => ({
    questionId: r.questionId,
    choice: r.choice as AffirmChoice,
    reason: r.reason,
  }));

  const chaptered = await getChapteredFlow(scopeItemId);
  const chapterTitles = chaptered ? chaptered.chapters.map((c) => c.title) : [];

  return {
    bundle: set.bundle,
    scopeItemId,
    description: item.description,
    streamId: item.streamId,
    questions,
    answers,
    chapterTitles,
  };
}

// ─── Submit summary ──────────────────────────────────────────────────────────

export interface SummaryItem {
  questionId: string;
  scopeItemId: string;
  text: string;
  reason: string | null;
}

export interface GuestSummary {
  bundle: { client: string; state: string };
  grant: { displayName: string; roleLabel: string | null };
  buckets: {
    standard: SummaryItem[];
    discuss: SummaryItem[];
    deviate: SummaryItem[];
  };
  counts: { standard: number; discuss: number; deviate: number };
  total: number;
  answered: number;
}

export async function getGuestSummary(grantId: string): Promise<GuestSummary | null> {
  const grant = await loadGrant(grantId);
  if (!grant) return null;
  const set = await getAffirmSetForGrant(grantId);
  if (!set) return null;

  const rows = await prisma.affirmResponse.findMany({
    where: { bundleId: grant.bundleId },
    select: { questionId: true, choice: true, reason: true },
  });
  const byId = new Map(rows.map((r) => [r.questionId, r]));

  const buckets = { standard: [] as SummaryItem[], discuss: [] as SummaryItem[], deviate: [] as SummaryItem[] };
  let answered = 0;
  for (const q of set.questions) {
    const r = byId.get(q.id);
    if (!r) continue;
    answered += 1;
    const item: SummaryItem = {
      questionId: q.id,
      scopeItemId: q.scopeItemRefs[0] ?? "",
      text: q.consultantWording ?? q.plainLanguageSuggested ?? q.sapVerbatim ?? q.id,
      reason: r.reason,
    };
    // Information-format questions land in "discuss" (they carry no adopt-standard).
    const choice = q.format === "information" ? (r.choice === "deviate" ? "discuss" : r.choice) : r.choice;
    if (choice === "standard") buckets.standard.push(item);
    else if (choice === "deviate") buckets.deviate.push(item);
    else buckets.discuss.push(item);
  }

  return {
    bundle: set.bundle,
    grant: { displayName: grant.displayName, roleLabel: grant.roleLabel },
    buckets,
    counts: {
      standard: buckets.standard.length,
      discuss: buckets.discuss.length,
      deviate: buckets.deviate.length,
    },
    total: set.questions.length,
    answered,
  };
}
