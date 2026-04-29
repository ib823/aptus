import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { calculateProfileCompleteness } from "@/lib/assessment/profile-completeness";
import { PROFILE_COMPLETENESS_GATE } from "@/types/assessment";
import { AptusAssessmentShell } from "@/components/aptus";
import type { Metadata } from "next";
import type { ReactNode } from "react";

interface AssessmentLayoutProps {
  children: ReactNode;
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const assessment = await prisma.assessment.findUnique({
    where: { id, deletedAt: null },
    select: { companyName: true },
  });
  return {
    title: assessment ? `${assessment.companyName} — Assessment` : "Assessment",
  };
}

export default async function AssessmentLayout({
  children,
  params,
}: AssessmentLayoutProps) {
  const { id: assessmentId } = await params;

  const assessment = await prisma.assessment.findUnique({
    where: { id: assessmentId, deletedAt: null },
    select: {
      id: true, status: true, companyName: true,
      industry: true, country: true, companySize: true,
      employeeCount: true, annualRevenue: true,
      deploymentModel: true, sapModules: true,
      migrationApproach: true, targetGoLiveDate: true,
      keyProcesses: true, operatingCountries: true,
      currentErpVersion: true, itLandscapeSummary: true,
      // Phase 13.4 — surface catalog edition + version on the shell chip
      catalogVersion: { select: { edition: true, version: true } },
    },
  });

  if (!assessment) {
    notFound();
  }

  const { score: profileScore } = calculateProfileCompleteness(assessment);
  const scopeLocked = profileScore < PROFILE_COMPLETENESS_GATE;

  return (
    <AptusAssessmentShell
      assessmentId={assessment.id}
      companyName={assessment.companyName}
      status={assessment.status}
      {...(assessment.catalogVersion ? {
        catalogEdition: assessment.catalogVersion.edition,
        catalogVersion: assessment.catalogVersion.version,
      } : {})}
      scopeLocked={scopeLocked}
    >
      {children}
    </AptusAssessmentShell>
  );
}
