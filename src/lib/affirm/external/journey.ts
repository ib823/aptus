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

export interface JourneyStreamSummary {
  streamId: string;
  streamName: string;
  subProcesses: Array<{ id: string; name: string }>;
  total: number;
  answered: number;
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

  const byStream = new Map<string, JourneyStreamSummary>();
  for (const q of set.questions) {
    const s =
      byStream.get(q.streamId) ??
      {
        streamId: q.streamId,
        streamName: q.streamName,
        subProcesses: [] as Array<{ id: string; name: string }>,
        total: 0,
        answered: 0,
      };
    s.total += 1;
    if (answers.has(q.id)) s.answered += 1;
    if (!s.subProcesses.some((sp) => sp.id === q.subProcessId)) {
      s.subProcesses.push({ id: q.subProcessId, name: q.subProcessName });
    }
    byStream.set(q.streamId, s);
  }

  const streams = [...byStream.values()];
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
  const questionCount = set.questions.filter((q) => q.scopeItemRefs.includes(scopeItemId)).length;

  return {
    bundle: set.bundle,
    scopeItemId,
    description: item.description,
    streamId: item.streamId,
    chaptered,
    flatFlow,
    questionCount,
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

export interface GuestSummary {
  bundle: { client: string; state: string };
  grant: { displayName: string; roleLabel: string | null };
  buckets: {
    standard: number;
    discuss: number;
    deviate: number;
  };
  total: number;
  answered: number;
}

export async function getGuestSummary(grantId: string): Promise<GuestSummary | null> {
  const grant = await loadGrant(grantId);
  if (!grant) return null;
  const set = await getAffirmSetForGrant(grantId);
  if (!set) return null;
  const answers = await responsesByQuestion(grant.bundleId);

  let standard = 0;
  let discuss = 0;
  let deviate = 0;
  let answered = 0;
  for (const q of set.questions) {
    const choice = answers.get(q.id);
    if (!choice) continue;
    answered += 1;
    if (choice === "standard") standard += 1;
    else if (choice === "discuss") discuss += 1;
    else if (choice === "deviate") deviate += 1;
  }

  return {
    bundle: set.bundle,
    grant: { displayName: grant.displayName, roleLabel: grant.roleLabel },
    buckets: { standard, discuss, deviate },
    total: set.questions.length,
    answered,
  };
}
