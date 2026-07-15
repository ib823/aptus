/**
 * Read-side helpers for the Layer-3 process-flow data.
 *
 * No UI consumers yet — the visual component (<ProcessFlowStrip />)
 * lands in a follow-up once the aligned Claude design ships. These
 * helpers exist so the data is queryable as soon as the v2.1
 * migration applies, and so the eventual component has a stable
 * surface to wire to.
 */
import { prisma } from "@/lib/db/prisma";

export interface ProcessFlowStep {
  stepNumber: number;
  /** SAP-verbatim activity name — never edited at any layer. */
  activity: string;
  /** Zero or more Fiori app names tied to the step. */
  fioriApps: string[];
}

export interface ProcessFlow {
  scopeItemId: string;
  /** SAP release the flow was extracted from (currently "2602"). */
  sapRelease: string;
  /** Country whose mandatory path we extracted (currently "MY"). */
  country: string;
  /** Raw activity count in the source — for context, not display. */
  activityCount: number;
  /** Optional steps in the source that were dropped from the flow. */
  optionalCount: number;
  /** Clean MY-mandatory step count — same as steps.length. */
  myStepCount: number;
  steps: ProcessFlowStep[];
}

/**
 * Returns the MY-mandatory flow for a single scope item, or null if
 * the scope item carries no MY-mandatory steps (17 of 672 today).
 */
export async function getProcessFlowForScopeItem(
  scopeItemId: string,
): Promise<ProcessFlow | null> {
  const flow = await prisma.affirmProcessFlow.findUnique({
    where: { scopeItemId },
    include: { steps: { orderBy: { stepNumber: "asc" } } },
  });
  if (!flow) return null;
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

/**
 * Returns the flows for every scope item in a bundle, keyed by
 * scopeItemId. Scope items without a flow are omitted (use
 * `bundle.scopeItems.length - result.size` to count gaps).
 */
export async function getProcessFlowsForBundle(
  bundleId: string,
): Promise<Map<string, ProcessFlow>> {
  const bundle = await prisma.affirmBundle.findUnique({
    where: { id: bundleId },
    include: { scopeItems: { select: { scopeItemId: true } } },
  });
  if (!bundle) return new Map();
  const ids = bundle.scopeItems.map((s) => s.scopeItemId);
  if (ids.length === 0) return new Map();

  const flows = await prisma.affirmProcessFlow.findMany({
    where: { scopeItemId: { in: ids } },
    include: { steps: { orderBy: { stepNumber: "asc" } } },
  });

  const out = new Map<string, ProcessFlow>();
  for (const flow of flows) {
    out.set(flow.scopeItemId, {
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
    });
  }
  return out;
}

// ─── PR-2: chaptered content read model (review-gated) ───────────────────────

export interface ScopeItemStory {
  headline: string;
  outcomeBullets: string[];
  kpiHints: string[];
  integrationNotes: string[];
  sourceAttribution: string;
  processNavigatorUrl: string | null;
}

export interface FlowChapter {
  chapterNumber: number;
  title: string;
  summary: string;
  stepStart: number;
  stepEnd: number;
  roles: string[];
  fioriApps: string[];
  benefitNote: string | null;
  /** The SAP-verbatim steps this chapter covers (unaltered). */
  steps: ProcessFlowStep[];
}

export interface ChapteredFlow {
  scopeItemId: string;
  story: ScopeItemStory;
  chapters: FlowChapter[];
}

/**
 * Returns the reviewed, chaptered flow for a scope item, or null. Null when the
 * scope item has no story, the story is UNREVIEWED (render gate), or it has no
 * chapters — callers fall back to the flat <ProcessFlowStrip>. Chapters carry
 * their SAP-verbatim steps unaltered.
 */
export async function getChapteredFlow(scopeItemId: string): Promise<ChapteredFlow | null> {
  const story = await prisma.affirmScopeItemStory.findUnique({
    where: { scopeItemId },
  });
  // Review gate: unreviewed stories never render.
  if (!story || story.reviewedAt === null) return null;

  const [chapters, flow] = await Promise.all([
    prisma.affirmProcessChapter.findMany({
      where: { scopeItemId },
      orderBy: { chapterNumber: "asc" },
    }),
    prisma.affirmProcessFlow.findUnique({
      where: { scopeItemId },
      include: { steps: { orderBy: { stepNumber: "asc" } } },
    }),
  ]);
  if (chapters.length === 0) return null;

  const allSteps: ProcessFlowStep[] =
    flow?.steps.map((s) => ({
      stepNumber: s.stepNumber,
      activity: s.activity,
      fioriApps: s.fioriApps,
    })) ?? [];

  return {
    scopeItemId,
    story: {
      headline: story.headline,
      outcomeBullets: story.outcomeBullets,
      kpiHints: story.kpiHints,
      integrationNotes: story.integrationNotes,
      sourceAttribution: story.sourceAttribution,
      processNavigatorUrl: story.processNavigatorUrl,
    },
    chapters: chapters.map((c) => ({
      chapterNumber: c.chapterNumber,
      title: c.title,
      summary: c.summary,
      stepStart: c.stepStart,
      stepEnd: c.stepEnd,
      roles: c.roles,
      fioriApps: c.fioriApps,
      benefitNote: c.benefitNote,
      steps: allSteps.filter((s) => s.stepNumber >= c.stepStart && s.stepNumber <= c.stepEnd),
    })),
  };
}

export interface StreamStorySummary {
  scopeItemId: string;
  description: string;
  /** Present only when the story is reviewed; null → render a compact card. */
  story: ScopeItemStory | null;
  chapterCount: number;
}

/**
 * L1-index summaries for a stream within a bundle: every scope item in the
 * bundle that belongs to the stream, with its reviewed story (or null) and
 * chapter count. Items whose story is unreviewed return story:null so the UI
 * renders a compact card instead of a fake narrative.
 */
export async function getStreamStories(
  bundleId: string,
  streamId: string,
): Promise<StreamStorySummary[]> {
  const rows = await prisma.affirmBundleScopeItem.findMany({
    where: { bundleId, scopeItem: { streamId } },
    select: {
      scopeItem: {
        select: {
          id: true,
          description: true,
          story: true,
          _count: { select: { chapters: true } },
        },
      },
    },
    orderBy: { scopeItemId: "asc" },
  });

  return rows.map((r) => {
    const s = r.scopeItem;
    const reviewed = s.story && s.story.reviewedAt !== null ? s.story : null;
    return {
      scopeItemId: s.id,
      description: s.description,
      story: reviewed
        ? {
            headline: reviewed.headline,
            outcomeBullets: reviewed.outcomeBullets,
            kpiHints: reviewed.kpiHints,
            integrationNotes: reviewed.integrationNotes,
            sourceAttribution: reviewed.sourceAttribution,
            processNavigatorUrl: reviewed.processNavigatorUrl,
          }
        : null,
      chapterCount: s._count.chapters,
    };
  });
}
