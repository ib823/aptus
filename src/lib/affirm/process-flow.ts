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
