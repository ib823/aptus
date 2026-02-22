import type { ChangeRequest } from "@prisma/client";

let counter = 0;
const nextId = () => `test-${++counter}`;

type ChangeRequestOverrides = Partial<ChangeRequest>;

function createBase(overrides: ChangeRequestOverrides = {}): ChangeRequest {
  const id = overrides.id ?? nextId();
  const now = new Date();
  return {
    id,
    assessmentId: overrides.assessmentId ?? nextId(),
    requestedById: overrides.requestedById ?? nextId(),
    title: overrides.title ?? `Change Request ${id}`,
    reason: overrides.reason ?? `Reason for change request ${id}`,
    impactSummary: overrides.impactSummary ?? {
      affectedAreas: ["Finance", "Supply Chain"],
      riskLevel: "medium",
      estimatedEffort: "5 days",
    },
    status: overrides.status ?? "REQUESTED",
    approvedById: overrides.approvedById ?? null,
    approvedAt: overrides.approvedAt ?? null,
    rejectedReason: overrides.rejectedReason ?? null,
    changes: overrides.changes ?? null,
    unlockedEntities: overrides.unlockedEntities ?? {
      scopeSelections: [],
      stepResponses: [],
      gapResolutions: [],
    },
    previousSnapshotId: overrides.previousSnapshotId ?? nextId(),
    newSnapshotId: overrides.newSnapshotId ?? null,
    expeditedSignOff: overrides.expeditedSignOff ?? true,
    signOffCompleted: overrides.signOffCompleted ?? false,
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
  };
}

export function create(overrides: ChangeRequestOverrides = {}): ChangeRequest {
  return createBase(overrides);
}

export function createMany(
  count: number,
  overrides: ChangeRequestOverrides = {},
): ChangeRequest[] {
  return Array.from({ length: count }, () => createBase(overrides));
}

export function createApproved(overrides: ChangeRequestOverrides = {}): ChangeRequest {
  const now = new Date();
  const approverId = nextId();
  const newSnapshotId = nextId();
  return createBase({
    status: "APPROVED",
    approvedById: approverId,
    approvedAt: now,
    newSnapshotId,
    changes: {
      scopeChanges: [
        { scopeItemId: "J60", field: "selected", from: false, to: true },
      ],
      gapChanges: [],
      integrationChanges: [],
    },
    unlockedEntities: {
      scopeSelections: ["J60"],
      stepResponses: [],
      gapResolutions: [],
    },
    ...overrides,
  });
}

export function createRejected(overrides: ChangeRequestOverrides = {}): ChangeRequest {
  const now = new Date();
  return createBase({
    status: "REJECTED",
    approvedById: null,
    approvedAt: null,
    rejectedReason: "Change request does not align with project timeline and budget constraints",
    newSnapshotId: null,
    changes: null,
    unlockedEntities: {
      scopeSelections: [],
      stepResponses: [],
      gapResolutions: [],
    },
    createdAt: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
    updatedAt: now,
    ...overrides,
  });
}

export function createInProgress(overrides: ChangeRequestOverrides = {}): ChangeRequest {
  const now = new Date();
  const approverId = nextId();
  return createBase({
    status: "IN_PROGRESS",
    approvedById: approverId,
    approvedAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
    newSnapshotId: null,
    changes: {
      scopeChanges: [
        { scopeItemId: "J60", field: "selected", from: false, to: true },
        { scopeItemId: "J61", field: "relevance", from: "low", to: "high" },
      ],
      gapChanges: [
        { gapId: "gap-1", field: "resolutionType", from: "ACCEPT", to: "CONFIGURE" },
      ],
      integrationChanges: [],
    },
    unlockedEntities: {
      scopeSelections: ["J60", "J61"],
      stepResponses: ["step-1", "step-2", "step-3"],
      gapResolutions: ["gap-1"],
    },
    expeditedSignOff: false,
    signOffCompleted: false,
    ...overrides,
  });
}
