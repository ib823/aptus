/** Phase 30: Sign-Off & Handoff types */

// Sign-off process status values (stored as String in DB)
export type SignOffStatus =
  | "VALIDATION_NOT_STARTED"
  | "AREA_VALIDATION_IN_PROGRESS"
  | "AREA_VALIDATION_COMPLETE"
  | "TECHNICAL_VALIDATION_IN_PROGRESS"
  | "TECHNICAL_VALIDATION_COMPLETE"
  | "CROSS_FUNCTIONAL_VALIDATION_IN_PROGRESS"
  | "CROSS_FUNCTIONAL_VALIDATION_COMPLETE"
  | "EXECUTIVE_SIGN_OFF_PENDING"
  | "EXECUTIVE_SIGNED"
  | "PARTNER_COUNTERSIGN_PENDING"
  | "COMPLETED"
  | "REJECTED";

export type ValidationStatus = "PENDING" | "APPROVED" | "REJECTED";

export type SignatureType = "EXECUTIVE" | "PARTNER";

export type AlmTarget = "JIRA" | "AZURE_DEVOPS" | "SAP_SOLMAN" | "CSV";

export type HandoffPackageType = "FULL" | "SCOPE_ONLY" | "TECHNICAL" | "EXECUTIVE_SUMMARY";

export type AlmExportStatus = "PENDING" | "IN_PROGRESS" | "COMPLETED" | "FAILED";

export type SignatureRecordStatus = "PENDING" | "COMPLETED" | "DECLINED";

/** All possible sign-off statuses */
export const SIGNOFF_STATUSES: SignOffStatus[] = [
  "VALIDATION_NOT_STARTED",
  "AREA_VALIDATION_IN_PROGRESS",
  "AREA_VALIDATION_COMPLETE",
  "TECHNICAL_VALIDATION_IN_PROGRESS",
  "TECHNICAL_VALIDATION_COMPLETE",
  "CROSS_FUNCTIONAL_VALIDATION_IN_PROGRESS",
  "CROSS_FUNCTIONAL_VALIDATION_COMPLETE",
  "EXECUTIVE_SIGN_OFF_PENDING",
  "EXECUTIVE_SIGNED",
  "PARTNER_COUNTERSIGN_PENDING",
  "COMPLETED",
  "REJECTED",
];

/** State machine transitions for sign-off process */
export const SIGNOFF_TRANSITIONS: Record<SignOffStatus, SignOffStatus[]> = {
  VALIDATION_NOT_STARTED: ["AREA_VALIDATION_IN_PROGRESS"],
  AREA_VALIDATION_IN_PROGRESS: ["AREA_VALIDATION_COMPLETE", "REJECTED"],
  AREA_VALIDATION_COMPLETE: ["TECHNICAL_VALIDATION_IN_PROGRESS"],
  TECHNICAL_VALIDATION_IN_PROGRESS: ["TECHNICAL_VALIDATION_COMPLETE", "REJECTED"],
  TECHNICAL_VALIDATION_COMPLETE: ["CROSS_FUNCTIONAL_VALIDATION_IN_PROGRESS"],
  CROSS_FUNCTIONAL_VALIDATION_IN_PROGRESS: ["CROSS_FUNCTIONAL_VALIDATION_COMPLETE", "REJECTED"],
  CROSS_FUNCTIONAL_VALIDATION_COMPLETE: ["EXECUTIVE_SIGN_OFF_PENDING"],
  EXECUTIVE_SIGN_OFF_PENDING: ["EXECUTIVE_SIGNED", "REJECTED"],
  EXECUTIVE_SIGNED: ["PARTNER_COUNTERSIGN_PENDING"],
  PARTNER_COUNTERSIGN_PENDING: ["COMPLETED", "REJECTED"],
  COMPLETED: [],
  REJECTED: ["VALIDATION_NOT_STARTED"],
};

/** Sign-off status human-readable labels */
export const SIGNOFF_STATUS_LABELS: Record<SignOffStatus, string> = {
  VALIDATION_NOT_STARTED: "Not Started",
  AREA_VALIDATION_IN_PROGRESS: "Area Validation In Progress",
  AREA_VALIDATION_COMPLETE: "Area Validation Complete",
  TECHNICAL_VALIDATION_IN_PROGRESS: "Technical Validation In Progress",
  TECHNICAL_VALIDATION_COMPLETE: "Technical Validation Complete",
  CROSS_FUNCTIONAL_VALIDATION_IN_PROGRESS: "Cross-Functional Validation In Progress",
  CROSS_FUNCTIONAL_VALIDATION_COMPLETE: "Cross-Functional Validation Complete",
  EXECUTIVE_SIGN_OFF_PENDING: "Executive Sign-Off Pending",
  EXECUTIVE_SIGNED: "Executive Signed",
  PARTNER_COUNTERSIGN_PENDING: "Partner Countersign Pending",
  COMPLETED: "Completed",
  REJECTED: "Rejected",
};

/** Snapshot data structure — captures full assessment state at a point in time */
export interface SnapshotData {
  assessmentId: string;
  companyName: string;
  industry: string;
  country: string;
  status: string;
  scopeSelections: Array<{
    id: string;
    scopeItemId: string;
    selected: boolean;
    relevance: string;
    notes: string | null;
  }>;
  stepResponses: Array<{
    id: string;
    processStepId: string;
    fitStatus: string;
    clientNote: string | null;
    confidence: string | null;
  }>;
  gapResolutions: Array<{
    id: string;
    processStepId: string;
    scopeItemId: string;
    resolutionType: string;
    resolutionDescription: string;
    priority: string | null;
    riskCategory: string | null;
    clientApproved: boolean;
  }>;
  integrationPoints: Array<{
    id: string;
    name: string;
    direction: string;
    sourceSystem: string;
    targetSystem: string;
    interfaceType: string;
    status: string;
  }>;
  dataMigrationObjects: Array<{
    id: string;
    objectName: string;
    objectType: string;
    sourceSystem: string;
    status: string;
  }>;
  statistics: AssessmentStatistics;
}

/** Assessment statistics computed for snapshots */
export interface AssessmentStatistics {
  totalScopeItems: number;
  selectedScopeItems: number;
  totalSteps: number;
  fitCount: number;
  configureCount: number;
  gapCount: number;
  naCount: number;
  pendingCount: number;
  totalGapResolutions: number;
  approvedGapResolutions: number;
  integrationPointCount: number;
  dataMigrationObjectCount: number;
}
