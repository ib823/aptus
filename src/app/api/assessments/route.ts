/** GET: List assessments for current user's organization */
/** POST: Create a new assessment */

import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { isMfaRequired } from "@/lib/auth/permissions";
import { mapLegacyRole } from "@/lib/auth/role-migration";
import { getCapabilities } from "@/lib/auth/role-permissions";
import {
  createAssessment,
  decodeAssessmentCursor,
  encodeAssessmentCursor,
  listAssessmentsPaginated,
} from "@/lib/db/assessments";
import { prisma } from "@/lib/db/prisma";
import { ensureOrganization } from "@/lib/db/organizations";
import { ERROR_CODES } from "@/types/api";
import { checkAssessmentLimit, recordUsageEvent } from "@/lib/commercial/usage-metering";
import { safeParseJsonBody } from "@/lib/http/safe-json-body";
import { z } from "zod";

const createSchema = z.object({
  companyName: z.string().min(1).max(200),
  industry: z.string().default("General"),
  country: z.string().default("XX"),
  operatingCountries: z.array(z.string()).default([]),
  companySize: z.enum(["small", "midsize", "large", "enterprise"]).default("midsize"),
  revenueBand: z.string().optional(),
  currentErp: z.string().optional(),
});

const listQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().min(1).max(200).default(50),
});

export async function GET(request: NextRequest): Promise<NextResponse> {
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

  const searchParams = Object.fromEntries(request.nextUrl.searchParams.entries());
  const parsedQuery = listQuerySchema.safeParse(searchParams);
  if (!parsedQuery.success) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Invalid query parameters" } },
      { status: 400 },
    );
  }
  const { cursor, limit } = parsedQuery.data;

  // Platform admins, partner leads, and consultants without org see all assessments
  const role = mapLegacyRole(user.role);
  const caps = getCapabilities(role);
  const decodedCursor = decodeAssessmentCursor(cursor);
  if (cursor && !decodedCursor) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Invalid cursor" } },
      { status: 400 },
    );
  }

  if (!user.organizationId && (caps.canViewAllAssessments || role === "consultant")) {
    const assessments = await prisma.assessment.findMany({
      where: {
        deletedAt: null,
        ...(decodedCursor
          ? {
              OR: [
                { updatedAt: { lt: decodedCursor.updatedAt } },
                {
                  updatedAt: decodedCursor.updatedAt,
                  id: { lt: decodedCursor.id },
                },
              ],
            }
          : {}),
      },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      select: {
        id: true,
        companyName: true,
        industry: true,
        country: true,
        companySize: true,
        status: true,
        createdBy: true,
        organizationId: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            scopeSelections: { where: { selected: true } },
            stepResponses: true,
            gapResolutions: true,
            stakeholders: true,
          },
        },
      },
    });
    const hasMore = assessments.length > limit;
    if (hasMore) assessments.pop();
    const cursorAssessment = assessments.at(-1);

    return NextResponse.json({
      data: assessments,
      nextCursor: hasMore && cursorAssessment
        ? encodeAssessmentCursor({
            id: cursorAssessment.id,
            updatedAt: cursorAssessment.updatedAt,
          })
        : null,
      hasMore,
    });
  }

  if (!user.organizationId) {
    return NextResponse.json({ data: [], nextCursor: null, hasMore: false });
  }

  const assessments = await listAssessmentsPaginated(user.organizationId, {
    limit,
    ...(cursor ? { cursor } : {}),
  });
  return NextResponse.json(assessments);
}

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

  const createRole = mapLegacyRole(user.role);
  const createCaps = getCapabilities(createRole);
  if (!createCaps.canCreateAssessment) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.FORBIDDEN, message: "Your role does not have permission to create assessments" } },
      { status: 403 },
    );
  }

  const parsedBody = await safeParseJsonBody(request);
  if (!parsedBody.ok) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Invalid JSON body" } },
      { status: 400 },
    );
  }

  const parsed = createSchema.safeParse(parsedBody.data);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: ERROR_CODES.VALIDATION_ERROR,
          message: "Validation failed",
          details: parsed.error.flatten().fieldErrors as Record<string, string>,
        },
      },
      { status: 400 },
    );
  }

  try {
    const organizationId = await ensureOrganization(user.id, user.organizationId, parsed.data.companyName);

    // Check assessment limit before creating
    const limitCheck = await checkAssessmentLimit(organizationId);
    if (!limitCheck.allowed) {
      return NextResponse.json(
        { error: { code: ERROR_CODES.VALIDATION_ERROR, message: `Assessment limit reached (${limitCheck.current}/${limitCheck.limit}). Upgrade your plan.` } },
        { status: 400 },
      );
    }

    const assessment = await createAssessment({
      ...parsed.data,
      createdBy: user.id,
      organizationId,
    });

    // Record usage event (fire-and-forget)
    recordUsageEvent(organizationId, "assessment_created", assessment.id).catch((err) => console.error("[USAGE] Failed to record assessment_created event:", err));

    // Add the creating user as a consultant stakeholder
    await prisma.assessmentStakeholder.create({
      data: {
        assessmentId: assessment.id,
        userId: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        assignedAreas: [],
        canEdit: true,
        invitedBy: user.id,
      },
    });

    return NextResponse.json({ data: assessment }, { status: 201 });
  } catch (err) {
    console.error("[API] Failed to create assessment:", err);
    return NextResponse.json(
      { error: { code: ERROR_CODES.INTERNAL_ERROR, message: "Failed to create assessment. Please try again." } },
      { status: 500 },
    );
  }
}
