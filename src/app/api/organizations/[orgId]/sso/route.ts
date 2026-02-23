/** GET: Fetch SSO configuration for an organization */
/** PUT: Update SSO configuration for an organization */

import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { isMfaRequired } from "@/lib/auth/permissions";
import { mapLegacyRole } from "@/lib/auth/role-migration";
import { hasPermission } from "@/lib/auth/permission-matrix";
import { logDecision } from "@/lib/audit/decision-logger";
import { prisma } from "@/lib/db/prisma";
import { ERROR_CODES } from "@/types/api";
import { z } from "zod";

const updateSsoSchema = z.object({
  ssoEnabled: z.boolean().optional(),
  ssoProvider: z.enum(["SAML", "OIDC"]).nullable().optional(),
  ssoDomain: z.string().max(200).nullable().optional(),
  ssoEntityId: z.string().max(500).nullable().optional(),
  ssoExclusive: z.boolean().optional(),
  ssoMetadataUrl: z.string().url().max(2000).nullable().optional(),
  ssoClientId: z.string().max(500).nullable().optional(),
  scimEnabled: z.boolean().optional(),
  scimEndpoint: z.string().url().max(2000).nullable().optional(),
}).superRefine((data, ctx) => {
  // When enabling SSO, a provider must be specified
  if (data.ssoEnabled === true && data.ssoProvider === null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "ssoProvider must be \"SAML\" or \"OIDC\" when ssoEnabled is true",
      path: ["ssoProvider"],
    });
  }
});

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

  if (!hasPermission(role, "admin.accessPanel")) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.FORBIDDEN, message: "Only platform admins can access SSO configuration" } },
      { status: 403 },
    );
  }

  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: {
      id: true,
      name: true,
      ssoEnabled: true,
      ssoProvider: true,
      ssoDomain: true,
      ssoEntityId: true,
      ssoExclusive: true,
      ssoMetadataUrl: true,
      ssoClientId: true,
      scimEnabled: true,
      scimEndpoint: true,
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

  const { orgId } = await params;
  const role = mapLegacyRole(user.role);

  if (!hasPermission(role, "admin.accessPanel")) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.FORBIDDEN, message: "Only platform admins can update SSO configuration" } },
      { status: 403 },
    );
  }

  const body: unknown = await request.json();
  const parsed = updateSsoSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Validation failed", details: parsed.error.flatten().fieldErrors as Record<string, string> } },
      { status: 400 },
    );
  }

  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: {
      id: true,
      ssoEnabled: true,
      ssoProvider: true,
      ssoDomain: true,
      ssoEntityId: true,
      ssoExclusive: true,
      ssoMetadataUrl: true,
      ssoClientId: true,
      scimEnabled: true,
      scimEndpoint: true,
    },
  });

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
    select: {
      id: true,
      name: true,
      ssoEnabled: true,
      ssoProvider: true,
      ssoDomain: true,
      ssoEntityId: true,
      ssoExclusive: true,
      ssoMetadataUrl: true,
      ssoClientId: true,
      scimEnabled: true,
      scimEndpoint: true,
    },
  });

  await logDecision({
    assessmentId: "SYSTEM",
    entityType: "organization",
    entityId: orgId,
    action: "ORG_UPDATED",
    oldValue: {
      ssoEnabled: org.ssoEnabled,
      ssoProvider: org.ssoProvider,
      ssoDomain: org.ssoDomain,
      ssoEntityId: org.ssoEntityId,
      ssoExclusive: org.ssoExclusive,
      ssoMetadataUrl: org.ssoMetadataUrl,
      ssoClientId: org.ssoClientId,
      scimEnabled: org.scimEnabled,
      scimEndpoint: org.scimEndpoint,
    } as Record<string, string | boolean | null>,
    newValue: updateData as Record<string, string | boolean | null>,
    actor: user.email,
    actorRole: user.role,
  });

  return NextResponse.json({ data: updated });
}
