/** GET: Auto-suggest resolutions from intelligence layer */

import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { isMfaRequired } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";
import { ERROR_CODES } from "@/types/api";
import { suggestResolutions } from "@/lib/assessment/gap-suggest";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
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

  const { id: assessmentId } = await params;

  // Load all gaps, extensibility patterns, and adaptation patterns
  const [gaps, extensibilityPatterns, adaptationPatterns] = await Promise.all([
    prisma.gapResolution.findMany({
      where: { assessmentId },
      select: {
        id: true,
        gapDescription: true,
        resolutionType: true,
      },
    }),
    prisma.extensibilityPattern.findMany({
      select: {
        id: true,
        gapPattern: true,
        resolutionType: true,
        resolutionDescription: true,
        effortDays: true,
        riskLevel: true,
      },
    }),
    prisma.adaptationPattern.findMany({
      select: {
        id: true,
        commonGap: true,
        recommendation: true,
        rationale: true,
        adaptEffort: true,
      },
    }),
  ]);

  // Build unified pattern list for matching
  const patterns = [
    ...extensibilityPatterns.map((p) => ({
      id: p.id,
      description: p.gapPattern,
      resolutionType: p.resolutionType,
      effortDays: p.effortDays ?? undefined,
      riskLevel: p.riskLevel ?? undefined,
    })),
    ...adaptationPatterns.map((p) => ({
      id: p.id,
      description: p.commonGap,
      resolutionType: p.recommendation,
      effortDays: p.adaptEffort ? parseInt(p.adaptEffort, 10) || undefined : undefined,
      riskLevel: undefined,
    })),
  ];

  // Compute suggestions per gap
  const suggestions: Record<string, ReturnType<typeof suggestResolutions>> = {};
  for (const gap of gaps) {
    const matches = suggestResolutions(gap.gapDescription, patterns);
    if (matches.length > 0) {
      suggestions[gap.id] = matches;
    }
  }

  return NextResponse.json({ data: suggestions });
}
