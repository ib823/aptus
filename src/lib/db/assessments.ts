/** Assessment CRUD operations */

import { prisma } from "@/lib/db/prisma";
import type { AssessmentStatus } from "@/types/assessment";

export interface CreateAssessmentInput {
  companyName: string;
  industry: string;
  country: string;
  operatingCountries: string[];
  companySize: string;
  revenueBand?: string | undefined;
  currentErp?: string | undefined;
  createdBy: string;
  organizationId: string;
  /**
   * Phase 13.4 — AD-13.7: catalog version the assessment is pinned to.
   * Defaults to the active PUBLIC catalog when omitted (back-compat).
   * Supplied by the new-assessment form's Edition + Version picker.
   */
  catalogVersionId?: string | undefined;
}

interface AssessmentCursorParts {
  updatedAt: Date;
  id: string;
}

export function encodeAssessmentCursor(input: AssessmentCursorParts): string {
  return Buffer.from(
    JSON.stringify({
      updatedAt: input.updatedAt.toISOString(),
      id: input.id,
    }),
  ).toString("base64url");
}

export function decodeAssessmentCursor(cursor: string | undefined): AssessmentCursorParts | undefined {
  if (!cursor) return undefined;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as {
      updatedAt?: string;
      id?: string;
    };
    if (!parsed.updatedAt || !parsed.id) return undefined;
    const updatedAt = new Date(parsed.updatedAt);
    if (Number.isNaN(updatedAt.getTime())) return undefined;
    return { updatedAt, id: parsed.id };
  } catch {
    return undefined;
  }
}

export async function createAssessment(input: CreateAssessmentInput) {
  // Phase 13.4 — AD-13.7: every new assessment must be pinned to a catalog
  // version. If the caller doesn't specify, default to the most recently
  // ingested active PUBLIC catalog (back-compat for legacy callers).
  let catalogVersionId = input.catalogVersionId;
  if (!catalogVersionId) {
    const fallback = await prisma.scopeCatalogVersion.findFirst({
      where: { edition: "PUBLIC", isActive: true },
      orderBy: { ingestedAt: "desc" },
      select: { id: true },
    });
    if (!fallback) {
      throw new Error(
        "No active PUBLIC catalog version found and no catalogVersionId supplied. Cannot create assessment.",
      );
    }
    catalogVersionId = fallback.id;
  } else {
    // Validate caller-supplied id refers to an active catalog
    const supplied = await prisma.scopeCatalogVersion.findUnique({
      where: { id: catalogVersionId },
      select: { id: true, isActive: true, edition: true, version: true },
    });
    if (!supplied) {
      throw new Error(`catalogVersionId=${catalogVersionId} does not exist.`);
    }
    if (!supplied.isActive) {
      throw new Error(
        `catalogVersionId=${catalogVersionId} (${supplied.edition}/${supplied.version}) is not active. Pick an active version.`,
      );
    }
  }

  return prisma.assessment.create({
    data: {
      companyName: input.companyName,
      industry: input.industry,
      country: input.country,
      operatingCountries: input.operatingCountries,
      companySize: input.companySize,
      revenueBand: input.revenueBand ?? null,
      currentErp: input.currentErp ?? null,
      createdBy: input.createdBy,
      organizationId: input.organizationId,
      catalogVersionId,
      status: "draft",
    },
  });
}

export async function getAssessment(id: string) {
  return prisma.assessment.findUnique({
    where: { id, deletedAt: null },
    include: {
      organization: { select: { id: true, name: true } },
      stakeholders: {
        include: {
          user: { select: { id: true, email: true, name: true, role: true } },
        },
      },
      _count: {
        select: {
          scopeSelections: true,
          stepResponses: true,
          gapResolutions: true,
        },
      },
    },
  });
}

export async function listAssessments(organizationId: string) {
  return prisma.assessment.findMany({
    where: { organizationId, deletedAt: null },
    orderBy: { updatedAt: "desc" },
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
}

export async function listAssessmentsPaginated(
  organizationId: string,
  input: { limit?: number; cursor?: string } = {},
) {
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);
  const decodedCursor = decodeAssessmentCursor(input.cursor);
  const rows = await prisma.assessment.findMany({
    where: {
      organizationId,
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

  const hasMore = rows.length > limit;
  if (hasMore) rows.pop();
  const cursorRow = rows.at(-1);

  return {
    data: rows,
    nextCursor: hasMore && cursorRow
      ? encodeAssessmentCursor({
          id: cursorRow.id,
          updatedAt: cursorRow.updatedAt,
        })
      : null,
    hasMore,
  };
}

export async function updateAssessmentStatus(
  id: string,
  status: AssessmentStatus,
) {
  return prisma.assessment.update({
    where: { id },
    data: { status },
  });
}

export async function softDeleteAssessment(id: string) {
  return prisma.assessment.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
}

export async function addStakeholder(input: {
  assessmentId: string;
  userId: string;
  name: string;
  email: string;
  role: string;
  assignedAreas: string[];
  invitedBy: string;
}) {
  return prisma.assessmentStakeholder.create({
    data: {
      assessmentId: input.assessmentId,
      userId: input.userId,
      name: input.name,
      email: input.email,
      role: input.role,
      assignedAreas: input.assignedAreas,
      canEdit: input.role !== "executive" && input.role !== "executive_sponsor" && input.role !== "viewer" && input.role !== "client_admin",
      invitedBy: input.invitedBy,
    },
  });
}

export async function removeStakeholder(id: string) {
  return prisma.assessmentStakeholder.delete({
    where: { id },
  });
}

export async function getStakeholders(assessmentId: string) {
  return prisma.assessmentStakeholder.findMany({
    where: { assessmentId },
    include: {
      user: { select: { id: true, email: true, name: true, role: true } },
    },
    orderBy: { createdAt: "asc" },
  });
}
