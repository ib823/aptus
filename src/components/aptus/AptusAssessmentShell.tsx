"use client";

/**
 * AptusAssessmentShell — App-5 redesign of the assessment shell layout.
 * Source: docs/design/v1.2/assessment.jsx (the prototype's AssessmentShell).
 *
 * Replaces the breadcrumb + StatusTransitionBar header. Adds the StepRail
 * (breadcrumb variant) plus a per-step StepSubTabs strip. The legacy
 * AssessmentTabNav has been removed; its surviving routes are now folded
 * into the StepSubTabs map below.
 *
 * Each step maps to one or more existing routes via STEP_ROUTE_MAP. The
 * usePathname() is matched to determine the active step. Clicking a step
 * navigates to its primary route.
 */

import { ArrowLeft, Clock, Download, Share2 } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { StatusPill } from "./StatusPill";
import { STEPS, StepRail } from "./StepRail";
import { StepSubTabs, type StepSubTab } from "./StepSubTabs";

interface AptusAssessmentShellProps {
  assessmentId: string;
  companyName: string;
  status: string;
  /**
   * Phase 13.4 — AD-13.7: pinned catalog edition + version chip beside the
   * company name so consultants always see which SAP catalog they're
   * classifying against. Optional for backwards compatibility with legacy
   * assessments still missing catalogVersionId.
   */
  catalogEdition?: string;
  catalogVersion?: string;
  /**
   * When true, the Scope step's sub-tabs are rendered disabled with a
   * tooltip pointing back to Profile. The Scope step button in the rail
   * itself remains clickable (matches the legacy behaviour — server-side
   * gating still applies).
   */
  scopeLocked?: boolean;
  /** The actual page content. */
  children: React.ReactNode;
}

/**
 * Map each of the 5 spec steps to its primary route + the route prefixes
 * that count as that step. The key is the AptusStep.key.
 */
const STEP_ROUTE_MAP: Record<
  (typeof STEPS)[number]["key"],
  { primaryRoute: (id: string) => string; prefixes: string[] }
> = {
  profile: {
    primaryRoute: (id) => `/assessment/${id}/profile`,
    prefixes: ["/profile"],
  },
  scope: {
    primaryRoute: (id) => `/assessment/${id}/scope`,
    prefixes: ["/scope", "/requirements", "/granularity", "/workshops"],
  },
  analyze: {
    primaryRoute: (id) => `/assessment/${id}/process-map`,
    prefixes: ["/process-map", "/flows", "/review", "/conversation"],
  },
  adjust: {
    primaryRoute: (id) => `/assessment/${id}/gaps`,
    prefixes: [
      "/gaps",
      "/config",
      "/integrations",
      "/data-migration",
      "/ocm",
      "/remaining",
    ],
  },
  export: {
    primaryRoute: (id) => `/assessment/${id}/report`,
    prefixes: ["/report", "/sign-off", "/snapshots"],
  },
};

/**
 * Per-step sub-tab definitions. Each step's surviving routes show up as a
 * tab strip under the step rail. Steps with a single surface (Profile)
 * return [] and the StepSubTabs component renders nothing.
 */
function buildSubTabs(
  step: (typeof STEPS)[number]["key"],
  assessmentId: string,
  scopeLocked: boolean,
): StepSubTab[] {
  const id = assessmentId;
  switch (step) {
    case "profile":
      return [];
    case "scope": {
      const labels = ["Scope", "Requirements", "Granularity", "Workshops"] as const;
      const slugs = ["scope", "requirements", "granularity", "workshops"] as const;
      return labels.map((label, i) => {
        const tab: StepSubTab = { label, href: `/assessment/${id}/${slugs[i]}` };
        if (scopeLocked) {
          tab.disabled = true;
          tab.disabledReason = "Complete the Profile to unlock Scope.";
        }
        return tab;
      });
    }
    case "analyze":
      return [
        { label: "Process Map", href: `/assessment/${id}/process-map` },
        { label: "Flows", href: `/assessment/${id}/flows` },
        { label: "Review", href: `/assessment/${id}/review` },
        { label: "Conversation", href: `/assessment/${id}/conversation` },
      ];
    case "adjust":
      return [
        { label: "Gaps", href: `/assessment/${id}/gaps` },
        { label: "Config", href: `/assessment/${id}/config` },
        { label: "Integrations", href: `/assessment/${id}/integrations` },
        { label: "Data Migration", href: `/assessment/${id}/data-migration` },
        { label: "OCM", href: `/assessment/${id}/ocm` },
        { label: "Remaining", href: `/assessment/${id}/remaining` },
      ];
    case "export":
      return [
        { label: "Report", href: `/assessment/${id}/report` },
        { label: "Sign-off", href: `/assessment/${id}/sign-off` },
        { label: "Snapshots", href: `/assessment/${id}/snapshots` },
      ];
  }
}

/** Resolve the active step number from the current pathname. */
function activeStepFromPath(pathname: string, assessmentId: string): number {
  const tail = pathname.replace(`/assessment/${assessmentId}`, "");
  for (const step of STEPS) {
    const map = STEP_ROUTE_MAP[step.key];
    if (map.prefixes.some((p) => tail === p || tail.startsWith(`${p}/`))) {
      return step.n;
    }
  }
  // Default to step 1 (Profile) — covers the bare /assessment/[id] route
  return 1;
}

/** Resolve which steps should be shown as "complete" — heuristic: every step
 * before the current one is treated as complete. The actual workflow may
 * have more sophisticated completion gating; this is the visual default. */
function completedStepsFor(currentStep: number): number[] {
  return Array.from({ length: currentStep - 1 }, (_, i) => i + 1);
}

/** The status pill tone for an assessment status. */
function statusTone(status: string): "info" | "success" | "neutral" | "warning" {
  const s = status.toLowerCase();
  if (s.includes("active") || s.includes("progress") || s.includes("review")) return "info";
  if (s.includes("done") || s.includes("complete") || s.includes("signed")) return "success";
  if (s.includes("draft")) return "neutral";
  return "warning";
}

export function AptusAssessmentShell({
  assessmentId,
  companyName,
  status,
  catalogEdition,
  catalogVersion,
  scopeLocked = false,
  children,
}: AptusAssessmentShellProps) {
  const router = useRouter();
  const pathname = usePathname() ?? `/assessment/${assessmentId}`;
  const currentStep = activeStepFromPath(pathname, assessmentId);
  const completed = completedStepsFor(currentStep);
  const currentStepKey = STEPS[currentStep - 1]?.key ?? "profile";
  const subTabs = buildSubTabs(currentStepKey, assessmentId, scopeLocked);

  const handleStepSelect = (n: number) => {
    const step = STEPS.find((s) => s.n === n);
    if (!step) return;
    router.push(STEP_ROUTE_MAP[step.key].primaryRoute(assessmentId));
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Assessment top bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          padding: "12px 24px",
          borderBottom: "1px solid var(--aptus-border)",
          background: "var(--aptus-surface)",
        }}
      >
        <Link
          href="/assessments"
          aria-label="Back to assessments"
          style={{
            width: 32,
            height: 32,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            border: "1px solid transparent",
            borderRadius: 6,
            color: "var(--aptus-text)",
            textDecoration: "none",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--aptus-surface-2)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        >
          <ArrowLeft size={16} />
        </Link>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <h1
              style={{
                fontSize: 20,
                fontWeight: 600,
                margin: 0,
                letterSpacing: "-0.01em",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
              title={companyName}
            >
              {companyName}
            </h1>
            <StatusPill status={`In ${STEPS[currentStep - 1]?.label ?? "?"}`} tone="info" />
            <StatusPill status={status} tone={statusTone(status)} />
            {catalogEdition && catalogVersion && (
              <span
                title={`SAP catalog: ${catalogEdition} ${catalogVersion}`}
                style={{
                  fontSize: 11,
                  fontWeight: 500,
                  padding: "2px 8px",
                  borderRadius: 4,
                  background: "var(--aptus-surface-2)",
                  color: "var(--aptus-text-muted)",
                  border: "1px solid var(--aptus-border)",
                  whiteSpace: "nowrap",
                }}
              >
                {catalogEdition === "PUBLIC" ? "Public" : catalogEdition === "PRIVATE" ? "Private" : catalogEdition} ·{" "}
                {catalogVersion}
              </span>
            )}
          </div>
        </div>

        <Link
          href={`/assessment/${assessmentId}/activity`}
          className="a-btn a-btn-secondary a-btn-sm"
          style={{ textDecoration: "none" }}
          aria-label="View activity feed"
        >
          <Clock size={14} /> Activity
        </Link>
        <button type="button" className="a-btn a-btn-secondary a-btn-sm">
          <Share2 size={14} /> Share
        </button>
        <Link
          href={`/assessment/${assessmentId}/report`}
          className="a-btn a-btn-primary a-btn-sm"
          style={{ textDecoration: "none" }}
        >
          <Download size={14} /> Export
        </Link>
      </div>

      {/* Step rail (breadcrumb variant) + per-step sub-tabs */}
      <div
        style={{
          padding: "0 24px",
          borderBottom: "1px solid var(--aptus-border)",
          background: "var(--aptus-surface)",
        }}
      >
        <StepRail
          current={currentStep}
          completed={completed}
          onSelect={handleStepSelect}
          variant="breadcrumb"
        />
        <StepSubTabs items={subTabs} activeHref={pathname} />
      </div>

      {/* Content */}
      <div
        style={{ flex: 1, minHeight: 0, overflow: "auto" }}
        role="region"
        aria-label="Assessment content"
        data-assessment-main
      >
        {children}
      </div>
    </div>
  );
}
