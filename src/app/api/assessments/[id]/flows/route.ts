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
  if (targetIds.length === 0) {
    return NextResponse.json({
      success: true,
      generated: 0,
      skipped: 0,
      scopeItemsCovered: 0,
    }, { status: 202 });
  }

  // Batch-fetch all required data for target scope items to avoid per-scope N+1 queries.
  const [scopeItems, processFlows, allSteps, existingDiagrams] = await Promise.all([
    prisma.scopeItem.findMany({
      where: { id: { in: targetIds } },
      select: { id: true, nameClean: true },
    }),
    prisma.processFlow.findMany({
      where: { solutionProcess: { scopeItemId: { in: targetIds } } },
      select: {
        id: true,
        name: true,
        solutionProcess: {
          select: { scopeItemId: true },
        },
      },
    }),
    prisma.processStep.findMany({
      where: { scopeItemId: { in: targetIds } },
      select: {
        id: true,
        scopeItemId: true,
        sequence: true,
        actionTitle: true,
        stepType: true,
        solutionProcessFlowName: true,
      },
      orderBy: [{ scopeItemId: "asc" }, { sequence: "asc" }],
    }),
    parsed.data.regenerate
      ? Promise.resolve([])
      : prisma.processFlowDiagram.findMany({
          where: { assessmentId, scopeItemId: { in: targetIds } },
          select: { scopeItemId: true, processFlowName: true },
        }),
  ]);

  const scopeMap = new Map(scopeItems.map((s) => [s.id, s.nameClean]));
  const flowIdByScopeAndName = new Map<string, string>();
  for (const processFlow of processFlows) {
    flowIdByScopeAndName.set(
      `${processFlow.solutionProcess.scopeItemId}::${processFlow.name}`,
      processFlow.id,
    );
  }

  const flowGroupsByScope = new Map<string, Map<string, typeof allSteps>>();
  for (const step of allSteps) {
    const flowName = step.solutionProcessFlowName ?? "Main Flow";
    const byFlow = flowGroupsByScope.get(step.scopeItemId) ?? new Map<string, typeof allSteps>();
    const group = byFlow.get(flowName) ?? [];
    group.push(step);
    byFlow.set(flowName, group);
    flowGroupsByScope.set(step.scopeItemId, byFlow);
  }

  const allStepIds = allSteps.map((step) => step.id);
  const responses = allStepIds.length > 0
    ? await prisma.stepResponse.findMany({
        where: { assessmentId, processStepId: { in: allStepIds } },
        select: { processStepId: true, fitStatus: true },
      })
    : [];
  const responseMap = new Map(responses.map((r) => [r.processStepId, r.fitStatus]));

  const existingKeys = new Set(
    existingDiagrams.map((diagram) => `${diagram.scopeItemId}::${diagram.processFlowName}`),
  );

  const createPayload: Array<{
    assessmentId: string;
    scopeItemId: string;
    processFlowName: string;
    processFlowId: string | null;
    svgContent: string;
    diagramType: string;
    stepCount: number;
    fitCount: number;
    configureCount: number;
    gapCount: number;
    naCount: number;
    pendingCount: number;
    generatedBy: string;
  }> = [];
  const upsertPayload: Array<{
    scopeItemId: string;
    processFlowName: string;
    processFlowId: string | null;
    svgContent: string;
    stepCount: number;
    fitCount: number;
    configureCount: number;
    gapCount: number;
    naCount: number;
    pendingCount: number;
  }> = [];

  let generated = 0;
  let skipped = 0;
  const scopeItemsCovered = new Set<string>();

  for (const scopeItemId of targetIds) {
    const flowGroups = flowGroupsByScope.get(scopeItemId);
    if (!flowGroups || flowGroups.size === 0) continue;

    for (const [flowName, flowSteps] of flowGroups) {
      const key = `${scopeItemId}::${flowName}`;
      if (!parsed.data.regenerate && existingKeys.has(key)) {
        skipped++;
        continue;
      }

      // Build flow step data with fit statuses
      let fitCount = 0;
      let configureCount = 0;
      let gapCount = 0;
      let naCount = 0;
      let pendingCount = 0;
      const enrichedSteps = flowSteps.map((step) => {
        const fitStatus = responseMap.get(step.id) ?? "PENDING";
        switch (fitStatus) {
          case "FIT":
            fitCount++;
            break;
          case "CONFIGURE":
            configureCount++;
            break;
          case "GAP":
            gapCount++;
            break;
          case "NA":
            naCount++;
            break;
          default:
            pendingCount++;
            break;
        }
        return {
          id: step.id,
          sequence: step.sequence,
          actionTitle: step.actionTitle,
          stepType: step.stepType,
          fitStatus,
        };
      });

      const svg = generateFlowSvg(
        flowName,
        scopeMap.get(scopeItemId) ?? scopeItemId,
        enrichedSteps,
      );

      const processFlowId = flowIdByScopeAndName.get(key) ?? null;
      if (parsed.data.regenerate) {
        upsertPayload.push({
          scopeItemId,
          processFlowName: flowName,
          processFlowId,
          svgContent: svg,
          stepCount: enrichedSteps.length,
          fitCount,
          configureCount,
          gapCount,
          naCount,
          pendingCount,
        });
      } else {
        createPayload.push({
          assessmentId,
          scopeItemId,
          processFlowName: flowName,
          processFlowId,
          svgContent: svg,
          diagramType: "sequential",
          stepCount: enrichedSteps.length,
          fitCount,
          configureCount,
          gapCount,
          naCount,
          pendingCount,
          generatedBy: user.email,
        });
      }

      generated++;
      scopeItemsCovered.add(scopeItemId);
    }
  }

  if (parsed.data.regenerate) {
    const UPSERT_BATCH_SIZE = 100;
    for (let i = 0; i < upsertPayload.length; i += UPSERT_BATCH_SIZE) {
      const batch = upsertPayload.slice(i, i + UPSERT_BATCH_SIZE);
      await prisma.$transaction(
        batch.map((item) =>
          prisma.processFlowDiagram.upsert({
            where: {
              assessmentId_scopeItemId_processFlowName: {
                assessmentId,
                scopeItemId: item.scopeItemId,
                processFlowName: item.processFlowName,
              },
            },
            create: {
              assessmentId,
              scopeItemId: item.scopeItemId,
              processFlowName: item.processFlowName,
              processFlowId: item.processFlowId,
              svgContent: item.svgContent,
              diagramType: "sequential",
              stepCount: item.stepCount,
              fitCount: item.fitCount,
              configureCount: item.configureCount,
              gapCount: item.gapCount,
              naCount: item.naCount,
              pendingCount: item.pendingCount,
              generatedBy: user.email,
            },
            update: {
              svgContent: item.svgContent,
              processFlowId: item.processFlowId,
              stepCount: item.stepCount,
              fitCount: item.fitCount,
              configureCount: item.configureCount,
              gapCount: item.gapCount,
              naCount: item.naCount,
              pendingCount: item.pendingCount,
              generatedBy: user.email,
              generatedAt: new Date(),
            },
          }),
        ),
      );
    }
  } else if (createPayload.length > 0) {
    const inserted = await prisma.processFlowDiagram.createMany({
      data: createPayload,
      skipDuplicates: true,
    });
    if (inserted.count < createPayload.length) {
      skipped += createPayload.length - inserted.count;
    }
    generated = inserted.count;
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
