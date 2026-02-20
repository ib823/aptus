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
}

export async function createAssessment(input: CreateAssessmentInput) {
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
      canEdit: input.role !== "executive" && input.role !== "it_lead",
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
