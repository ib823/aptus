"use client";

/**
 * AptusAssessmentShell — App-5 redesign of the assessment shell layout.
 * Source: docs/design/v1.2/assessment.jsx (the prototype's AssessmentShell).
 *
 * Replaces the breadcrumb + StatusTransitionBar header. Adds the StepRail
 * (breadcrumb variant) so users can navigate between Profile → Scope →
 * Analyze → Adjust → Export at a glance.
 *
 * Each step maps to one or more existing routes via STEP_ROUTE_MAP. The
 * usePathname() is matched to determine the active step. Clicking a step
 * navigates to its primary route.
 *
 * Preserves the existing AssessmentTabNav (rendered via children/secondary
 * nav slot) so all 29 ancillary sub-pages keep working unchanged.
 */

import { ArrowLeft, Download, Share2 } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { StatusPill } from "./StatusPill";
import { STEPS, StepRail } from "./StepRail";

interface AptusAssessmentShellProps {
  assessmentId: string;
  companyName: string;
  status: string;
  /** The existing AssessmentTabNav (or any other secondary chrome) goes here. */
  secondaryNav?: React.ReactNode;
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
    prefixes: ["/scope", "/granularity", "/workshops"],
  },
  analyze: {
    primaryRoute: (id) => `/assessment/${id}/process-map`,
    prefixes: ["/process-map", "/review"],
  },
  adjust: {
    primaryRoute: (id) => `/assessment/${id}/gaps`,
    prefixes: ["/gaps", "/config", "/integrations", "/data-migration", "/ocm"],
  },
  export: {
    primaryRoute: (id) => `/assessment/${id}/report`,
    prefixes: ["/report", "/sign-off", "/snapshots"],
  },
};

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
  secondaryNav,
  children,
}: AptusAssessmentShellProps) {
  const router = useRouter();
  const pathname = usePathname() ?? `/assessment/${assessmentId}`;
  const currentStep = activeStepFromPath(pathname, assessmentId);
  const completed = completedStepsFor(currentStep);

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
          </div>
        </div>

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

      {/* Step rail (breadcrumb variant) */}
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
      </div>

      {/* Optional secondary nav (the existing AssessmentTabNav lives here) */}
      {secondaryNav && (
        <div style={{ background: "var(--aptus-surface)" }}>{secondaryNav}</div>
      )}

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
