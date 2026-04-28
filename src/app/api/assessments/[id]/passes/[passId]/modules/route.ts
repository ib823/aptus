/**
 * Phase 5 — Module rollup for the workspace's module picker.
 *
 * GET → bucket-counts per module + sample-count hints (high-confidence,
 *       low-confidence, vendor-disagreement). Module-picker uses this to
 *       show which modules need attention.
 */

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/session";
import { getModuleRollup } from "@/lib/classification/pass-data";

export async function GET(
  _request: NextRequest,
  ctx: { params: Promise<{ id: string; passId: string }> },
): Promise<NextResponse> {
  const { id: assessmentId, passId } = await ctx.params;

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

  // Validate the pass belongs to this assessment (passId is currently unused
  // by getModuleRollup which reads via currentVerdictId; this guards future
  // pass-scoped variants).
  const pass = await prisma.classificationPass.findUnique({
    where: { id: passId },
    select: { assessmentId: true },
  });
  if (!pass || pass.assessmentId !== assessmentId) {
    return NextResponse.json({ error: "Pass not found for this assessment" }, { status: 404 });
  }

  const modules = await getModuleRollup(assessmentId);
  return NextResponse.json({ modules });
}
