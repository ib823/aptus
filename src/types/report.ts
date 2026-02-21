export type ReportType =
  | "executive_summary" | "scope_catalog" | "step_detail" | "gap_register"
  | "config_workbook" | "effort_estimate" | "audit_trail" | "flow_atlas"
  | "remaining_register" | "integration_register" | "dm_register"
  | "ocm_report" | "readiness_scorecard" | "complete_package";

export type ReportStatus = "generating" | "completed" | "failed";

export type ReadinessStatus = "green" | "amber" | "red";
export type GoNoGoDecision = "go" | "conditional_go" | "no_go";

export interface ReadinessScore {
  category: string;
  score: number;
  status: ReadinessStatus;
  findings: string[];
  recommendations: string[];
}

export interface ReadinessScorecard {
  overallScore: number;
  overallStatus: ReadinessStatus;
  categories: ReadinessScore[];
  goNoGo: GoNoGoDecision;
  executiveSummary: string;
}

export interface ReportBrandingInput {
  logoUrl?: string | null | undefined;
  primaryColor?: string | undefined;
  secondaryColor?: string | undefined;
  footerText?: string | null | undefined;
  companyName?: string | null | undefined;
}

export const ALL_REPORT_TYPES: ReportType[] = [
  "executive_summary", "scope_catalog", "step_detail", "gap_register",
  "config_workbook", "effort_estimate", "audit_trail", "flow_atlas",
  "remaining_register", "integration_register", "dm_register",
  "ocm_report", "readiness_scorecard", "complete_package",
];
