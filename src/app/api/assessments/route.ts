/** GET: List assessments for current user's organization */
/** POST: Create a new assessment */

import { NextResponse, type NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth/session";
import { isMfaRequired } from "@/lib/auth/permissions";
import { mapLegacyRole } from "@/lib/auth/role-migration";
import { canViewAllAssessments, getVisibleAssessmentWhere } from "@/lib/auth/assessment-visibility";
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
  // Phase 13.4 — AD-13.7: optional, defaults to active PUBLIC inside createAssessment
  catalogVersionId: z.string().optional(),
});

const listQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().min(1).max(200).default(50),
});

async function listAssessmentsByWhere(
  where: Prisma.AssessmentWhereInput,
  input: { limit: number; cursor?: string },
) {
  const decodedCursor = decodeAssessmentCursor(input.cursor);
  const cursorFilter: Prisma.AssessmentWhereInput | undefined = decodedCursor
    ? {
        OR: [
          { updatedAt: { lt: decodedCursor.updatedAt } },
          {
            updatedAt: decodedCursor.updatedAt,
            id: { lt: decodedCursor.id },
          },
        ],
      }
    : undefined;

  const assessments = await prisma.assessment.findMany({
    where: cursorFilter ? { AND: [where, cursorFilter] } : where,
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take: input.limit + 1,
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

  const hasMore = assessments.length > input.limit;
  if (hasMore) assessments.pop();
  const cursorAssessment = assessments.at(-1);

  return {
    data: assessments,
    nextCursor: hasMore && cursorAssessment
      ? encodeAssessmentCursor({
          id: cursorAssessment.id,
          updatedAt: cursorAssessment.updatedAt,
        })
      : null,
    hasMore,
  };
}

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

  const decodedCursor = decodeAssessmentCursor(cursor);
  if (cursor && !decodedCursor) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Invalid cursor" } },
      { status: 400 },
    );
  }

  if (canViewAllAssessments(user)) {
    return NextResponse.json(
      await listAssessmentsByWhere({ deletedAt: null }, { limit, ...(cursor ? { cursor } : {}) }),
    );
  }

  if (!user.organizationId) {
    return NextResponse.json(
      await listAssessmentsByWhere(
        getVisibleAssessmentWhere(user),
        { limit, ...(cursor ? { cursor } : {}) },
      ),
    );
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
    console.warn("[API] POST /api/assessments rejected: invalid JSON body", { reason: parsedBody.reason, userId: user.id });
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Invalid JSON body" } },
      { status: 400 },
    );
  }

  const parsed = createSchema.safeParse(parsedBody.data);
  if (!parsed.success) {
    const fieldErrors = parsed.error.flatten().fieldErrors;
    console.warn("[API] POST /api/assessments validation failed", { userId: user.id, fieldErrors });
    return NextResponse.json(
      {
        error: {
          code: ERROR_CODES.VALIDATION_ERROR,
          message: "Validation failed",
          details: fieldErrors as Record<string, string>,
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
      console.warn("[API] POST /api/assessments rejected: limit reached", { userId: user.id, organizationId, current: limitCheck.current, limit: limitCheck.limit });
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
