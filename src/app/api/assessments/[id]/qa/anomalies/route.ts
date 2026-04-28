/**
 * Phase 6 — QA dashboard anomaly endpoint.
 *
 * GET → all classification anomalies for the assessment + summary counts.
 * Returns the exact failure patterns the Bursa session's reactive correction
 * loop hit (see anomaly-detector.ts).
 */

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/session";
import { detectAnomalies, summariseAnomalies } from "@/lib/classification/anomaly-detector";

export async function GET(
  _request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: assessmentId } = await ctx.params;

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const assessment = await prisma.assessment.findUnique({
    where: { id: assessmentId, deletedAt: null },
    select: { id: true, organizationId: true },
  });
  if (!assessment) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (user.organizationId !== assessment.organizationId && user.role !== "platform_admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const anomalies = await detectAnomalies(assessmentId);
  const summary = summariseAnomalies(anomalies);

  return NextResponse.json({ anomalies, summary });
}
