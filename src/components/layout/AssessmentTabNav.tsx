"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface Tab {
  label: string;
  href: string;
  segment: string;
}

interface AssessmentTabNavProps {
  assessmentId: string;
  assessmentStatus: string;
}

export function AssessmentTabNav({ assessmentId, assessmentStatus }: AssessmentTabNavProps) {
  const pathname = usePathname();
  const base = `/assessment/${assessmentId}`;

  const tabs: Tab[] = [
    { label: "Profile", href: `${base}/profile`, segment: "profile" },
    { label: "Scope", href: `${base}/scope`, segment: "scope" },
    { label: "Review", href: `${base}/review`, segment: "review" },
    { label: "Process Map", href: `${base}/process-map`, segment: "process-map" },
    { label: "Gaps", href: `${base}/gaps`, segment: "gaps" },
    { label: "Integrations", href: `${base}/integrations`, segment: "integrations" },
    { label: "Data Migration", href: `${base}/data-migration`, segment: "data-migration" },
    { label: "OCM", href: `${base}/ocm`, segment: "ocm" },
    { label: "Workshops", href: `${base}/workshops`, segment: "workshops" },
    { label: "Activity", href: `${base}/activity`, segment: "activity" },
  ];

  // Show report tab for late-stage assessments (V1 + V2 statuses)
  const reportStatuses = ["reviewed", "signed_off", "validated", "pending_sign_off", "handed_off", "archived"];
  if (reportStatuses.includes(assessmentStatus)) {
    tabs.push({ label: "Report", href: `${base}/report`, segment: "report" });
  }

  const activeSegment = pathname.replace(base, "").split("/").filter(Boolean)[0] ?? "profile";

  return (
    <nav className="border-b mb-6">
      <div className="flex gap-0 overflow-x-auto">
        {tabs.map((tab) => {
          const isActive = tab.segment === activeSegment;
          return (
            <Link
              key={tab.segment}
              href={tab.href}
              className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                isActive
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-gray-300"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
