/**
 * Phase 7 — Unified gap workspace API.
 *
 * GET → all gaps with all facets (configs / integrations / data migration /
 * OCM impacts) joined per-gap. Powers the Resolve Gaps Workspace surface.
 *
 * Auth: org-scoped, matches existing /api/assessments/[id]/* convention.
 */

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/session";
import { getGapWorkspaceData } from "@/lib/gap-workspace/unified-gap-data";

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

  const data = await getGapWorkspaceData(assessmentId);
  return NextResponse.json({ gaps: data, total: data.length });
}
