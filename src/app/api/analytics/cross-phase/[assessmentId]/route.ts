/** GET: Cross-phase analytics for a specific assessment */

import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { isMfaRequired } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";
import { ERROR_CODES } from "@/types/api";
import { computeFitRate } from "@/lib/analytics/benchmark-engine";
import { generateTrendInsights } from "@/lib/analytics/scope-delta";
import type { ScopeDelta, ClassificationDelta } from "@/types/analytics";
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ assessmentId: string }> },
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.UNAUTHORIZED, message: "Not authenticated" } },
      { status: 401 },
    );
  }

  if (isMfaRequired(user)) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.MFA_REQUIRED, message: "MFA verification required" } },
      { status: 403 },
    );
  }

  const { assessmentId } = await params;

  // Find phase links involving this assessment
  const links = await prisma.assessmentPhaseLink.findMany({
    where: {
      OR: [
        { phase1AssessmentId: assessmentId },
        { phase2AssessmentId: assessmentId },
      ],
    },
    orderBy: { linkedAt: "desc" },
  });

  if (links.length === 0) {
    return NextResponse.json({
      data: {
        links: [],
        phaseSummaries: [],
        insights: ["No cross-phase links found for this assessment."],
      },
    });
  }

  // Gather all related assessment IDs
  const relatedIds = new Set<string>();
  for (const link of links) {
    relatedIds.add(link.phase1AssessmentId);
    relatedIds.add(link.phase2AssessmentId);
  }

  // Load summary data for all related assessments
  const assessments = await prisma.assessment.findMany({
    where: { id: { in: Array.from(relatedIds) } },
    select: {
      id: true,
      companyName: true,
      status: true,
      organizationId: true,
      createdAt: true,
      updatedAt: true,
      stepResponses: { select: { fitStatus: true } },
      scopeSelections: { select: { scopeItemId: true, selected: true } },
    },
  });

  // Verify org access
  if (user.organizationId) {
    const hasAccess = assessments.every((a) => a.organizationId === user.organizationId);
    if (!hasAccess) {
      return NextResponse.json(
        { error: { code: ERROR_CODES.FORBIDDEN, message: "Assessments do not belong to your organization" } },
        { status: 403 },
      );
    }
  }

  const phaseSummaries = assessments.map((a) => {
    const fitCount = a.stepResponses.filter((r) => r.fitStatus.toUpperCase() === "FIT").length;
    const gapCount = a.stepResponses.filter((r) => r.fitStatus.toUpperCase() === "GAP").length;
    const configCount = a.stepResponses.filter((r) => r.fitStatus.toUpperCase() === "CONFIGURE").length;
    const naCount = a.stepResponses.filter((r) => r.fitStatus.toUpperCase() === "NA").length;
    const totalSteps = a.stepResponses.length;

    return {
      assessmentId: a.id,
      companyName: a.companyName,
      status: a.status,
      completedAt: ["completed", "reviewed", "signed_off", "validated", "handed_off", "archived"].includes(a.status) ? a.updatedAt.toISOString() : null,
      totalSteps,
      fitCount,
      gapCount,
      configCount,
      naCount,
      fitRate: computeFitRate(a.stepResponses),
      scopeItemCount: a.scopeSelections.filter((s) => s.selected).length,
    };
  });

  // Generate insights from the most recent link
  const latestLink = links[0];
  let insights: string[] = [];
  if (latestLink) {
    const scopeDelta = latestLink.scopeDelta as ScopeDelta | null;
    const classificationDelta = latestLink.classificationDelta as ClassificationDelta | null;

    if (scopeDelta && classificationDelta) {
      const p1Summary = phaseSummaries.find((s) => s.assessmentId === latestLink.phase1AssessmentId);
      const p2Summary = phaseSummaries.find((s) => s.assessmentId === latestLink.phase2AssessmentId);

      if (p1Summary && p2Summary) {
        insights = generateTrendInsights(
          scopeDelta,
          classificationDelta,
          p1Summary.fitRate,
          p2Summary.fitRate,
        );
      }
    }
  }

  return NextResponse.json({
    data: {
      links: links.map((l) => ({
        id: l.id,
        clientIdentifier: l.clientIdentifier,
        phase1AssessmentId: l.phase1AssessmentId,
        phase2AssessmentId: l.phase2AssessmentId,
        scopeDelta: l.scopeDelta,
        classificationDelta: l.classificationDelta,
        linkedAt: l.linkedAt,
      })),
      phaseSummaries,
      insights,
    },
  });
}
