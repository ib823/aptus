"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface Tab {
  label: string;
  href: string;
  segment: string;
  title?: string;
}

interface TabStage {
  label: string;
  tabs: Tab[];
}

interface AssessmentTabNavProps {
  assessmentId: string;
  assessmentStatus: string;
}

export function AssessmentTabNav({ assessmentId, assessmentStatus }: AssessmentTabNavProps) {
  const pathname = usePathname();
  const base = `/assessment/${assessmentId}`;
  const activeSegment = pathname.replace(base, "").split("/").filter(Boolean)[0] ?? "profile";

  // Build stages with conditional tabs
  const stages: TabStage[] = [
    {
      label: "Setup",
      tabs: [
        { label: "Profile", href: `${base}/profile`, segment: "profile" },
        { label: "Scope", href: `${base}/scope`, segment: "scope" },
      ],
    },
    {
      label: "Review",
      tabs: [
        { label: "Step Review", href: `${base}/review`, segment: "review" },
        { label: "Conversation", href: `${base}/conversation`, segment: "conversation" },
      ],
    },
    {
      label: "Outputs",
      tabs: [
        { label: "Config", href: `${base}/config`, segment: "config" },
        { label: "Process Map", href: `${base}/process-map`, segment: "process-map" },
        { label: "Flows", href: `${base}/flows`, segment: "flows" },
        { label: "Gaps", href: `${base}/gaps`, segment: "gaps" },
        { label: "Remaining", href: `${base}/remaining`, segment: "remaining" },
      ],
    },
    {
      label: "Registers",
      tabs: [
        { label: "Integrations", href: `${base}/integrations`, segment: "integrations" },
        { label: "Data Migration", href: `${base}/data-migration`, segment: "data-migration" },
        { label: "Change Mgmt", href: `${base}/ocm`, segment: "ocm", title: "Organizational Change Management" },
        { label: "Workshops", href: `${base}/workshops`, segment: "workshops" },
      ],
    },
    {
      label: "Wrap-up",
      tabs: [
        { label: "Activity", href: `${base}/activity`, segment: "activity" },
      ],
    },
  ];

  // Add conditional late-stage tabs to Wrap-up
  const wrapUpStage = stages[4]!;
  const reportStatuses = ["reviewed", "signed_off", "validated", "pending_sign_off", "handed_off", "archived"];
  if (reportStatuses.includes(assessmentStatus)) {
    wrapUpStage.tabs.push({ label: "Report", href: `${base}/report`, segment: "report" });
  }
  const signOffStatuses = ["reviewed", "validated", "pending_sign_off", "signed_off", "handed_off", "archived"];
  if (signOffStatuses.includes(assessmentStatus)) {
    wrapUpStage.tabs.push({ label: "Sign-Off", href: `${base}/sign-off`, segment: "sign-off" });
    wrapUpStage.tabs.push({ label: "Snapshots", href: `${base}/snapshots`, segment: "snapshots" });
  }
  const lifecycleStatuses = ["reviewed", "validated", "pending_sign_off", "signed_off", "handed_off", "archived"];
  if (lifecycleStatuses.includes(assessmentStatus)) {
    wrapUpStage.tabs.push({ label: "Changes", href: `${base}/change-requests`, segment: "change-requests" });
    wrapUpStage.tabs.push({ label: "Triggers", href: `${base}/triggers`, segment: "triggers" });
  }

  // Add analytics stage conditionally
  const analyticsStatuses = ["in_progress", "workshop_active", "review_cycle", "gap_resolution", "pending_validation", "reviewed", "validated", "pending_sign_off", "signed_off", "handed_off", "completed", "archived"];
  if (analyticsStatuses.includes(assessmentStatus)) {
    wrapUpStage.tabs.push({ label: "Benchmarks", href: `${base}/benchmarks`, segment: "benchmarks" });
    wrapUpStage.tabs.push({ label: "Cross-Phase", href: `${base}/cross-phase`, segment: "cross-phase" });
  }

  // Find active stage
  const activeStageIndex = stages.findIndex((stage) =>
    stage.tabs.some((tab) => tab.segment === activeSegment),
  );
  const activeStage = stages[activeStageIndex >= 0 ? activeStageIndex : 0]!;

  return (
    <nav className="border-b mb-6" aria-label="Assessment navigation">
      {/* Stage-level tabs */}
      <div className="flex gap-0" role="tablist" aria-label="Assessment stages">
        {stages.map((stage) => {
          const isActive = activeStage === stage;
          return (
            <Link
              key={stage.label}
              href={stage.tabs[0]!.href}
              role="tab"
              aria-selected={isActive}
              className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                isActive
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30"
              }`}
            >
              {stage.label}
            </Link>
          );
        })}
      </div>
      {/* Sub-tabs for active stage (only if >1 tab) */}
      {activeStage.tabs.length > 1 && (
        <div className="flex gap-0 bg-muted/30 border-b" role="tablist" aria-label={`${activeStage.label} sub-navigation`}>
          {activeStage.tabs.map((tab) => {
            const isActive = tab.segment === activeSegment;
            return (
              <Link
                key={tab.segment}
                href={tab.href}
                role="tab"
                aria-selected={isActive}
                title={tab.title}
                className={`px-3 py-1.5 text-xs font-medium whitespace-nowrap border-b-2 transition-colors ${
                  isActive
                    ? "border-primary text-primary bg-background"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>
      )}
    </nav>
  );
}
