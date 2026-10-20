/**
 * GET: List all organizations with plan/status (admin only)
 * POST: Create an organization (admin only, roadmap P0.13)
 *
 * WHY POST EXISTS. Organizations could only be made by /api/auth/signup (which
 * also makes a partner_lead and a trial) or by a database edit, so setting a
 * client up meant one or the other. An organization is the tenant every
 * CoreEdge row is scoped to, so making one is a platform-level governance act:
 * platform admin only, a fresh passkey step-up (`org.create`, tokens refused in
 * every mode), and a PlatformGovernanceAudit row naming who made it.
 *
 * It creates the organization and nothing else. People join it the usual
 * way — POST /api/organizations/[orgId]/users invites them, as the admin or
 * as whoever the admin invites first.
 */

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { requireAdmin, isAdminError } from "@/lib/auth/admin-guard";
import { checkStepUp, recordStepUpMissing, STEP_UP_MAX_AGE_SECONDS } from "@/lib/auth/step-up";
import { prisma } from "@/lib/db/prisma";
import { safeParseJsonBody } from "@/lib/http/safe-json-body";
import { uniqueOrganizationSlug } from "@/lib/org/slug";
import { writePlatformGovernanceAudit } from "@/lib/studio/audit";
import { ORG_TYPES } from "@/lib/utils/org-type";
import { ERROR_CODES } from "@/types/api";
import type { OrgType } from "@/types/assessment";

export async function GET(): Promise<NextResponse> {
  const auth = await requireAdmin();
  if (isAdminError(auth)) return auth;

  const organizations = await prisma.organization.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      slug: true,
      type: true,
      orgType: true,
      isActive: true,
      plan: true,
      subscriptionStatus: true,
      trialEndsAt: true,
      maxActiveAssessments: true,
      maxPartnerUsers: true,
      createdAt: true,
      _count: {
        select: {
          users: true,
          assessments: true,
        },
      },
    },
  });

  return NextResponse.json({ data: organizations });
}

const createOrganizationSchema = z.object({
  name: z.string().trim().min(1).max(200),
  // The canonical lowercase vocabulary (lib/utils/org-type.ts), written to
  // BOTH type columns as /api/auth/signup does, so the two cannot disagree.
  orgType: z.enum(ORG_TYPES as [OrgType, ...OrgType[]]).default("client"),
  contactEmail: z
    .string()
    .trim()
    .max(320)
    .email()
    .transform((v) => v.toLowerCase())
    .optional(),
  domain: z.string().trim().min(1).max(253).optional(),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAdmin();
  if (isAdminError(auth)) return auth;

  const body = await safeParseJsonBody(request);
  if (!body.ok) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Invalid request body" } },
      { status: 400 },
    );
  }
  const parsed = createOrganizationSchema.safeParse(body.data);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: ERROR_CODES.VALIDATION_ERROR,
          message: parsed.error.issues[0]?.message ?? "Validation failed",
        },
      },
      { status: 400 },
    );
  }

  // Checked before the write, recorded once the organization exists so a
  // warn-mode row can name it.
  const stepUp = checkStepUp(auth.user, STEP_UP_MAX_AGE_SECONDS, { action: "org.create" });
  if (!stepUp.ok) return stepUp.response;

  const { name, orgType, contactEmail, domain } = parsed.data;
  const slug = await uniqueOrganizationSlug(name);
  const org = await prisma.organization.create({
    data: {
      name,
      slug,
      type: orgType,
      orgType,
      ...(contactEmail ? { contactEmail } : {}),
      ...(domain ? { domain } : {}),
    },
    select: { id: true, name: true, slug: true, type: true, orgType: true, isActive: true, createdAt: true },
  });

  if (stepUp.outcome === "warned") {
    await recordStepUpMissing({ ...stepUp.missing, context: { ...stepUp.missing.context, targetId: org.id } });
  }

  await writePlatformGovernanceAudit({
    actorId: auth.user.id,
    entityType: "Organization",
    entityId: org.id,
    action: "CREATE",
    after: { name: org.name, slug: org.slug, orgType: org.orgType },
  });

  return NextResponse.json(
    { data: { ...org, createdAt: org.createdAt.toISOString() } },
    { status: 201 },
  );
}
