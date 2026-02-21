/** GET: Fetch org details */
/** PUT: Update org settings */

import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { isMfaRequired } from "@/lib/auth/permissions";
import { mapLegacyRole } from "@/lib/auth/role-migration";
import { logDecision } from "@/lib/audit/decision-logger";
import { prisma } from "@/lib/db/prisma";
import { ERROR_CODES } from "@/types/api";
import { z } from "zod";

export const preferredRegion = "sin1";

const updateOrgSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  slug: z.string().min(2).max(50).regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with hyphens").optional(),
  orgType: z.enum(["partner", "client", "platform"]).optional(),
  ssoEnabled: z.boolean().optional(),
  ssoProvider: z.string().max(50).optional(),
  ssoDomain: z.string().max(200).optional(),
  scimEnabled: z.boolean().optional(),
  mfaPolicy: z.enum(["disabled", "optional", "required"]).optional(),
  maxConcurrentSessions: z.number().int().min(1).max(10).optional(),
  brandPrimaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  brandLogoUrl: z.string().url().optional(),
}).partial();

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> },
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

  const { orgId } = await params;
  const role = mapLegacyRole(user.role);

  // Only platform_admin can view any org, others must belong to the org
  if (role !== "platform_admin" && user.organizationId !== orgId) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.FORBIDDEN, message: "You do not belong to this organization" } },
      { status: 403 },
    );
  }

  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    include: {
      _count: { select: { users: true, assessments: true } },
    },
  });

  if (!org) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.NOT_FOUND, message: "Organization not found" } },
      { status: 404 },
    );
  }

  return NextResponse.json({ data: org });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> },
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

  const role = mapLegacyRole(user.role);
  const { orgId } = await params;

  // Only platform_admin, partner_lead (own org), client_admin (own org) can update
  const canUpdate =
    role === "platform_admin" ||
    ((role === "partner_lead" || role === "client_admin") && user.organizationId === orgId);

  if (!canUpdate) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.FORBIDDEN, message: "Insufficient permissions to update organization" } },
      { status: 403 },
    );
  }

  const body: unknown = await request.json();
  const parsed = updateOrgSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Validation failed", details: parsed.error.flatten().fieldErrors as Record<string, string> } },
      { status: 400 },
    );
  }

  // Check slug uniqueness if updating slug
  if (parsed.data.slug) {
    const existing = await prisma.organization.findUnique({
      where: { slug: parsed.data.slug },
    });
    if (existing && existing.id !== orgId) {
      return NextResponse.json(
        { error: { code: ERROR_CODES.CONFLICT, message: "Organization slug already taken" } },
        { status: 409 },
      );
    }
  }

  const org = await prisma.organization.findUnique({ where: { id: orgId } });
  if (!org) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.NOT_FOUND, message: "Organization not found" } },
      { status: 404 },
    );
  }

  // Build update data, filtering out undefined values for exactOptionalPropertyTypes
  const updateData: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(parsed.data)) {
    if (value !== undefined) {
      updateData[key] = value;
    }
  }

  const updated = await prisma.organization.update({
    where: { id: orgId },
    data: updateData,
  });

  await logDecision({
    assessmentId: "SYSTEM",
    entityType: "organization",
    entityId: orgId,
    action: "ORG_UPDATED",
    oldValue: { name: org.name, orgType: org.orgType, mfaPolicy: org.mfaPolicy } as Record<string, string | null>,
    newValue: updateData as Record<string, string | boolean | number>,
    actor: user.email,
    actorRole: user.role,
  });

  return NextResponse.json({ data: updated });
}
