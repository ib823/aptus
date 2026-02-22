/** PUT: Update gap resolution */

import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { isMfaRequired } from "@/lib/auth/permissions";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { logDecision } from "@/lib/audit/decision-logger";
import { ERROR_CODES } from "@/types/api";
import { z } from "zod";

const gapUpdateSchema = z
  .object({
    gapDescription: z.string().min(10).max(5000).optional(),
    resolutionType: z.enum([
      "PENDING", "FIT", "CONFIGURE", "KEY_USER_EXT", "BTP_EXT",
      "ISV", "CUSTOM_ABAP", "ADAPT_PROCESS", "OUT_OF_SCOPE",
    ]),
    resolutionDescription: z.string().max(5000).optional(),
    effortDays: z.number().min(0).optional(),
    costEstimate: z.record(z.string(), z.unknown()).optional(),
    riskLevel: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
    upgradeImpact: z.string().max(5000).optional(),
    rationale: z.string().max(5000).optional(),
    clientApproved: z.boolean().optional(),
    // Phase 13: V2 fields
    priority: z.enum(["critical", "high", "medium", "low"]).nullable().optional(),
    oneTimeCost: z.number().min(0).nullable().optional(),
    recurringCost: z.number().min(0).nullable().optional(),
    costCurrency: z.string().min(3).max(3).nullable().optional(),
    implementationDays: z.number().min(0).nullable().optional(),
    riskCategory: z.enum(["technical", "business", "compliance", "integration"]).nullable().optional(),
    upgradeStrategy: z.enum(["standard_upgrade", "needs_revalidation", "custom_maintenance"]).nullable().optional(),
    clientApprovalNote: z.string().max(5000).nullable().optional(),
  })
  .refine(
    (data) =>
      data.resolutionType === "PENDING" ||
      data.resolutionType === "FIT" ||
      (data.rationale && data.rationale.length >= 20),
    {
      message: "Rationale is required (min 20 characters) for non-FIT resolutions",
      path: ["rationale"],
    },
  );
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; gapId: string }> },
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

  const { id: assessmentId, gapId } = await params;

  const body: unknown = await request.json();
  const parsed = gapUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: parsed.error.issues[0]?.message ?? "Validation failed" } },
      { status: 400 },
    );
  }

  // Get existing gap
  const existing = await prisma.gapResolution.findUnique({
    where: { id: gapId },
    select: {
      assessmentId: true,
      resolutionType: true,
      effortDays: true,
    },
  });

  if (!existing || existing.assessmentId !== assessmentId) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.NOT_FOUND, message: "Gap resolution not found" } },
      { status: 404 },
    );
  }

  // Update the gap resolution
  const updateData: Record<string, unknown> = {
    resolutionType: parsed.data.resolutionType,
    resolutionDescription: parsed.data.resolutionDescription ?? "",
    effortDays: parsed.data.effortDays ?? null,
    riskLevel: parsed.data.riskLevel ?? null,
    upgradeImpact: parsed.data.upgradeImpact ?? null,
    rationale: parsed.data.rationale ?? null,
    clientApproved: parsed.data.clientApproved ?? false,
    decidedBy: user.email,
    decidedAt: new Date(),
    // Phase 13: V2 fields
    priority: parsed.data.priority ?? null,
    oneTimeCost: parsed.data.oneTimeCost ?? null,
    recurringCost: parsed.data.recurringCost ?? null,
    costCurrency: parsed.data.costCurrency ?? null,
    implementationDays: parsed.data.implementationDays ?? null,
    riskCategory: parsed.data.riskCategory ?? null,
    upgradeStrategy: parsed.data.upgradeStrategy ?? null,
  };
  if (parsed.data.gapDescription !== undefined) {
    updateData.gapDescription = parsed.data.gapDescription;
  }
  if (parsed.data.costEstimate !== undefined) {
    updateData.costEstimate = parsed.data.costEstimate as Prisma.InputJsonValue;
  }
  // Handle client approval with timestamp
  if (parsed.data.clientApproved) {
    updateData.clientApprovedBy = user.email;
    updateData.clientApprovedAt = new Date();
    if (parsed.data.clientApprovalNote !== undefined) {
      updateData.clientApprovalNote = parsed.data.clientApprovalNote;
    }
  }

  const updated = await prisma.gapResolution.update({
    where: { id: gapId },
    data: updateData,
  });

  // Log decision
  const isChange = existing.resolutionType !== "PENDING";
  await logDecision({
    assessmentId,
    entityType: "gap_resolution",
    entityId: gapId,
    action: isChange ? "RESOLUTION_CHANGED" : "RESOLUTION_SELECTED",
    oldValue: isChange ? { resolutionType: existing.resolutionType, effortDays: existing.effortDays } : undefined,
    newValue: {
      resolutionType: parsed.data.resolutionType,
      effortDays: parsed.data.effortDays ?? null,
    },
    actor: user.email,
    actorRole: user.role,
    reason: parsed.data.rationale,
  });

  return NextResponse.json({ data: updated });
}
