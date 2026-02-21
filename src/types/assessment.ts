/** Assessment data types */

/** V1 status type -- kept for backward compatibility */
export type AssessmentStatus =
  | "draft"
  | "in_progress"
  | "completed"
  | "reviewed"
  | "signed_off";

/** V2 expanded 10-status lifecycle (Phase 18) */
export type AssessmentStatusV2 =
  | "draft"
  | "scoping"
  | "in_progress"
  | "workshop_active"
  | "review_cycle"
  | "gap_resolution"
  | "pending_validation"
  | "validated"
  | "pending_sign_off"
  | "signed_off"
  | "handed_off"
  | "archived";

/** Phase 18: Assessment phases for progress tracking */
export type AssessmentPhase =
  | "scoping"
  | "process_review"
  | "gap_resolution"
  | "integration"
  | "data_migration"
  | "ocm"
  | "validation"
  | "sign_off";

/** Phase 18: Phase progress status */
export type PhaseStatus = "not_started" | "in_progress" | "completed" | "blocked";

/** Phase 18: Workshop session status */
export type WorkshopSessionStatus = "scheduled" | "in_progress" | "completed" | "cancelled";

/** Phase 17: Organization type */
export type OrgType = "partner" | "client" | "platform";

/** Phase 17: 11-role system (replaces the old 5-role model) */
export type UserRole =
  | "platform_admin"
  | "partner_lead"
  | "consultant"
  | "project_manager"
  | "solution_architect"
  | "process_owner"
  | "it_lead"
  | "data_migration_lead"
  | "executive_sponsor"
  | "viewer"
  | "client_admin";

/**
 * Legacy role type -- for backward compatibility references.
 * The old 5 roles mapped to new ones:
 *   admin -> platform_admin
 *   executive -> executive_sponsor
 *   consultant -> consultant (unchanged)
 *   process_owner -> process_owner (unchanged)
 *   it_lead -> it_lead (unchanged)
 */
export type LegacyUserRole = "admin" | "executive" | "consultant" | "process_owner" | "it_lead";

/** Phase 17: Human-readable role labels */
export const ROLE_LABELS: Record<UserRole, string> = {
  platform_admin: "Platform Admin",
  partner_lead: "Partner Lead",
  consultant: "Consultant",
  project_manager: "Project Manager",
  solution_architect: "Solution Architect",
  process_owner: "Process Owner",
  it_lead: "IT Lead",
  data_migration_lead: "Data Migration Lead",
  executive_sponsor: "Executive Sponsor",
  viewer: "Viewer",
  client_admin: "Client Admin",
};

/** Phase 17: Role hierarchy -- higher number = higher authority */
export const ROLE_HIERARCHY: Record<UserRole, number> = {
  platform_admin: 100,
  partner_lead: 90,
  consultant: 80,
  solution_architect: 75,
  project_manager: 70,
  client_admin: 65,
  process_owner: 60,
  it_lead: 55,
  data_migration_lead: 50,
  executive_sponsor: 45,
  viewer: 10,
};

export type FitStatus = "FIT" | "CONFIGURE" | "GAP" | "NA" | "PENDING";

export type Relevance = "YES" | "NO" | "MAYBE";

export type CurrentState = "MANUAL" | "SYSTEM" | "OUTSOURCED" | "NA";

export type CompanySize = "small" | "midsize" | "large" | "enterprise";

export type ResolutionType =
  | "FIT"
  | "CONFIGURE"
  | "KEY_USER_EXT"
  | "BTP_EXT"
  | "ISV"
  | "CUSTOM_ABAP"
  | "ADAPT_PROCESS"
  | "OUT_OF_SCOPE";

export type MfaMethod = "none" | "totp" | "webauthn";

// Phase 10: Company Profile
export type DeploymentModel = "public_cloud" | "private_cloud" | "hybrid";
export type MigrationApproach = "greenfield" | "brownfield" | "selective";

export interface ProfileCompletenessBreakdown {
  basic: boolean;
  financial: boolean;
  sapStrategy: boolean;
  operational: boolean;
  itLandscape: boolean;
}

export const PROFILE_COMPLETENESS_GATE = 60;

// Phase 12: Step Classification
export type StepCategory =
  | "BUSINESS_PROCESS"
  | "CONFIGURATION"
  | "REPORTING"
  | "MASTER_DATA"
  | "REFERENCE"
  | "SYSTEM_ACCESS"
  | "TEST_INFO";

// Phase 13: Gap Resolution V2
export type GapPriority = "critical" | "high" | "medium" | "low";
export type RiskCategory = "technical" | "business" | "compliance" | "integration";
export type UpgradeStrategy = "standard_upgrade" | "needs_revalidation" | "custom_maintenance";

export interface CostRollup {
  totalOneTimeCost: number;
  totalRecurringCost: number;
  totalImplementationDays: number;
  byResolutionType: Record<string, { oneTime: number; recurring: number; days: number }>;
  byRiskCategory: Record<string, { oneTime: number; recurring: number; count: number }>;
  byPriority: Record<string, { oneTime: number; recurring: number; count: number }>;
}

// Phase 14: Integration Register
export type IntegrationDirection = "INBOUND" | "OUTBOUND" | "BIDIRECTIONAL";
export type InterfaceType = "API" | "IDOC" | "FILE" | "RFC" | "ODATA" | "EVENT";
export type IntegrationFrequency = "REAL_TIME" | "NEAR_REAL_TIME" | "BATCH_DAILY" | "BATCH_WEEKLY" | "ON_DEMAND";
export type IntegrationMiddleware = "SAP_CPI" | "SAP_PO" | "MULESOFT" | "BOOMI" | "AZURE_INTEGRATION" | "OTHER";
export type IntegrationComplexity = "LOW" | "MEDIUM" | "HIGH" | "VERY_HIGH";
export type IntegrationStatus = "identified" | "analyzed" | "designed" | "approved";

// Phase 15: Data Migration Register
export type DataMigrationObjectType = "MASTER_DATA" | "TRANSACTION_DATA" | "CONFIG_DATA" | "HISTORICAL" | "REFERENCE";
export type SourceFormat = "SAP_TABLE" | "CSV" | "EXCEL" | "XML" | "DATABASE" | "API";
export type VolumeEstimate = "SMALL" | "MEDIUM" | "LARGE" | "VERY_LARGE";
export type MappingComplexity = "SIMPLE" | "MODERATE" | "COMPLEX" | "VERY_COMPLEX";
export type DataMigrationApproach = "AUTOMATED" | "SEMI_AUTOMATED" | "MANUAL" | "HYBRID";
export type DataMigrationTool = "LTMC" | "LSMW" | "BODS" | "CPI" | "CUSTOM";
export type DataMigrationStatus = "identified" | "mapped" | "cleansed" | "validated" | "approved";

// Phase 16: OCM Impact Register
export type OcmChangeType = "PROCESS_CHANGE" | "ROLE_CHANGE" | "TECHNOLOGY_CHANGE" | "ORGANIZATIONAL" | "BEHAVIORAL";
export type OcmSeverity = "LOW" | "MEDIUM" | "HIGH" | "TRANSFORMATIONAL";
export type TrainingType = "INSTRUCTOR_LED" | "E_LEARNING" | "ON_THE_JOB" | "WORKSHOP";
export type ResistanceRisk = "LOW" | "MEDIUM" | "HIGH";
export type OcmStatus = "identified" | "assessed" | "planned" | "approved";

export type DecisionAction =
  | "MARKED_FIT"
  | "MARKED_GAP"
  | "RESOLUTION_SELECTED"
  | "RESOLUTION_CHANGED"
  | "SCOPE_INCLUDED"
  | "SCOPE_EXCLUDED"
  | "NOTE_ADDED"
  | "APPROVED"
  | "SIGNED_OFF"
  | "STAKEHOLDER_ADDED"
  | "STAKEHOLDER_REMOVED"
  | "MFA_ENROLLED"
  | "SESSION_REVOKED"
  | "PERMISSION_OVERRIDE"
  | "REMAINING_ITEM_ADDED"
  | "FLOW_DIAGRAM_GENERATED"
  | "CONFIG_INCLUDED"
  | "CONFIG_EXCLUDED"
  | "GAP_APPROVAL_ADDED"
  | "GAP_ALTERNATIVE_ADDED"
  | "PROFILE_UPDATED"
  | "INTEGRATION_CREATED"
  | "INTEGRATION_UPDATED"
  | "INTEGRATION_DELETED"
  | "DATA_MIGRATION_CREATED"
  | "DATA_MIGRATION_UPDATED"
  | "DATA_MIGRATION_DELETED"
  | "OCM_CREATED"
  | "OCM_UPDATED"
  | "OCM_DELETED"
  | "ROLE_CHANGED"
  | "USER_INVITED"
  | "USER_DEACTIVATED"
  | "ORG_UPDATED"
  | "STATUS_TRANSITIONED"
  | "PHASE_UPDATED"
  | "WORKSHOP_CREATED"
  | "WORKSHOP_STARTED"
  | "WORKSHOP_COMPLETED"
  | "CONVERSATION_STARTED"
  | "CONVERSATION_COMPLETED"
  | "CONVERSATION_CLASSIFICATION_APPLIED"
  | "DASHBOARD_WIDGET_UPDATED"
  | "DEADLINE_CREATED"
  | "DEADLINE_UPDATED"
  | "ONBOARDING_STARTED"
  | "ONBOARDING_COMPLETED"
  | "REPORT_GENERATED"
  | "REPORT_BRANDING_UPDATED"
  | "SUBSCRIPTION_UPGRADED"
  | "SUBSCRIPTION_CANCELED"
  | "DEMO_PROVISIONED";

export interface AssessmentSummary {
  id: string;
  companyName: string;
  industry: string;
  country: string;
  companySize: string;
  status: AssessmentStatus;
  createdBy: string;
  organizationId: string;
  createdAt: string;
  updatedAt: string;
}

export interface StakeholderInfo {
  id: string;
  assessmentId: string;
  userId: string;
  name: string;
  email: string;
  role: UserRole;
  assignedAreas: string[];
  canEdit: boolean;
  lastActiveAt: string | null;
  invitedAt: string;
  acceptedAt: string | null;
}

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  organizationId: string | null;
  mfaEnabled: boolean;
  mfaVerified: boolean;
  totpVerified: boolean;
}

/** V1 status transition rules -- kept for backward compatibility */
export const VALID_STATUS_TRANSITIONS: Record<AssessmentStatus, AssessmentStatus[]> = {
  draft: ["in_progress"],
  in_progress: ["completed"],
  completed: ["reviewed"],
  reviewed: ["signed_off"],
  signed_off: [],
};

/** V1 role-based transition permissions -- kept for backward compatibility */
export const STATUS_TRANSITION_ROLES: Record<string, UserRole[]> = {
  "draft->in_progress": ["consultant", "platform_admin"],
  "in_progress->completed": ["consultant", "platform_admin"],
  "completed->reviewed": ["consultant", "platform_admin"],
  "reviewed->signed_off": ["consultant", "platform_admin", "executive_sponsor"],
};

/** All 8 assessment phases (Phase 18) */
export const ASSESSMENT_PHASES: AssessmentPhase[] = [
  "scoping",
  "process_review",
  "gap_resolution",
  "integration",
  "data_migration",
  "ocm",
  "validation",
  "sign_off",
];
