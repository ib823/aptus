import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { prisma } from "@/lib/db/prisma";
import { AssessmentTabNav } from "@/components/layout/AssessmentTabNav";
import { MobileBottomTabBar } from "@/components/layout/MobileBottomTabBar";
import { StatusTransitionBar } from "@/components/assessment/StatusTransitionBar";
import { PresenceAvatars } from "@/components/collaboration/PresenceAvatars";
import { PresenceHeartbeat } from "@/components/collaboration/PresenceHeartbeat";
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
    select: { id: true, status: true, companyName: true },
  });

  if (!assessment) {
    notFound();
  }

  return (
    <div className="flex flex-col h-full">
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 px-4 pt-3 pb-1 text-sm">
        <Link href="/assessments" className="text-muted-foreground hover:text-foreground transition-colors">
          Assessments
        </Link>
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
        />
      </div>
      <PresenceHeartbeat assessmentId={assessment.id} />
      <main className="flex-1 min-h-0 overflow-auto pb-16 md:pb-0" data-assessment-main>
        {children}
      </main>
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-40">
        <MobileBottomTabBar assessmentId={assessment.id} />
      </div>
    </div>
  );
}
