"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  TabContainer,
  Tab,
  TabSeparator,
} from "@ui5/webcomponents-react";

interface TabDef {
  label: string;
  href: string;
  segment: string;
  title?: string;
}

interface TabStage {
  label: string;
  tabs: TabDef[];
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
      label: "Results",
      tabs: [
        { label: "Config", href: `${base}/config`, segment: "config" },
        { label: "Process Map", href: `${base}/process-map`, segment: "process-map" },
        { label: "Flows", href: `${base}/flows`, segment: "flows" },
        { label: "Gaps", href: `${base}/gaps`, segment: "gaps" },
        { label: "Action Items", href: `${base}/remaining`, segment: "remaining" },
      ],
    },
    {
      label: "Tracking",
      tabs: [
        { label: "System Connections", href: `${base}/integrations`, segment: "integrations" },
        { label: "Data Transfer", href: `${base}/data-migration`, segment: "data-migration" },
        { label: "Change Impact", href: `${base}/ocm`, segment: "ocm", title: "Organizational Change Management" },
        { label: "Workshops", href: `${base}/workshops`, segment: "workshops" },
      ],
    },
    {
      label: "Wrap-up",
      tabs: [
        { label: "Activity Log", href: `${base}/activity`, segment: "activity" },
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
    <nav className="mb-6" aria-label="Assessment navigation">
      {/* Stage-level tabs using UI5 TabContainer */}
      <TabContainer
        onTabSelect={(e: unknown) => {
          const event = e as { detail?: { tab?: HTMLElement } };
          const tab = event.detail?.tab;
          const href = tab?.dataset?.href;
          if (href) {
            window.location.href = href;
          }
        }}
        className="[&]:border-b"
      >
        {stages.map((stage, stageIndex) => {
          const isActive = activeStage === stage;
          return (
            <>
              <Tab
                key={stage.label}
                text={stage.label}
                selected={isActive}
                data-href={stage.tabs[0]!.href}
              />
              {stageIndex < stages.length - 1 && (
                <TabSeparator key={`sep-${stageIndex}`} />
              )}
            </>
          );
        })}
      </TabContainer>
      {/* Sub-tabs for active stage (only if >1 tab) */}
      {activeStage.tabs.length > 1 && (
        <div
          className="flex gap-0 border-b"
          role="tablist"
          aria-label={`${activeStage.label} sub-navigation`}
          style={{
            background: "var(--sapGroup_ContentBackground, #fff)",
            borderColor: "var(--sapGroup_ContentBorderColor, #d9d9d9)",
          }}
        >
          {activeStage.tabs.map((tab) => {
            const isActive = tab.segment === activeSegment;
            return (
              <Link
                key={tab.segment}
                href={tab.href}
                role="tab"
                aria-selected={isActive}
                title={tab.title}
                className="px-3 py-1.5 text-xs font-medium whitespace-nowrap border-b-2 transition-colors"
                style={{
                  borderColor: isActive
                    ? "var(--sapSelectedColor, #0854a0)"
                    : "transparent",
                  color: isActive
                    ? "var(--sapSelectedColor, #0854a0)"
                    : "var(--sapContent_LabelColor, #6a6d70)",
                  background: isActive
                    ? "var(--sapList_Active_Background, #eaf6ff)"
                    : "transparent",
                }}
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
