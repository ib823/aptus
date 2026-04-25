/**
 * GET /api/assessments/[id]/scope/upgrade-suggestions
 *
 * Returns ranked upgrade suggestions for the assessment's ScopeSelections,
 * computed from the trigger engine. No DB writes — read-only.
 */

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/session";
import {
  computeUpgradeSuggestions,
  parseScopeItemIds,
  type Granularity,
  type RequirementSignal,
  type ScopeSelectionSignal,
} from "@/lib/scope/upgrade-triggers";

export async function GET(
  _request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id: assessmentId } = await ctx.params;

  const assessment = await prisma.assessment.findUnique({
    where: { id: assessmentId, deletedAt: null },
    select: { id: true, organizationId: true, industry: true, status: true },
  });
  if (!assessment) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (
    user.organizationId !== assessment.organizationId &&
    user.role !== "platform_admin"
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Pull active selections + their scope item metadata + all requirements
  const [selections, requirements] = await Promise.all([
    prisma.scopeSelection.findMany({
      where: { assessmentId, selected: true },
      select: { scopeItemId: true, granularity: true },
    }),
    prisma.clientRequirement.findMany({
      where: { assessmentId },
      select: {
        module: true,
        code: true,
        solutionProviderResponse: true,
        erpModuleSupporting: true,
      },
    }),
  ]);

  const scopeItems = await prisma.scopeItem.findMany({
    where: { id: { in: selections.map((s) => s.scopeItemId) } },
    select: { id: true, name: true, functionalArea: true, totalSteps: true },
  });
  const scopeMap = new Map(scopeItems.map((s) => [s.id, s]));

  const selectionSignals: ScopeSelectionSignal[] = selections.map((s) => {
    const meta = scopeMap.get(s.scopeItemId);
    return {
      scopeItemId: s.scopeItemId,
      scopeItemName: meta?.name ?? s.scopeItemId,
      functionalArea: meta?.functionalArea ?? null,
      totalSteps: meta?.totalSteps ?? 0,
      granularity: s.granularity as Granularity,
    };
  });

  const requirementSignals: RequirementSignal[] = requirements.map((r) => ({
    module: r.module,
    code: r.code,
    classification: r.solutionProviderResponse ?? "",
    matchedScopeItemIds: parseScopeItemIds(r.erpModuleSupporting),
  }));

  const suggestions = computeUpgradeSuggestions(requirementSignals, selectionSignals, {
    industry: assessment.industry,
    status: assessment.status,
  });

  return NextResponse.json({
    ok: true,
    count: suggestions.length,
    suggestions,
  });
}
