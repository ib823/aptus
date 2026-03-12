"use client";

import { usePathname } from "next/navigation";
import {
  Settings2,
  ClipboardCheck,
  BarChart3,
  Database,
  CheckCircle2,
  Lock,
} from "lucide-react";
import React, { type MouseEvent } from "react";
import { navigateToDocument } from "@/lib/navigation/document-navigation";

interface MobileBottomTabBarProps {
  assessmentId: string;
  assessmentStatus: string;
}

const stages = [
  { label: "Setup", icon: Settings2, segment: "profile", href: "/profile" },
  { label: "Review", icon: ClipboardCheck, segment: "review", href: "/review" },
  { label: "Results", icon: BarChart3, segment: "config", href: "/config" },
  { label: "Tracking", icon: Database, segment: "integrations", href: "/integrations" },
  { label: "Wrap-up", icon: CheckCircle2, segment: "activity", href: "/activity" },
];

const setupSegments = ["profile", "scope"];
const reviewSegments = ["review", "conversation"];
const outputSegments = ["config", "process-map", "flows", "gaps", "remaining"];
const registerSegments = ["integrations", "data-migration", "ocm", "workshops"];
const wrapupSegments = ["activity", "sign-off", "report", "snapshots", "change-requests", "triggers", "benchmarks", "cross-phase"];

export function MobileBottomTabBar({ assessmentId, assessmentStatus }: MobileBottomTabBarProps) {
  const pathname = usePathname();
  const base = `/assessment/${assessmentId}`;
  const preReviewStage = assessmentStatus === "draft" || assessmentStatus === "scoping";
  const lockedStageTitle = assessmentStatus === "draft"
    ? "Complete setup and move the assessment into In Progress to unlock this stage."
    : "Complete scope selection and move the assessment into In Progress to unlock this stage.";

  const handleStageClick = (event: MouseEvent<HTMLAnchorElement>, href: string, locked?: boolean) => {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }

    if (locked) {
      event.preventDefault();
      return;
    }

    event.preventDefault();
    navigateToDocument(href);
  };

  const getActiveStage = () => {
    const currentSegment = (pathname ?? "").replace(base + "/", "").split("/")[0];

    if (setupSegments.includes(currentSegment ?? "")) return "profile";
    if (reviewSegments.includes(currentSegment ?? "")) return "review";
    if (outputSegments.includes(currentSegment ?? "")) return "config";
    if (registerSegments.includes(currentSegment ?? "")) return "integrations";
    if (wrapupSegments.includes(currentSegment ?? "")) return "activity";
    return "profile";
  };

  const activeStage = getActiveStage();

  return (
    <nav
      className="flex items-center justify-around border-t py-2 px-1 pb-[env(safe-area-inset-bottom)] min-h-[calc(64px+env(safe-area-inset-bottom))]"
      style={{
        background: "var(--sapTile_Background, #fff)",
        borderColor: "var(--sapGroup_ContentBorderColor, #d9d9d9)",
      }}
    >
      {stages.map((stage) => {
        const isActive = stage.segment === activeStage;
        const Icon = stage.icon;
        const isLocked = preReviewStage && stage.segment !== "profile";
        return (
          <a
            key={stage.segment}
            href={`${base}${stage.href}`}
            aria-disabled={isLocked || undefined}
            title={isLocked ? lockedStageTitle : undefined}
            tabIndex={isLocked ? -1 : undefined}
            onClick={(event) => handleStageClick(event, `${base}${stage.href}`, isLocked)}
            className="flex flex-col items-center gap-0.5 px-2 py-1 rounded-md text-[10px] font-medium transition-colors"
            style={{
              color: isActive
                ? "var(--sapSelectedColor, #0854a0)"
                : isLocked
                  ? "var(--sapContent_NonInteractiveIconColor, #89919a)"
                  : "var(--sapContent_LabelColor, #6a6d70)",
              opacity: isLocked ? 0.65 : 1,
              cursor: isLocked ? "not-allowed" : "pointer",
            }}
          >
            <div className="relative">
              <Icon className="w-5 h-5" />
              {isLocked && <Lock className="absolute -top-1 -right-1 w-2.5 h-2.5 opacity-80" />}
            </div>
            <span>{stage.label}</span>
          </a>
        );
      })}
    </nav>
  );
}
