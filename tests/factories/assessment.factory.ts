import type { Assessment } from "@prisma/client";

let counter = 0;
const nextId = () => `test-${++counter}`;

type AssessmentOverrides = Partial<Assessment>;

const VALID_STATUSES = [
  "draft",
  "setup",
  "scope_in_progress",
  "scope_locked",
  "process_review",
  "gap_resolution",
  "integration_assessment",
  "data_migration_assessment",
  "ocm_assessment",
  "validation",
  "pending_sign_off",
  "signed_off",
  "handed_off",
  "reassessment_needed",
] as const;

function createBase(overrides: AssessmentOverrides = {}): Assessment {
  const id = overrides.id ?? nextId();
  const now = new Date();
  return {
    id,
    companyName: overrides.companyName ?? `Test Company ${id}`,
    industry: overrides.industry ?? "Manufacturing",
    country: overrides.country ?? "US",
    operatingCountries: overrides.operatingCountries ?? ["US"],
    companySize: overrides.companySize ?? "MEDIUM",
    revenueBand: overrides.revenueBand ?? "$100M-$500M",
    currentErp: overrides.currentErp ?? "SAP ECC",
    sapVersion: overrides.sapVersion ?? "2508",
    status: overrides.status ?? "draft",
    createdBy: overrides.createdBy ?? nextId(),
    organizationId: overrides.organizationId ?? nextId(),
    deletedAt: overrides.deletedAt ?? null,
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
    employeeCount: overrides.employeeCount ?? null,
    annualRevenue: overrides.annualRevenue ?? null,
    currencyCode: overrides.currencyCode ?? "USD",
    targetGoLiveDate: overrides.targetGoLiveDate ?? null,
    deploymentModel: overrides.deploymentModel ?? null,
    sapModules: overrides.sapModules ?? [],
    keyProcesses: overrides.keyProcesses ?? [],
    languageRequirements: overrides.languageRequirements ?? [],
    regulatoryFrameworks: overrides.regulatoryFrameworks ?? [],
    itLandscapeSummary: overrides.itLandscapeSummary ?? null,
    currentErpVersion: overrides.currentErpVersion ?? null,
    migrationApproach: overrides.migrationApproach ?? null,
    profileCompletedAt: overrides.profileCompletedAt ?? null,
    profileCompletedBy: overrides.profileCompletedBy ?? null,
    parentAssessmentId: overrides.parentAssessmentId ?? null,
    phaseNumber: overrides.phaseNumber ?? 1,
    currentSnapshotId: overrides.currentSnapshotId ?? null,
    clonedFromSnapshotId: overrides.clonedFromSnapshotId ?? null,
    carryForwardConfig: overrides.carryForwardConfig ?? null,
    operationalSites: overrides.operationalSites ?? null,
  };
}

export function create(overrides: AssessmentOverrides = {}): Assessment {
  return createBase(overrides);
}

export function createMany(count: number, overrides: AssessmentOverrides = {}): Assessment[] {
  return Array.from({ length: count }, () => createBase(overrides));
}

export function createAtState(
  state: (typeof VALID_STATUSES)[number],
  overrides: AssessmentOverrides = {},
): Assessment {
  return createBase({
    status: state,
    ...overrides,
  });
}

export function createFullyPopulated(overrides: AssessmentOverrides = {}): Assessment {
  const now = new Date();
  return createBase({
    status: "validation",
    companyName: "Acme Corp",
    industry: "Manufacturing",
    country: "US",
    operatingCountries: ["US", "DE", "JP"],
    companySize: "LARGE",
    revenueBand: "$1B-$5B",
    currentErp: "SAP ECC 6.0",
    currentErpVersion: "EHP8",
    sapVersion: "2508",
    employeeCount: 15000,
    annualRevenue: 2500000000,
    currencyCode: "USD",
    targetGoLiveDate: new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000),
    deploymentModel: "cloud",
    sapModules: ["FI", "CO", "MM", "SD", "PP", "QM", "PM", "HR"],
    keyProcesses: ["Order-to-Cash", "Procure-to-Pay", "Record-to-Report"],
    languageRequirements: ["EN", "DE", "JA"],
    regulatoryFrameworks: ["SOX", "GDPR", "J-SOX"],
    itLandscapeSummary: "Complex multi-system landscape with legacy ECC, CRM, and BW systems",
    migrationApproach: "greenfield",
    profileCompletedAt: now,
    profileCompletedBy: "admin-user",
    ...overrides,
  });
}

export function createReadyForSignOff(overrides: AssessmentOverrides = {}): Assessment {
  return createFullyPopulated({
    status: "pending_sign_off",
    ...overrides,
  });
}

export function createSignedOff(overrides: AssessmentOverrides = {}): Assessment {
  const snapshotId = nextId();
  return createFullyPopulated({
    status: "signed_off",
    currentSnapshotId: snapshotId,
    ...overrides,
  });
}

export function createWithPhase2Clone(overrides: AssessmentOverrides = {}): Assessment {
  const parentId = nextId();
  const snapshotId = nextId();
  return createBase({
    status: "draft",
    parentAssessmentId: parentId,
    phaseNumber: 2,
    clonedFromSnapshotId: snapshotId,
    carryForwardConfig: {
      includeScope: true,
      includeClassifications: true,
      includeGaps: true,
      includeIntegrations: false,
      includeDataMigration: false,
      includeOcm: false,
    },
    ...overrides,
  });
}

export function createWithChangeRequest(overrides: AssessmentOverrides = {}): Assessment {
  const snapshotId = nextId();
  return createBase({
    status: "reassessment_needed",
    currentSnapshotId: snapshotId,
    ...overrides,
  });
}

export { VALID_STATUSES };
