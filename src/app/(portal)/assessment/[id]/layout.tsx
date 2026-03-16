import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { prisma } from "@/lib/db/prisma";
import { calculateProfileCompleteness } from "@/lib/assessment/profile-completeness";
import { PROFILE_COMPLETENESS_GATE } from "@/types/assessment";
import { AssessmentTabNav } from "@/components/layout/AssessmentTabNav";
import { MobileBottomTabBar } from "@/components/layout/MobileBottomTabBar";
import { StatusTransitionBar } from "@/components/assessment/StatusTransitionBar";
import { PresenceAvatars } from "@/components/collaboration/PresenceAvatars";
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
    },
  });

  if (!assessment) {
    notFound();
  }

  const { score: profileScore } = calculateProfileCompleteness(assessment);
  const scopeLocked = profileScore < PROFILE_COMPLETENESS_GATE;

  return (
    <div className="flex flex-col h-full">
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 px-4 pt-3 pb-1 text-sm">
        <a href="/assessments" className="text-muted-foreground hover:text-foreground transition-colors">
          Assessments
        </a>
        <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/60" />
        <span className="font-medium text-foreground truncate max-w-[300px]" title={assessment.companyName}>
          {assessment.companyName}
        </span>
      </nav>
      <div className="flex items-center justify-between px-4 py-2">
        <StatusTransitionBar
          assessmentId={assessment.id}
          currentStatus={assessment.status}
        />
        <PresenceAvatars assessmentId={assessment.id} />
      </div>
      <div className="hidden md:block">
        <AssessmentTabNav
          assessmentId={assessment.id}
          assessmentStatus={assessment.status}
          scopeLocked={scopeLocked}
          profileScore={profileScore}
        />
      </div>
      <div className="flex-1 min-h-0 overflow-auto pb-16 md:pb-0" role="region" aria-label="Assessment content" data-assessment-main>
        {children}
      </div>
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-40">
        <MobileBottomTabBar
          assessmentId={assessment.id}
          assessmentStatus={assessment.status}
        />
      </div>
    </div>
  );
}
