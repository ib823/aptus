/**
 * Phase 5 — Module sample preview.
 *
 * GET → up to 10 representative requirements from this pass × module,
 *       prioritising vendor-disagreement and low-confidence cases.
 *
 * Backend for the workspace's "review before approve" sample table.
 */

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/session";
import { getModuleSample } from "@/lib/classification/pass-data";

export async function GET(
  _request: NextRequest,
  ctx: { params: Promise<{ id: string; passId: string; module: string }> },
): Promise<NextResponse> {
  const { id: assessmentId, passId, module } = await ctx.params;
  const decodedModule = decodeURIComponent(module);

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

  const pass = await prisma.classificationPass.findUnique({
    where: { id: passId },
    select: { assessmentId: true },
  });
  if (!pass || pass.assessmentId !== assessmentId) {
    return NextResponse.json({ error: "Pass not found for this assessment" }, { status: 404 });
  }

  const sample = await getModuleSample(assessmentId, decodedModule, passId);
  return NextResponse.json({ module: decodedModule, sample });
}
