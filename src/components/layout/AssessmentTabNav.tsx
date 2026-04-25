"use client";

import { usePathname } from "next/navigation";
import { Lock } from "lucide-react";
import React, { type MouseEvent } from "react";

interface TabDef {
  label: string;
  href: string;
  segment: string;
  title?: string;
  locked?: boolean;
}

interface TabStage {
  label: string;
  tabs: TabDef[];
  locked?: boolean;
  title?: string;
}

interface AssessmentTabNavProps {
  assessmentId: string;
  assessmentStatus: string;
  scopeLocked?: boolean;
  profileScore?: number;
}

export function AssessmentTabNav({ assessmentId, assessmentStatus, scopeLocked, profileScore }: AssessmentTabNavProps) {
  const pathname = usePathname();
  const base = `/assessment/${assessmentId}`;
  const activeSegment = (pathname ?? "").replace(base, "").split("/").filter(Boolean)[0] ?? "profile";
  const preReviewStage = assessmentStatus === "draft" || assessmentStatus === "scoping";
  const lockedStageTitle = assessmentStatus === "draft"
    ? "Complete setup and move the assessment into In Progress to unlock this stage."
    : "Complete scope selection and move the assessment into In Progress to unlock this stage.";

  const handleLockedClick = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
  };

  // Phase 5 — Simplified analyzer-flow tab nav.
  // Hidden routes still work via direct URL (Step Review, Conversation,
  // Config, Process Map, Flows, Action Items, Integrations, Data Transfer,
  // OCM, Workshops, Activity Log, Snapshots, Change Requests). They're just
  // not surfaced in the day-to-day workflow.
  const stages: TabStage[] = [
    {
      label: "Setup",
      tabs: [
        { label: "Profile", href: `${base}/profile`, segment: "profile" },
        {
          label: "Scope",
          href: `${base}/scope`,
          segment: "scope",
          ...(scopeLocked ? { locked: true, title: `Profile ${profileScore ?? 0}% complete — reach 60% to unlock` } : {}),
        },
        { label: "Requirements", href: `${base}/requirements`, segment: "requirements" },
        { label: "Granularity", href: `${base}/granularity`, segment: "granularity" },
      ],
    },
    {
      label: "Output",
      ...(preReviewStage ? { locked: true, title: lockedStageTitle } : {}),
      tabs: [
        { label: "Gaps", href: `${base}/gaps`, segment: "gaps" },
      ],
    },
  ];

  // Late-stage tabs: only Report visible by default. Sign-Off, Snapshots,
  // Changes, Benchmarks etc. remain reachable via direct URL but aren't in
  // the default analyzer flow.
  const reportStatuses = ["reviewed", "signed_off", "validated", "pending_sign_off", "handed_off", "archived"];
  if (reportStatuses.includes(assessmentStatus)) {
    stages.push({
      label: "Report",
      tabs: [
        { label: "Download", href: `${base}/report`, segment: "report" },
      ],
    });
  }

  // Find active stage
  const activeStageIndex = stages.findIndex((stage) =>
    stage.tabs.some((tab) => tab.segment === activeSegment),
  );
  const activeStage = stages[activeStageIndex >= 0 ? activeStageIndex : 0]!;

  return (
    <nav className="mb-6" aria-label="Assessment navigation">
      {/* Stage-level tabs */}
      <div
        className="flex border-b"
        role="tablist"
        aria-label="Assessment stages"
        style={{ borderColor: "var(--sapGroup_ContentBorderColor, #d9d9d9)" }}
      >
        {stages.map((stage) => {
          const isActive = activeStage === stage;
          const isLocked = stage.locked ?? false;
          const tab = (
            <a
              key={stage.label}
              href={isLocked ? undefined : stage.tabs[0]!.href}
              role="tab"
              aria-selected={isActive}
              aria-disabled={isLocked || undefined}
              title={isLocked ? undefined : stage.title}
              tabIndex={isLocked ? -1 : undefined}
              onClick={isLocked ? handleLockedClick : undefined}
              className={`px-4 py-2.5 text-sm font-medium transition-colors whitespace-nowrap select-none ${
                isActive ? "" : isLocked ? "pointer-events-none" : "hover:opacity-80"
              }`}
              style={{
                color: isActive
                  ? "var(--sapSelectedColor, #0854a0)"
                  : isLocked
                    ? "var(--sapContent_NonInteractiveIconColor, #c2c5c8)"
                    : "var(--sapContent_LabelColor, #6a6d70)",
                boxShadow: isActive
                  ? "inset 0 -2px 0 var(--sapSelectedColor, #0854a0)"
                  : "none",
                background: isActive
                  ? "var(--sapList_Active_Background, #eaf6ff)"
                  : "transparent",
                opacity: isLocked ? 0.45 : 1,
              }}
            >
              {isLocked && <Lock className="inline w-3 h-3 mr-1" />}
              {stage.label}
            </a>
          );
          // Wrap locked tabs so the parent span still receives hover for the native tooltip
          return isLocked ? (
            <span key={stage.label} title={stage.title} className="cursor-not-allowed">
              {tab}
            </span>
          ) : tab;
        })}
      </div>
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
            const isLocked = tab.locked ?? false;
            const link = (
              <a
                key={tab.segment}
                href={isLocked ? undefined : tab.href}
                role="tab"
                aria-selected={isActive}
                aria-disabled={isLocked || undefined}
                title={isLocked ? undefined : tab.title}
                tabIndex={isLocked ? -1 : undefined}
                onClick={isLocked ? handleLockedClick : undefined}
                className={`px-3 py-1.5 text-xs font-medium whitespace-nowrap border-b-2 transition-colors select-none ${
                  isLocked ? "pointer-events-none" : ""
                }`}
                style={{
                  borderColor: isActive
                    ? "var(--sapSelectedColor, #0854a0)"
                    : "transparent",
                  color: isActive
                    ? "var(--sapSelectedColor, #0854a0)"
                    : isLocked
                      ? "var(--sapContent_NonInteractiveIconColor, #c2c5c8)"
                      : "var(--sapContent_LabelColor, #6a6d70)",
                  background: isActive
                    ? "var(--sapList_Active_Background, #eaf6ff)"
                    : "transparent",
                  opacity: isLocked ? 0.45 : 1,
                }}
              >
                {isLocked && <Lock className="inline w-3 h-3 mr-1" />}
                {tab.label}
              </a>
            );
            return isLocked ? (
              <span key={tab.segment} title={tab.title} className="cursor-not-allowed">
                {link}
              </span>
            ) : link;
          })}
        </div>
      )}
    </nav>
  );
}
