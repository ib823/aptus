/** PUT: Upsert scope selection for a scope item */

import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { isMfaRequired, canEditScopeSelection } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";
import { logDecision } from "@/lib/audit/decision-logger";
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

export const preferredRegion = "sin1";

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
    select: { functionalArea: true },
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

  return NextResponse.json({ data: selection });
}
