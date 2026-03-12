/** GET + PUT: Report branding for an assessment's organization */

import { NextResponse, type NextRequest } from "next/server";
import {
  requireAssessmentAccess,
  isAssessmentAccessError,
} from "@/lib/auth/assessment-guard";
import { hasRole } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";
import { logDecision } from "@/lib/db/decision-log";
import { safeParseJsonBody } from "@/lib/http/safe-json-body";
import { ERROR_CODES } from "@/types/api";
import type { UserRole } from "@/types/assessment";
import { z } from "zod";

const READ_ROLES: UserRole[] = [
  "partner_lead", "platform_admin", "client_admin",
  "consultant", "project_manager", "executive_sponsor",
];

const WRITE_ROLES: UserRole[] = [
  "partner_lead", "platform_admin", "client_admin",
];

const brandingSchema = z.object({
  logoUrl: z.string().nullable().optional(),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Must be a valid hex color").optional(),
  secondaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Must be a valid hex color").optional(),
  footerText: z.string().nullable().optional(),
  companyName: z.string().nullable().optional(),
});
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const access = await requireAssessmentAccess(id);
  if (isAssessmentAccessError(access)) {
    return access;
  }
  const { user, assessment } = access;

  if (!hasRole(user, READ_ROLES)) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.FORBIDDEN, message: "Insufficient permissions" } },
      { status: 403 },
    );
  }

  const branding = await prisma.reportBranding.findUnique({
    where: { organizationId: assessment.organizationId },
  });

  return NextResponse.json({ data: branding });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const access = await requireAssessmentAccess(id);
  if (isAssessmentAccessError(access)) {
    return access;
  }
  const { user, assessment } = access;

  if (!hasRole(user, WRITE_ROLES)) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.FORBIDDEN, message: "Insufficient permissions" } },
      { status: 403 },
    );
  }

  const bodyResult = await safeParseJsonBody(request);
  if (!bodyResult.ok) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Invalid request body" } },
      { status: 400 },
    );
  }

  const parsed = brandingSchema.safeParse(bodyResult.data);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Validation failed", details: parsed.error.flatten().fieldErrors as Record<string, string> } },
      { status: 400 },
    );
  }

  const existing = await prisma.reportBranding.findUnique({
    where: { organizationId: assessment.organizationId },
  });

  const branding = await prisma.reportBranding.upsert({
    where: { organizationId: assessment.organizationId },
    create: {
      organizationId: assessment.organizationId,
      logoUrl: parsed.data.logoUrl ?? null,
      primaryColor: parsed.data.primaryColor ?? "#1a1a2e",
      secondaryColor: parsed.data.secondaryColor ?? "#16213e",
      footerText: parsed.data.footerText ?? null,
      companyName: parsed.data.companyName ?? null,
    },
    update: {
      ...(parsed.data.logoUrl !== undefined ? { logoUrl: parsed.data.logoUrl } : {}),
      ...(parsed.data.primaryColor !== undefined ? { primaryColor: parsed.data.primaryColor } : {}),
      ...(parsed.data.secondaryColor !== undefined ? { secondaryColor: parsed.data.secondaryColor } : {}),
      ...(parsed.data.footerText !== undefined ? { footerText: parsed.data.footerText } : {}),
      ...(parsed.data.companyName !== undefined ? { companyName: parsed.data.companyName } : {}),
    },
  });

  await logDecision({
    assessmentId: id,
    entityType: "report_branding",
    entityId: branding.id,
    action: "REPORT_BRANDING_UPDATED",
    oldValue: existing ?? {},
    newValue: branding,
    actor: user.id,
    actorRole: user.role,
  });

  return NextResponse.json({ data: branding });
}
