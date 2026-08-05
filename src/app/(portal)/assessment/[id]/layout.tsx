import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/session";
import { verifyAssessmentAccess } from "@/lib/auth/verify-assessment-access";
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
  // generateMetadata runs ALONGSIDE the layout body, not after it — so the
  // access check the body performs does not cover this fetch. Without its own
  // gate, any signed-in (or anonymous) request could read another tenant's
  // customer name out of the <title> by enumerating ids.
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return { title: "Assessment" };
  const allowed = await verifyAssessmentAccess(
    { id: user.id, role: user.role, organizationId: user.organizationId },
    id,
  );
  if (!allowed) return { title: "Assessment" };
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
      id: true, status: true, companyName: true, organizationId: true,
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

  /*
   * WHO IS ASKING. This layout resolved an assessment from the URL and rendered
   * it — company name, industry, revenue, ERP landscape, and every child screen
   * beneath it: scope, gaps, requirements, the report — with no check of any
   * kind. The portal layout above supplies a session and nothing more, so any
   * signed-in user could read any organization's assessment by id.
   *
   * `requireAssessmentAccess` has guarded the API routes for a long time and has
   * its own coverage test. No page called it or its underlying predicate. That
   * is the same split found this session in Affirm, Discovery and Presales: the
   * mutation path locked, the path that RENDERS the data open.
   *
   * Gated here rather than on each of the ~20 child pages, for the reason the
   * others taught: a per-page check is one forgotten page away from open.
   *
   * `verifyAssessmentAccess` is the rule the API uses — platform admin, same
   * organization, or explicit stakeholder membership. The organizationId is
   * passed in from the row already fetched, so this costs no extra query in the
   * common case. notFound() rather than a 403: existence is not disclosed across
   * tenants.
   */
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!(await verifyAssessmentAccess(user, assessment.id, assessment.organizationId))) {
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
