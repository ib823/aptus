/** PUT: Upsert scope selection for a scope item */

import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { isMfaRequired, canEditScopeSelection } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";
import { logDecision } from "@/lib/audit/decision-logger";
import { logActivity } from "@/lib/collaboration/activity-logger";
import { ERROR_CODES } from "@/types/api";
import { z } from "zod";

const selectionSchema = z.object({
  selected: z.boolean(),
  relevance: z.enum(["YES", "NO", "MAYBE"]),
  currentState: z.enum(["MANUAL", "SYSTEM", "OUTSOURCED", "NA"]).nullable().optional(),
  notes: z.string().nullable().optional(),
  priority: z.enum(["critical", "high", "medium", "low"]).nullable().optional(),
  businessJustification: z.string().max(5000).nullable().optional(),
  estimatedComplexity: z.enum(["low", "medium", "high"]).nullable().optional(),
  dependsOnScopeItems: z.array(z.string()).optional(),
});
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; scopeItemId: string }> },
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

  const { id: assessmentId, scopeItemId } = await params;

  const body: unknown = await request.json();
  const parsed = selectionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Validation failed" } },
      { status: 400 },
    );
  }

  // Check scope item exists and get its functional area
  const scopeItem = await prisma.scopeItem.findUnique({
    where: { id: scopeItemId },
    select: { functionalArea: true, nameClean: true },
  });

  if (!scopeItem) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.NOT_FOUND, message: "Scope item not found" } },
      { status: 404 },
    );
  }

  // Check permissions
  const permCheck = await canEditScopeSelection(user, assessmentId, scopeItem.functionalArea);
  if (!permCheck.allowed) {
    return NextResponse.json(
      { error: { code: permCheck.code ?? ERROR_CODES.FORBIDDEN, message: permCheck.message ?? "Forbidden" } },
      { status: 403 },
    );
  }

  // Get existing selection for decision log
  const existing = await prisma.scopeSelection.findUnique({
    where: {
      assessmentId_scopeItemId: { assessmentId, scopeItemId },
    },
    select: { selected: true, relevance: true, currentState: true },
  });

  // Upsert the selection
  const selectionData = {
    selected: parsed.data.selected,
    relevance: parsed.data.relevance,
    currentState: parsed.data.currentState ?? null,
    notes: parsed.data.notes ?? null,
    respondent: user.email,
    respondedAt: new Date(),
    priority: parsed.data.priority ?? null,
    businessJustification: parsed.data.businessJustification ?? null,
    estimatedComplexity: parsed.data.estimatedComplexity ?? null,
    dependsOnScopeItems: parsed.data.dependsOnScopeItems ?? [],
  };

  const selection = await prisma.scopeSelection.upsert({
    where: {
      assessmentId_scopeItemId: { assessmentId, scopeItemId },
    },
    update: selectionData,
    create: {
      assessmentId,
      scopeItemId,
      ...selectionData,
    },
  });

  // Log decision
  const action = parsed.data.selected ? "SCOPE_INCLUDED" : "SCOPE_EXCLUDED";
  await logDecision({
    assessmentId,
    entityType: "scope_item",
    entityId: scopeItemId,
    action,
    oldValue: existing ? { selected: existing.selected, relevance: existing.relevance } : undefined,
    newValue: { selected: parsed.data.selected, relevance: parsed.data.relevance },
    actor: user.email,
    actorRole: user.role,
  });

  // Log activity (fire-and-forget)
  logActivity({
    assessmentId,
    actorId: user.id,
    actorName: user.name ?? user.email,
    actorRole: user.role,
    actionType: "scope_changed",
    summary: parsed.data.selected ? "included scope item" : "excluded scope item",
    entityType: "scope_item",
    entityId: scopeItemId,
    areaCode: scopeItem.functionalArea,
  }).catch(() => { /* fire-and-forget */ });

  // Check for cross-scope dependency warnings after deselection
  const scopeWarnings: Array<{ missingScopeCode: string; missingScopeName: string; businessReason: string }> = [];
  if (!parsed.data.selected) {
    try {
      const crossDeps = await prisma.crossScopeDependency.findMany({
        where: {
          isActive: true,
          OR: [
            { sourceScopeCode: scopeItemId },
            { targetScopeCode: scopeItemId },
          ],
        },
        select: {
          sourceScopeCode: true,
          targetScopeCode: true,
          direction: true,
          businessReason: true,
        },
      });

      if (crossDeps.length > 0) {
        // Find other selected scopes that depend on this one
        const otherSelections = await prisma.scopeSelection.findMany({
          where: { assessmentId, selected: true, scopeItemId: { not: scopeItemId } },
          select: { scopeItemId: true },
        });
        const otherSelectedSet = new Set(otherSelections.map((s) => s.scopeItemId));
        const affectedScopeIds = new Set<string>();

        for (const dep of crossDeps) {
          const affectedScope =
            dep.sourceScopeCode === scopeItemId ? dep.targetScopeCode : dep.sourceScopeCode;

          if (otherSelectedSet.has(affectedScope)) {
            affectedScopeIds.add(affectedScope);
          }
        }

        if (affectedScopeIds.size > 0) {
          for (const dep of crossDeps) {
            const affectedScope =
              dep.sourceScopeCode === scopeItemId ? dep.targetScopeCode : dep.sourceScopeCode;

            if (!otherSelectedSet.has(affectedScope)) continue;

            scopeWarnings.push({
              missingScopeCode: scopeItemId,
              missingScopeName: scopeItem.nameClean,
              businessReason: dep.businessReason,
            });
          }
        }
      }
    } catch {
      // Non-critical — don't fail the selection save
    }
  }

  return NextResponse.json({
    data: selection,
    ...(scopeWarnings.length > 0 ? { warnings: scopeWarnings } : {}),
  });
}
