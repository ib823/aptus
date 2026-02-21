/** Phase 31: Lifecycle Continuity types */

// Change request statuses
export type ChangeRequestStatus =
  | "REQUESTED"
  | "APPROVED"
  | "REJECTED"
  | "IN_PROGRESS"
  | "COMPLETED";

// Reassessment trigger types
export type ReassessmentTriggerType =
  | "SAP_UPDATE"
  | "REGULATORY_CHANGE"
  | "ORG_CHANGE"
  | "SCOPE_DRIFT"
  | "MANUAL";

// Trigger statuses
export type TriggerStatus =
  | "OPEN"
  | "ACKNOWLEDGED"
  | "IN_PROGRESS"
  | "RESOLVED"
  | "DISMISSED";

/** Configuration for carrying forward data between assessment phases */
export interface CarryForwardConfig {
  includeScope: boolean;
  includeStepResponses: boolean;
  includeGapResolutions: boolean;
  includeIntegrations: boolean;
  includeDataMigration: boolean;
  includeOcm: boolean;
  includeStakeholders: boolean;
  resetStatus: boolean;
}

/** Default carry-forward configuration */
export const DEFAULT_CARRY_FORWARD_CONFIG: CarryForwardConfig = {
  includeScope: true,
  includeStepResponses: true,
  includeGapResolutions: true,
  includeIntegrations: true,
  includeDataMigration: true,
  includeOcm: true,
  includeStakeholders: true,
  resetStatus: true,
};

/** Options for cloning an assessment */
export interface CloneAssessmentOptions {
  sourceAssessmentId: string;
  snapshotVersion: number;
  newCompanyName?: string | undefined;
  carryForwardConfig?: CarryForwardConfig | undefined;
  reason: string;
}

/** Entity unlocked for editing via change request */
export interface UnlockedEntity {
  entityType: "scope_selection" | "step_response" | "gap_resolution" | "integration" | "data_migration" | "ocm";
  entityId: string;
  scopeItemId?: string | undefined;
  functionalArea?: string | undefined;
  reason: string;
}

/** Impact summary for a change request */
export interface ImpactSummary {
  totalEntitiesAffected: number;
  scopeChanges: number;
  classificationChanges: number;
  gapResolutionChanges: number;
  integrationChanges: number;
  riskLevel: "low" | "medium" | "high" | "critical";
  estimatedReworkDays: number;
  affectedFunctionalAreas: string[];
}

/** Delta report comparing two snapshots */
export interface DeltaReport {
  baseVersion: number;
  compareVersion: number;
  computedAt: string;
  scopeChanges: ScopeChange[];
  classificationChanges: ClassificationChange[];
  gapResolutionChanges: GapResolutionChange[];
  integrationChanges: IntegrationChange[];
  dataMigrationChanges: DataMigrationChange[];
}

/** Summary of a delta report */
export interface DeltaSummary {
  totalChanges: number;
  scopeAdded: number;
  scopeRemoved: number;
  scopeModified: number;
  classificationsChanged: number;
  gapResolutionsAdded: number;
  gapResolutionsRemoved: number;
  gapResolutionsModified: number;
  integrationsAdded: number;
  integrationsRemoved: number;
  integrationsModified: number;
  dataMigrationAdded: number;
  dataMigrationRemoved: number;
  dataMigrationModified: number;
}

export interface ScopeChange {
  scopeItemId: string;
  changeType: "added" | "removed" | "modified";
  previousSelected?: boolean | undefined;
  newSelected?: boolean | undefined;
  previousRelevance?: string | undefined;
  newRelevance?: string | undefined;
}

export interface ClassificationChange {
  processStepId: string;
  changeType: "added" | "removed" | "modified";
  previousFitStatus?: string | undefined;
  newFitStatus?: string | undefined;
  previousConfidence?: string | undefined;
  newConfidence?: string | undefined;
}

export interface GapResolutionChange {
  gapResolutionId: string;
  changeType: "added" | "removed" | "modified";
  previousResolutionType?: string | undefined;
  newResolutionType?: string | undefined;
  previousPriority?: string | undefined;
  newPriority?: string | undefined;
  previousApproved?: boolean | undefined;
  newApproved?: boolean | undefined;
}

export interface IntegrationChange {
  integrationId: string;
  changeType: "added" | "removed" | "modified";
  previousStatus?: string | undefined;
  newStatus?: string | undefined;
  name?: string | undefined;
}

export interface DataMigrationChange {
  dataMigrationId: string;
  changeType: "added" | "removed" | "modified";
  previousStatus?: string | undefined;
  newStatus?: string | undefined;
  objectName?: string | undefined;
}

export interface SignOffChange {
  field: string;
  previousValue: string | null;
  newValue: string | null;
}

export interface CrossPhaseDependency {
  sourcePhase: number;
  targetPhase: number;
  entityType: string;
  entityId: string;
  description: string;
}
