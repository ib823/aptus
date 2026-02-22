import type { GapResolution, GapAlternative } from "@prisma/client";

let counter = 0;
const nextId = () => `test-${++counter}`;

type GapOverrides = Partial<GapResolution>;

const RESOLUTION_TYPES = [
  "EXTEND",
  "CONFIGURE",
  "ADAPT",
  "WORKAROUND",
  "PHASE_2",
  "ACCEPT",
  "BTP_SERVICE",
] as const;

type ResolutionType = (typeof RESOLUTION_TYPES)[number];

function createBase(overrides: GapOverrides = {}): GapResolution {
  const id = overrides.id ?? nextId();
  const now = new Date();
  return {
    id,
    assessmentId: overrides.assessmentId ?? nextId(),
    processStepId: overrides.processStepId ?? nextId(),
    scopeItemId: overrides.scopeItemId ?? `J${Math.floor(Math.random() * 99) + 1}`,
    gapDescription: overrides.gapDescription ?? `Gap description for ${id}`,
    resolutionType: overrides.resolutionType ?? "CONFIGURE",
    resolutionDescription: overrides.resolutionDescription ?? `Resolution description for ${id}`,
    effortDays: overrides.effortDays ?? null,
    costEstimate: overrides.costEstimate ?? null,
    riskLevel: overrides.riskLevel ?? null,
    upgradeImpact: overrides.upgradeImpact ?? null,
    decidedBy: overrides.decidedBy ?? null,
    decidedAt: overrides.decidedAt ?? null,
    clientApproved: overrides.clientApproved ?? false,
    rationale: overrides.rationale ?? null,
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
    priority: overrides.priority ?? null,
    oneTimeCost: overrides.oneTimeCost ?? null,
    recurringCost: overrides.recurringCost ?? null,
    costCurrency: overrides.costCurrency ?? "USD",
    implementationDays: overrides.implementationDays ?? null,
    riskCategory: overrides.riskCategory ?? null,
    upgradeStrategy: overrides.upgradeStrategy ?? null,
    clientApprovalNote: overrides.clientApprovalNote ?? null,
    clientApprovedBy: overrides.clientApprovedBy ?? null,
    clientApprovedAt: overrides.clientApprovedAt ?? null,
    extensibilityPatternId: overrides.extensibilityPatternId ?? null,
    adaptationPatternId: overrides.adaptationPatternId ?? null,
  };
}

export function create(overrides: GapOverrides = {}): GapResolution {
  return createBase(overrides);
}

export function createMany(count: number, overrides: GapOverrides = {}): GapResolution[] {
  return Array.from({ length: count }, () => createBase(overrides));
}

export function createResolved(overrides: GapOverrides = {}): GapResolution {
  const now = new Date();
  const decidedBy = nextId();
  return createBase({
    resolutionType: "CONFIGURE",
    effortDays: 5,
    costEstimate: { labor: 5000, license: 0 },
    riskLevel: "LOW",
    priority: "medium",
    oneTimeCost: 5000,
    recurringCost: 0,
    implementationDays: 5,
    riskCategory: "low",
    decidedBy,
    decidedAt: now,
    clientApproved: true,
    clientApprovedBy: nextId(),
    clientApprovedAt: now,
    clientApprovalNote: "Approved by client sponsor",
    rationale: "Standard configuration covers this requirement",
    upgradeStrategy: "Compatible with standard upgrade path",
    ...overrides,
  });
}

export function createUnresolved(overrides: GapOverrides = {}): GapResolution {
  return createBase({
    resolutionType: "EXTEND",
    effortDays: null,
    costEstimate: null,
    riskLevel: null,
    priority: null,
    decidedBy: null,
    decidedAt: null,
    clientApproved: false,
    rationale: null,
    ...overrides,
  });
}

export function createHighRisk(overrides: GapOverrides = {}): GapResolution {
  return createBase({
    resolutionType: "EXTEND",
    gapDescription: "Critical business process not supported by standard S/4HANA",
    resolutionDescription: "Custom ABAP development with BAdI implementation required",
    effortDays: 30,
    costEstimate: { labor: 60000, license: 15000 },
    riskLevel: "HIGH",
    priority: "critical",
    oneTimeCost: 75000,
    recurringCost: 12000,
    implementationDays: 30,
    riskCategory: "high",
    upgradeImpact: "Custom code may require modification during SAP upgrades",
    upgradeStrategy: "Requires upgrade impact analysis and regression testing",
    ...overrides,
  });
}

export function createWithAlternatives(
  overrides: GapOverrides = {},
): { gap: GapResolution; alternatives: GapAlternative[] } {
  const gap = createBase({
    resolutionType: "EXTEND",
    gapDescription: "Process requires custom handling not available in standard",
    effortDays: 20,
    riskLevel: "MEDIUM",
    priority: "high",
    oneTimeCost: 40000,
    recurringCost: 5000,
    ...overrides,
  });

  const now = new Date();
  const alternatives: GapAlternative[] = [
    {
      id: nextId(),
      gapResolutionId: gap.id,
      label: "BTP Extension",
      resolutionType: "BTP_SERVICE",
      resolutionDescription: "Implement as a BTP side-by-side extension using CAP framework",
      oneTimeCost: 35000,
      recurringCost: 8000,
      costCurrency: "USD",
      implementationDays: 15,
      riskLevel: "LOW",
      riskCategory: "low",
      upgradeStrategy: "Decoupled from core; upgrade safe",
      rationale: "Modern approach with better maintainability",
      pros: ["Upgrade safe", "Cloud native", "Extensible"],
      cons: ["Higher recurring cost", "Requires BTP subscription"],
      createdBy: nextId(),
      createdAt: now,
      updatedAt: now,
    },
    {
      id: nextId(),
      gapResolutionId: gap.id,
      label: "Workaround via Configuration",
      resolutionType: "WORKAROUND",
      resolutionDescription: "Use existing configuration options with manual process adjustments",
      oneTimeCost: 5000,
      recurringCost: 0,
      costCurrency: "USD",
      implementationDays: 3,
      riskLevel: "LOW",
      riskCategory: "low",
      upgradeStrategy: "Fully compatible",
      rationale: "Lowest cost option with acceptable trade-offs",
      pros: ["Low cost", "Quick implementation", "No custom code"],
      cons: ["Manual steps required", "May not scale well"],
      createdBy: nextId(),
      createdAt: now,
      updatedAt: now,
    },
    {
      id: nextId(),
      gapResolutionId: gap.id,
      label: "Phase 2 Deferral",
      resolutionType: "PHASE_2",
      resolutionDescription: "Defer to Phase 2 after initial go-live stabilization",
      oneTimeCost: null,
      recurringCost: null,
      costCurrency: "USD",
      implementationDays: null,
      riskLevel: "MEDIUM",
      riskCategory: "medium",
      upgradeStrategy: null,
      rationale: "Focus on core processes first; revisit post-stabilization",
      pros: ["Reduces Phase 1 risk", "More time for evaluation"],
      cons: ["Delayed business value", "Temporary manual workaround needed"],
      createdBy: nextId(),
      createdAt: now,
      updatedAt: now,
    },
  ];

  return { gap, alternatives };
}

export { RESOLUTION_TYPES };
export type { ResolutionType };
