"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Settings2,
  ClipboardCheck,
  BarChart3,
  Database,
  CheckCircle2,
} from "lucide-react";

interface MobileBottomTabBarProps {
  assessmentId: string;
}

const stages = [
  { label: "Setup", icon: Settings2, segment: "profile", href: "/profile" },
  { label: "Review", icon: ClipboardCheck, segment: "review", href: "/review" },
  { label: "Outputs", icon: BarChart3, segment: "config", href: "/config" },
  { label: "Registers", icon: Database, segment: "integrations", href: "/integrations" },
  { label: "Wrap-up", icon: CheckCircle2, segment: "activity", href: "/activity" },
];

const setupSegments = ["profile", "scope"];
const reviewSegments = ["review", "conversation"];
const outputSegments = ["config", "process-map", "flows", "gaps", "remaining"];
const registerSegments = ["integrations", "data-migration", "ocm", "workshops"];
const wrapupSegments = ["activity", "sign-off", "report", "snapshots", "change-requests", "triggers", "benchmarks", "cross-phase"];

export function MobileBottomTabBar({ assessmentId }: MobileBottomTabBarProps) {
  const pathname = usePathname();
  const base = `/assessment/${assessmentId}`;

  const getActiveStage = () => {
    const currentSegment = pathname.replace(base + "/", "").split("/")[0];

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
      className="flex items-center justify-around border-t py-2 px-1"
      style={{
        background: "var(--sapTile_Background, #fff)",
        borderColor: "var(--sapGroup_ContentBorderColor, #d9d9d9)",
      }}
    >
      {stages.map((stage) => {
        const isActive = stage.segment === activeStage;
        const Icon = stage.icon;
        return (
          <Link
            key={stage.segment}
            href={`${base}${stage.href}`}
            className="flex flex-col items-center gap-0.5 px-2 py-1 rounded-md text-[10px] font-medium transition-colors"
            style={{
              color: isActive
                ? "var(--sapSelectedColor, #0854a0)"
                : "var(--sapContent_LabelColor, #6a6d70)",
            }}
          >
            <Icon className="w-5 h-5" />
            <span>{stage.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
