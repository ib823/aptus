/** GET: List flow diagrams. POST: Generate flow diagrams */

import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { isMfaRequired } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";
import { logDecision } from "@/lib/audit/decision-logger";
import { generateFlowSvg } from "@/lib/report/flow-diagram";
import { ERROR_CODES } from "@/types/api";
import { z } from "zod";
export async function GET(
  request: NextRequest,
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
  const scopeItemId = request.nextUrl.searchParams.get("scopeItemId") ?? undefined;

  const assessment = await prisma.assessment.findUnique({
    where: { id: assessmentId, deletedAt: null },
    select: { id: true },
  });

  if (!assessment) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.NOT_FOUND, message: "Assessment not found" } },
      { status: 404 },
    );
  }

  const where: Record<string, unknown> = { assessmentId };
  if (scopeItemId) where.scopeItemId = scopeItemId;

  const diagrams = await prisma.processFlowDiagram.findMany({
    where,
    select: {
      id: true,
      assessmentId: true,
      scopeItemId: true,
      processFlowName: true,
      diagramType: true,
      stepCount: true,
      fitCount: true,
      configureCount: true,
      gapCount: true,
      naCount: true,
      pendingCount: true,
      generatedAt: true,
    },
    orderBy: [{ scopeItemId: "asc" }, { processFlowName: "asc" }],
  });

  // Enrich with scope item names
  const scopeItemIds = [...new Set(diagrams.map((d) => d.scopeItemId))];
  const scopeItems = await prisma.scopeItem.findMany({
    where: { id: { in: scopeItemIds } },
    select: { id: true, nameClean: true },
  });
  const scopeMap = new Map(scopeItems.map((s) => [s.id, s.nameClean]));

  return NextResponse.json({
    data: diagrams.map((d) => ({
      ...d,
      scopeItemName: scopeMap.get(d.scopeItemId) ?? d.scopeItemId,
    })),
    summary: {
      totalDiagrams: diagrams.length,
      scopeItemsCovered: scopeItemIds.length,
      totalStepsInDiagrams: diagrams.reduce((sum, d) => sum + d.stepCount, 0),
    },
  });
}

const generateSchema = z.object({
  scopeItemIds: z.array(z.string()).optional(),
  regenerate: z.boolean().default(false),
});

export async function POST(
  request: NextRequest,
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

  const assessment = await prisma.assessment.findUnique({
    where: { id: assessmentId, deletedAt: null },
    select: { id: true },
  });

  if (!assessment) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.NOT_FOUND, message: "Assessment not found" } },
      { status: 404 },
    );
  }

  const body: unknown = await request.json();
  const parsed = generateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Invalid input" } },
      { status: 400 },
    );
  }

  // Get selected scope items
  const selections = await prisma.scopeSelection.findMany({
    where: { assessmentId, selected: true },
    select: { scopeItemId: true },
  });
  let targetIds = selections.map((s) => s.scopeItemId);
  if (parsed.data.scopeItemIds) {
    const requested = new Set(parsed.data.scopeItemIds);
    targetIds = targetIds.filter((id) => requested.has(id));
  }

  // Get scope item names
  const scopeItems = await prisma.scopeItem.findMany({
    where: { id: { in: targetIds } },
    select: { id: true, nameClean: true },
  });
  const scopeMap = new Map(scopeItems.map((s) => [s.id, s.nameClean]));

  let generated = 0;
  let skipped = 0;
  const scopeItemsCovered = new Set<string>();

  for (const scopeItemId of targetIds) {
    // Get process steps grouped by flow
    const steps = await prisma.processStep.findMany({
      where: { scopeItemId },
      select: {
        id: true,
        sequence: true,
        actionTitle: true,
        stepType: true,
        solutionProcessFlowName: true,
      },
      orderBy: { sequence: "asc" },
    });

    // Group by flow name
    const flowGroups = new Map<string, typeof steps>();
    for (const step of steps) {
      const flowName = step.solutionProcessFlowName ?? "Main Flow";
      const group = flowGroups.get(flowName) ?? [];
      group.push(step);
      flowGroups.set(flowName, group);
    }

    // Get step responses for this assessment
    const stepIds = steps.map((s) => s.id);
    const responses = await prisma.stepResponse.findMany({
      where: { assessmentId, processStepId: { in: stepIds } },
      select: { processStepId: true, fitStatus: true },
    });
    const responseMap = new Map(responses.map((r) => [r.processStepId, r.fitStatus]));

    for (const [flowName, flowSteps] of flowGroups) {
      // Check if diagram already exists
      if (!parsed.data.regenerate) {
        const existing = await prisma.processFlowDiagram.findUnique({
          where: { assessmentId_scopeItemId_processFlowName: { assessmentId, scopeItemId, processFlowName: flowName } },
        });
        if (existing) {
          skipped++;
          continue;
        }
      }

      // Build flow step data with fit statuses
      const enrichedSteps = flowSteps.map((s) => ({
        id: s.id,
        sequence: s.sequence,
        actionTitle: s.actionTitle,
        stepType: s.stepType,
        fitStatus: responseMap.get(s.id) ?? "PENDING",
      }));

      const svg = generateFlowSvg(
        flowName,
        scopeMap.get(scopeItemId) ?? scopeItemId,
        enrichedSteps,
      );

      // Count statuses
      const fitCount = enrichedSteps.filter((s) => s.fitStatus === "FIT").length;
      const configureCount = enrichedSteps.filter((s) => s.fitStatus === "CONFIGURE").length;
      const gapCount = enrichedSteps.filter((s) => s.fitStatus === "GAP").length;
      const naCount = enrichedSteps.filter((s) => s.fitStatus === "NA").length;
      const pendingCount = enrichedSteps.filter((s) => s.fitStatus === "PENDING").length;

      await prisma.processFlowDiagram.upsert({
        where: { assessmentId_scopeItemId_processFlowName: { assessmentId, scopeItemId, processFlowName: flowName } },
        create: {
          assessmentId,
          scopeItemId,
          processFlowName: flowName,
          svgContent: svg,
          diagramType: "sequential",
          stepCount: enrichedSteps.length,
          fitCount,
          configureCount,
          gapCount,
          naCount,
          pendingCount,
          generatedBy: user.email,
        },
        update: {
          svgContent: svg,
          stepCount: enrichedSteps.length,
          fitCount,
          configureCount,
          gapCount,
          naCount,
          pendingCount,
          generatedBy: user.email,
          generatedAt: new Date(),
        },
      });

      generated++;
      scopeItemsCovered.add(scopeItemId);
    }
  }

  if (generated > 0) {
    await logDecision({
      assessmentId,
      entityType: "assessment",
      entityId: assessmentId,
      action: "FLOW_DIAGRAM_GENERATED",
      newValue: { generated, skipped, scopeItemsCovered: scopeItemsCovered.size },
      actor: user.email,
      actorRole: user.role,
    });
  }

  return NextResponse.json({
    success: true,
    generated,
    skipped,
    scopeItemsCovered: scopeItemsCovered.size,
  }, { status: 202 });
}
