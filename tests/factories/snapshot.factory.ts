import type { AssessmentSnapshot } from "@prisma/client";
import { createHash } from "crypto";

let counter = 0;
const nextId = () => `test-${++counter}`;

type SnapshotOverrides = Partial<AssessmentSnapshot>;

function computeHash(data: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(data))
    .digest("hex");
}

function createBase(overrides: SnapshotOverrides = {}): AssessmentSnapshot {
  const id = overrides.id ?? nextId();
  const now = new Date();
  const snapshotData = overrides.snapshotData ?? {
    assessment: {
      id: nextId(),
      companyName: "Test Company",
      status: "pending_sign_off",
    },
    scopeSelections: [],
    stepResponses: [],
    gapResolutions: [],
    integrationPoints: [],
    dataMigrationObjects: [],
    ocmImpacts: [],
  };

  return {
    id,
    assessmentId: overrides.assessmentId ?? nextId(),
    version: overrides.version ?? 1,
    label: overrides.label ?? null,
    snapshotData,
    dataHash: overrides.dataHash ?? computeHash(snapshotData),
    createdById: overrides.createdById ?? nextId(),
    reason: overrides.reason ?? "Snapshot created for testing",
    createdAt: overrides.createdAt ?? now,
  };
}

export function create(overrides: SnapshotOverrides = {}): AssessmentSnapshot {
  return createBase(overrides);
}

export function createMany(
  count: number,
  overrides: SnapshotOverrides = {},
): AssessmentSnapshot[] {
  const assessmentId = overrides.assessmentId ?? nextId();
  return Array.from({ length: count }, (_, i) =>
    createBase({
      assessmentId,
      version: i + 1,
      label: `Version ${i + 1}`,
      ...overrides,
    }),
  );
}

export function createWithHash(
  data: Record<string, unknown>,
  overrides: SnapshotOverrides = {},
): AssessmentSnapshot {
  const snapshotData = data as AssessmentSnapshot["snapshotData"];
  const dataHash = computeHash(snapshotData);
  return createBase({
    snapshotData,
    dataHash,
    ...overrides,
  });
}

export function createForSignOff(overrides: SnapshotOverrides = {}): AssessmentSnapshot {
  const assessmentId = overrides.assessmentId ?? nextId();
  const snapshotData = {
    assessment: {
      id: assessmentId,
      companyName: "Sign-Off Ready Corp",
      industry: "Manufacturing",
      country: "US",
      status: "pending_sign_off",
    },
    scopeSelections: [
      { scopeItemId: "J60", selected: true, relevance: "high" },
      { scopeItemId: "J61", selected: true, relevance: "high" },
      { scopeItemId: "J62", selected: false, relevance: "low" },
    ],
    stepResponses: [
      { processStepId: "step-1", fitStatus: "FIT" },
      { processStepId: "step-2", fitStatus: "CONFIGURE" },
      { processStepId: "step-3", fitStatus: "GAP" },
    ],
    gapResolutions: [
      {
        id: "gap-1",
        resolutionType: "CONFIGURE",
        clientApproved: true,
        riskLevel: "LOW",
      },
    ],
    integrationPoints: [
      {
        id: "int-1",
        name: "CRM Integration",
        direction: "INBOUND",
        status: "approved",
      },
    ],
    dataMigrationObjects: [
      {
        id: "dm-1",
        objectName: "Customer Master",
        objectType: "MASTER_DATA",
        status: "validated",
      },
    ],
    ocmImpacts: [
      {
        id: "ocm-1",
        severity: "MEDIUM",
        status: "planned",
        trainingRequired: true,
      },
    ],
    summary: {
      totalScopeItems: 3,
      selectedScopeItems: 2,
      totalSteps: 3,
      fitCount: 1,
      configureCount: 1,
      gapCount: 1,
      resolvedGaps: 1,
      integrationCount: 1,
      migrationObjectCount: 1,
      ocmImpactCount: 1,
    },
  };

  return createBase({
    assessmentId,
    label: "Sign-Off Snapshot",
    reason: "Snapshot captured for formal sign-off process",
    snapshotData: snapshotData as unknown as AssessmentSnapshot["snapshotData"],
    ...overrides,
  });
}
