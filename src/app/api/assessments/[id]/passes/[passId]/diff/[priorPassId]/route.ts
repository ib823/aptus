/**
 * Phase 5 — Pass diff API.
 *
 * GET → returns the changed verdicts + bucket-transition counts between
 *       a pass and its prior pass.
 *
 * Backend for the in-app classification workspace's "what changed in this
 * pass" view.
 */

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/session";
import { getPassDiff } from "@/lib/classification/pass-data";

export async function GET(
  _request: NextRequest,
  ctx: { params: Promise<{ id: string; passId: string; priorPassId: string }> },
): Promise<NextResponse> {
  const { id: assessmentId, passId, priorPassId } = await ctx.params;

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

  // Validate both passes belong to this assessment
  const passCount = await prisma.classificationPass.count({
    where: { id: { in: [passId, priorPassId] }, assessmentId },
  });
  if (passCount !== 2) {
    return NextResponse.json(
      { error: "One or both pass IDs not found for this assessment" },
      { status: 404 },
    );
  }

  const diff = await getPassDiff(assessmentId, passId, priorPassId);
  return NextResponse.json(diff);
}
