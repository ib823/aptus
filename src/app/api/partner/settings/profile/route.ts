/** PUT: Update partner organization profile */

import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { isMfaRequired, hasRole } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";
import { logDecision } from "@/lib/db/decision-log";
import { ERROR_CODES } from "@/types/api";
import type { UserRole } from "@/types/assessment";
import { z } from "zod";

const ALLOWED_ROLES: UserRole[] = ["partner_lead", "client_admin"];

const profileSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  industryFocus: z.array(z.string()).optional(),
  country: z.string().max(100).optional(),
  contactEmail: z.string().email().optional(),
  websiteUrl: z.string().url().optional(),
});

export async function PUT(request: NextRequest): Promise<NextResponse> {
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

  if (!hasRole(user, ALLOWED_ROLES)) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.FORBIDDEN, message: "Insufficient permissions" } },
      { status: 403 },
    );
  }

  if (!user.organizationId) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.NOT_FOUND, message: "No organization associated" } },
      { status: 404 },
    );
  }

  const body: unknown = await request.json();
  const parsed = profileSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Validation failed", details: parsed.error.flatten().fieldErrors as Record<string, string> } },
      { status: 400 },
    );
  }

  const existing = await prisma.organization.findUnique({
    where: { id: user.organizationId },
    select: { name: true, industryFocus: true, contactEmail: true, websiteUrl: true },
  });

  if (!existing) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.NOT_FOUND, message: "Organization not found" } },
      { status: 404 },
    );
  }

  const updated = await prisma.organization.update({
    where: { id: user.organizationId },
    data: {
      ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
      ...(parsed.data.industryFocus !== undefined ? { industryFocus: parsed.data.industryFocus } : {}),
      ...(parsed.data.contactEmail !== undefined ? { contactEmail: parsed.data.contactEmail } : {}),
      ...(parsed.data.websiteUrl !== undefined ? { websiteUrl: parsed.data.websiteUrl } : {}),
    },
    select: {
      id: true,
      name: true,
      industryFocus: true,
      contactEmail: true,
      websiteUrl: true,
    },
  });

  await logDecision({
    assessmentId: user.organizationId,
    entityType: "organization",
    entityId: user.organizationId,
    action: "ORG_UPDATED",
    oldValue: existing,
    newValue: updated,
    actor: user.id,
    actorRole: user.role,
  });

  return NextResponse.json({ data: updated });
}
