/**
 * Phase 5 — Per-module sign-off.
 *
 * POST → approves all verdicts in this pass × module by ensuring isCurrent=true
 *        on each. Idempotent. Updates the pass's summaryJson with the
 *        approval timestamp + actor for audit.
 *
 * Backend for the in-app workspace's "Approve module" button.
 */

import { NextResponse, type NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/session";

export async function POST(
  _request: NextRequest,
  ctx: { params: Promise<{ id: string; passId: string; module: string }> },
): Promise<NextResponse> {
  const { id: assessmentId, passId, module } = await ctx.params;
  const decodedModule = decodeURIComponent(module);

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const assessment = await prisma.assessment.findUnique({
    where: { id: assessmentId, deletedAt: null },
    select: { id: true, organizationId: true, status: true },
  });
  if (!assessment) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (user.organizationId !== assessment.organizationId && user.role !== "platform_admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Frozen-assessment check (AD-7)
  if (assessment.status === "signed_off") {
    return NextResponse.json(
      { error: "Cannot approve module on a signed_off assessment" },
      { status: 409 },
    );
  }

  // Validate the pass belongs to this assessment
  const pass = await prisma.classificationPass.findUnique({
    where: { id: passId },
    select: { id: true, assessmentId: true, summaryJson: true },
  });
  if (!pass || pass.assessmentId !== assessmentId) {
    return NextResponse.json({ error: "Pass not found for this assessment" }, { status: 404 });
  }

  // Find all verdicts in this pass for this module
  const moduleVerdicts = await prisma.classificationVerdict.findMany({
    where: {
      passId,
      requirement: { module: decodedModule, assessmentId },
    },
    select: { id: true, requirementId: true },
  });

  if (moduleVerdicts.length === 0) {
    return NextResponse.json({ error: `No verdicts in pass ${passId} for module "${decodedModule}"` }, { status: 404 });
  }

  // Mark all verdicts in this pass+module as current; supersede prior currents.
  // Done in a transaction for atomicity.
  const requirementIds = moduleVerdicts.map((v) => v.requirementId);
  const verdictIds = moduleVerdicts.map((v) => v.id);

  await prisma.$transaction([
    prisma.classificationVerdict.updateMany({
      where: { requirementId: { in: requirementIds }, isCurrent: true, id: { notIn: verdictIds } },
      data: { isCurrent: false },
    }),
    prisma.classificationVerdict.updateMany({
      where: { id: { in: verdictIds } },
      data: { isCurrent: true },
    }),
    // Refresh the read-cache pointer on each requirement
    ...moduleVerdicts.map((v) =>
      prisma.clientRequirement.update({
        where: { id: v.requirementId },
        data: { currentVerdictId: v.id },
      }),
    ),
  ]);

  // Stamp the approval into the pass's summaryJson
  const summary = (pass.summaryJson as Record<string, unknown> | null) ?? {};
  const approvals = (summary.moduleApprovals as Record<string, unknown> | undefined) ?? {};
  approvals[decodedModule] = { approvedAt: new Date().toISOString(), approvedBy: user.id, count: moduleVerdicts.length };
  await prisma.classificationPass.update({
    where: { id: passId },
    data: { summaryJson: { ...summary, moduleApprovals: approvals } as Prisma.InputJsonValue },
  });

  return NextResponse.json({
    approved: moduleVerdicts.length,
    module: decodedModule,
    passId,
  });
}
