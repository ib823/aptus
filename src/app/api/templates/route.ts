/** POST: Create template from assessment  |  GET: List templates */

import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { isMfaRequired } from "@/lib/auth/permissions";
import { logDecision } from "@/lib/audit/decision-logger";
import { prisma } from "@/lib/db/prisma";
import { ERROR_CODES } from "@/types/api";
import { anonymizeScopeSelections, anonymizeGapPatterns } from "@/lib/analytics/anonymization-engine";
import { z } from "zod";

const createTemplateSchema = z.object({
  assessmentId: z.string().min(1),
  name: z.string().min(1, "Template name is required"),
  description: z.string().optional(),
  includeGapPatterns: z.boolean().optional(),
  includeIntegrationPatterns: z.boolean().optional(),
  includeDmPatterns: z.boolean().optional(),
  includeWorkshopTemplate: z.boolean().optional(),
  includeRoleTemplate: z.boolean().optional(),
});

export const preferredRegion = "sin1";

export async function POST(request: NextRequest): Promise<NextResponse> {
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

  const allowedRoles = ["platform_admin", "partner_lead", "consultant"];
  if (!allowedRoles.includes(user.role)) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.FORBIDDEN, message: "Insufficient permissions to create templates" } },
      { status: 403 },
    );
  }

  if (!user.organizationId) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.FORBIDDEN, message: "No organization associated" } },
      { status: 403 },
    );
  }

  const body: unknown = await request.json();
  const parsed = createTemplateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: parsed.error.issues[0]?.message ?? "Validation failed" } },
      { status: 400 },
    );
  }

  // Load the source assessment
  const assessment = await prisma.assessment.findUnique({
    where: { id: parsed.data.assessmentId },
    include: {
      scopeSelections: { select: { scopeItemId: true, relevance: true, selected: true } },
      stepResponses: { select: { fitStatus: true } },
      gapResolutions: { select: { gapDescription: true, resolutionType: true } },
      integrationPoints: { select: { direction: true, sourceSystem: true, targetSystem: true, interfaceType: true } },
      dataMigrationObjects: { select: { objectType: true, mappingComplexity: true, volumeEstimate: true } },
    },
  });

  if (!assessment) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.NOT_FOUND, message: "Assessment not found" } },
      { status: 404 },
    );
  }

  if (assessment.organizationId !== user.organizationId) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.FORBIDDEN, message: "Assessment does not belong to your organization" } },
      { status: 403 },
    );
  }

  // Build anonymized template data
  const scopeSelections = anonymizeScopeSelections(assessment.scopeSelections);
  const scopeItemIds = assessment.scopeSelections
    .filter((s) => s.selected)
    .map((s) => s.scopeItemId);

  const commonGapPatterns = parsed.data.includeGapPatterns
    ? anonymizeGapPatterns(assessment.gapResolutions)
    : undefined;

  const integrationPatterns = parsed.data.includeIntegrationPatterns
    ? assessment.integrationPoints.map((ip) => ({
        type: ip.interfaceType,
        system: ip.sourceSystem,
        direction: ip.direction,
      }))
    : undefined;

  const dmPatterns = parsed.data.includeDmPatterns
    ? assessment.dataMigrationObjects.map((dm) => ({
        objectType: dm.objectType,
        complexity: dm.mappingComplexity,
        volume: dm.volumeEstimate,
      }))
    : undefined;

  const template = await prisma.assessmentTemplate.create({
    data: {
      organizationId: user.organizationId,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      industry: assessment.industry,
      country: assessment.country,
      companySize: assessment.companySize,
      modules: assessment.sapModules,
      scopeItemIds,
      scopeSelections: scopeSelections as object[],
      ...(commonGapPatterns ? { commonGapPatterns: commonGapPatterns as object[] } : {}),
      ...(integrationPatterns ? { integrationPatterns: integrationPatterns as object[] } : {}),
      ...(dmPatterns ? { dmPatterns: dmPatterns as object[] } : {}),
      sourceAssessmentId: assessment.id,
      createdById: user.id,
      isPublished: false,
    },
  });

  await logDecision({
    assessmentId: assessment.id,
    entityType: "template",
    entityId: template.id,
    action: "TEMPLATE_CREATED",
    newValue: { templateName: parsed.data.name, scopeItemCount: scopeItemIds.length },
    actor: user.email,
    actorRole: user.role,
    reason: `Template created from assessment ${assessment.companyName}`,
  });

  return NextResponse.json({ data: template }, { status: 201 });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function GET(_request: NextRequest): Promise<NextResponse> {
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

  if (!user.organizationId) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.FORBIDDEN, message: "No organization associated" } },
      { status: 403 },
    );
  }

  const templates = await prisma.assessmentTemplate.findMany({
    where: { organizationId: user.organizationId },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ data: templates });
}
