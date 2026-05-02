/** GET: Calculate readiness scorecard for an assessment */

import { NextResponse, type NextRequest } from "next/server";
import { authenticateForReport, isErrorResponse, sanitizeFilename } from "@/lib/report/report-auth";
import { prisma } from "@/lib/db/prisma";
import { ERROR_CODES } from "@/types/api";
import { calculateReadinessScorecard } from "@/lib/report/readiness-calculator";
import { generateReadinessScorecardPdf } from "@/lib/report/pdf-generator";
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const auth = await authenticateForReport(id);
  if (isErrorResponse(auth)) return auth;

  const assessment = await prisma.assessment.findUnique({
    where: { id, deletedAt: null },
    select: { id: true, companyName: true },
  });

  if (!assessment) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.NOT_FOUND, message: "Assessment not found" } },
      { status: 404 },
    );
  }

  const [
    totalScopeItems,
    decidedScopeItems,
    totalSteps,
    reviewedSteps,
    totalGaps,
    resolvedGaps,
    totalIntegrations,
    analyzedIntegrations,
    totalDmObjects,
    readyDmObjects,
    totalOcmImpacts,
    mitigatedOcmImpacts,
    totalStakeholders,
    activeStakeholders,
    totalSignOffs,
    completedSignOffs,
  ] = await Promise.all([
    prisma.scopeSelection.count({ where: { assessmentId: id } }),
    prisma.scopeSelection.count({ where: { assessmentId: id, relevance: { not: "MAYBE" } } }),
    prisma.stepResponse.count({ where: { assessmentId: id } }),
    prisma.stepResponse.count({ where: { assessmentId: id, fitStatus: { not: "PENDING" } } }),
    prisma.gapResolution.count({ where: { assessmentId: id } }),
    // A gap counts as resolved when a decision exists (decidedBy not null) OR
    // the client has explicitly approved it. AUTO_BACKFILL rows carry decidedBy
    // but not clientApproved — they are resolutions, not pending work.
    prisma.gapResolution.count({
      where: {
        assessmentId: id,
        OR: [{ clientApproved: true }, { decidedBy: { not: null } }],
      },
    }),
    prisma.integrationPoint.count({ where: { assessmentId: id } }),
    // "Analyzed" = past the initial identified/draft phase. Statuses observed
    // in the wild: identified, draft, analyzed, designed, approved, in_progress,
    // completed. Anything past identified/draft counts as analyzed.
    prisma.integrationPoint.count({
      where: { assessmentId: id, status: { notIn: ["identified", "draft"] } },
    }),
    prisma.dataMigrationObject.count({ where: { assessmentId: id } }),
    prisma.dataMigrationObject.count({
      where: { assessmentId: id, status: { notIn: ["identified", "draft"] } },
    }),
    prisma.ocmImpact.count({ where: { assessmentId: id } }),
    prisma.ocmImpact.count({
      where: { assessmentId: id, status: { notIn: ["identified", "draft"] } },
    }),
    prisma.assessmentStakeholder.count({ where: { assessmentId: id } }),
    prisma.assessmentStakeholder.count({ where: { assessmentId: id, acceptedAt: { not: null } } }),
    prisma.assessmentSignOff.count({ where: { assessmentId: id } }),
    // A sign-off counts as completed when the signatory has acknowledged.
    // Previously this query mirrored the "total" half exactly — a bug that
    // always reported 100% sign-off completion regardless of state.
    prisma.assessmentSignOff.count({
      where: { assessmentId: id, acknowledgement: true },
    }),
  ]);

  const scorecard = calculateReadinessScorecard({
    totalScopeItems,
    decidedScopeItems,
    totalSteps,
    reviewedSteps,
    totalGaps,
    resolvedGaps,
    totalIntegrations,
    analyzedIntegrations,
    totalDmObjects,
    readyDmObjects,
    totalOcmImpacts,
    mitigatedOcmImpacts,
    totalStakeholders,
    activeStakeholders,
    totalSignOffs,
    completedSignOffs,
  });

  // Return PDF if requested via ?format=pdf
  const format = _request.nextUrl.searchParams.get("format");
  if (format === "pdf") {
    const pdf = generateReadinessScorecardPdf(assessment.companyName, scorecard);
    return new NextResponse(pdf as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${sanitizeFilename(assessment.companyName)}_Readiness_Scorecard.pdf"`,
      },
    });
  }

  return NextResponse.json({ data: scorecard });
}
