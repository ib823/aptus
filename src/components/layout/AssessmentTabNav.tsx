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

  // Show sign-off & lifecycle tabs for late-stage assessments
  const signOffStatuses = ["reviewed", "validated", "pending_sign_off", "signed_off", "handed_off", "archived"];
  if (signOffStatuses.includes(assessmentStatus)) {
    tabs.push({ label: "Sign-Off", href: `${base}/sign-off`, segment: "sign-off" });
    tabs.push({ label: "Snapshots", href: `${base}/snapshots`, segment: "snapshots" });
  }

  // Change requests and triggers available for any active or completed assessment
  const lifecycleStatuses = ["reviewed", "validated", "pending_sign_off", "signed_off", "handed_off", "archived"];
  if (lifecycleStatuses.includes(assessmentStatus)) {
    tabs.push({ label: "Changes", href: `${base}/change-requests`, segment: "change-requests" });
    tabs.push({ label: "Triggers", href: `${base}/triggers`, segment: "triggers" });
  }

  // Benchmarks and cross-phase available for assessments with data
  const analyticsStatuses = ["in_progress", "workshop_active", "review_cycle", "gap_resolution", "pending_validation", "reviewed", "validated", "pending_sign_off", "signed_off", "handed_off", "completed", "archived"];
  if (analyticsStatuses.includes(assessmentStatus)) {
    tabs.push({ label: "Benchmarks", href: `${base}/benchmarks`, segment: "benchmarks" });
    tabs.push({ label: "Cross-Phase", href: `${base}/cross-phase`, segment: "cross-phase" });
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
