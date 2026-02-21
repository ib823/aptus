/** POST: Create assessment from template */

import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { isMfaRequired } from "@/lib/auth/permissions";
import { logDecision } from "@/lib/audit/decision-logger";
import { prisma } from "@/lib/db/prisma";
import { ERROR_CODES } from "@/types/api";
import { z } from "zod";


const createFromTemplateSchema = z.object({
  companyName: z.string().min(1, "Company name is required"),
  industry: z.string().optional(),
  country: z.string().optional(),
  companySize: z.string().optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ templateId: string }> },
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

  const allowedRoles = ["platform_admin", "partner_lead", "consultant"];
  if (!allowedRoles.includes(user.role)) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.FORBIDDEN, message: "Insufficient permissions" } },
      { status: 403 },
    );
  }

  if (!user.organizationId) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.FORBIDDEN, message: "No organization associated" } },
      { status: 403 },
    );
  }

  const { templateId } = await params;
  const body: unknown = await request.json();
  const parsed = createFromTemplateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: parsed.error.issues[0]?.message ?? "Validation failed" } },
      { status: 400 },
    );
  }

  const template = await prisma.assessmentTemplate.findUnique({
    where: { id: templateId },
  });

  if (!template) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.NOT_FOUND, message: "Template not found" } },
      { status: 404 },
    );
  }

  // Allow using org templates or public templates
  if (template.organizationId !== user.organizationId && !template.isPublic) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.FORBIDDEN, message: "Template not accessible" } },
      { status: 403 },
    );
  }

  // Create assessment from template
  const assessment = await prisma.assessment.create({
    data: {
      companyName: parsed.data.companyName,
      industry: parsed.data.industry ?? template.industry ?? "General",
      country: parsed.data.country ?? template.country ?? "XX",
      companySize: parsed.data.companySize ?? template.companySize ?? "midsize",
      sapModules: template.modules,
      organizationId: user.organizationId,
      createdBy: user.id,
      status: "draft",
    },
  });

  // Create scope selections from template
  if (template.scopeItemIds.length > 0) {
    await prisma.scopeSelection.createMany({
      data: template.scopeItemIds.map((scopeItemId) => ({
        assessmentId: assessment.id,
        scopeItemId,
        selected: true,
        relevance: "YES",
      })),
      skipDuplicates: true,
    });
  }

  // Increment template usage count
  await prisma.assessmentTemplate.update({
    where: { id: templateId },
    data: { timesUsed: { increment: 1 } },
  });

  await logDecision({
    assessmentId: assessment.id,
    entityType: "assessment",
    entityId: assessment.id,
    action: "ASSESSMENT_FROM_TEMPLATE",
    newValue: { templateId, templateName: template.name, scopeItemCount: template.scopeItemIds.length },
    actor: user.email,
    actorRole: user.role,
    reason: `Assessment created from template "${template.name}"`,
  });

  return NextResponse.json({ data: assessment }, { status: 201 });
}
