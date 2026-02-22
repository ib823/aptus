import type { OcmImpact } from "@prisma/client";

let counter = 0;
const nextId = () => `test-${++counter}`;

type OcmImpactOverrides = Partial<OcmImpact>;

const SEVERITIES = ["LOW", "MEDIUM", "HIGH", "TRANSFORMATIONAL"] as const;
const CHANGE_TYPES = [
  "PROCESS_CHANGE",
  "ROLE_CHANGE",
  "TECHNOLOGY_CHANGE",
  "ORGANIZATIONAL",
  "BEHAVIORAL",
] as const;

type Severity = (typeof SEVERITIES)[number];
type ChangeType = (typeof CHANGE_TYPES)[number];

function createBase(overrides: OcmImpactOverrides = {}): OcmImpact {
  const id = overrides.id ?? nextId();
  const now = new Date();
  return {
    id,
    assessmentId: overrides.assessmentId ?? nextId(),
    scopeItemId: overrides.scopeItemId ?? null,
    functionalArea: overrides.functionalArea ?? null,
    impactedRole: overrides.impactedRole ?? "End User",
    impactedDepartment: overrides.impactedDepartment ?? null,
    changeType: overrides.changeType ?? "PROCESS_CHANGE",
    severity: overrides.severity ?? "MEDIUM",
    description: overrides.description ?? `OCM impact description for ${id}`,
    trainingRequired: overrides.trainingRequired ?? false,
    trainingType: overrides.trainingType ?? null,
    trainingDuration: overrides.trainingDuration ?? null,
    communicationPlan: overrides.communicationPlan ?? null,
    resistanceRisk: overrides.resistanceRisk ?? null,
    readinessScore: overrides.readinessScore ?? null,
    mitigationStrategy: overrides.mitigationStrategy ?? null,
    priority: overrides.priority ?? null,
    status: overrides.status ?? "identified",
    technicalNotes: overrides.technicalNotes ?? null,
    createdBy: overrides.createdBy ?? nextId(),
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
  };
}

export function create(overrides: OcmImpactOverrides = {}): OcmImpact {
  return createBase(overrides);
}

export function createMany(count: number, overrides: OcmImpactOverrides = {}): OcmImpact[] {
  return Array.from({ length: count }, () => createBase(overrides));
}

export function createBySeverity(
  severity: Severity,
  overrides: OcmImpactOverrides = {},
): OcmImpact {
  const severityDefaults: Record<Severity, Partial<OcmImpact>> = {
    LOW: {
      severity: "LOW",
      changeType: "PROCESS_CHANGE",
      description: "Minor process adjustment with minimal user impact",
      impactedRole: "End User",
      impactedDepartment: "Operations",
      trainingRequired: false,
      resistanceRisk: "LOW",
      readinessScore: 0.9,
      priority: "low",
    },
    MEDIUM: {
      severity: "MEDIUM",
      changeType: "TECHNOLOGY_CHANGE",
      description: "New system interface requiring user adaptation and training",
      impactedRole: "Process Owner",
      impactedDepartment: "Finance",
      trainingRequired: true,
      trainingType: "E_LEARNING",
      trainingDuration: 2,
      resistanceRisk: "MEDIUM",
      readinessScore: 0.6,
      priority: "medium",
      communicationPlan: "Send awareness communications 4 weeks before go-live",
    },
    HIGH: {
      severity: "HIGH",
      changeType: "ROLE_CHANGE",
      description:
        "Significant role redesign requiring new responsibilities and skills development",
      impactedRole: "Department Manager",
      impactedDepartment: "Supply Chain",
      trainingRequired: true,
      trainingType: "INSTRUCTOR_LED",
      trainingDuration: 5,
      resistanceRisk: "HIGH",
      readinessScore: 0.35,
      priority: "high",
      communicationPlan:
        "Executive sponsorship messaging, targeted 1:1 sessions with impacted managers",
      mitigationStrategy:
        "Early engagement workshops, change champion network, phased role transition",
    },
    TRANSFORMATIONAL: {
      severity: "TRANSFORMATIONAL",
      changeType: "ORGANIZATIONAL",
      description:
        "Fundamental organizational restructuring affecting reporting lines, " +
        "job descriptions, and departmental boundaries",
      impactedRole: "All Levels",
      impactedDepartment: "Cross-functional",
      trainingRequired: true,
      trainingType: "WORKSHOP",
      trainingDuration: 10,
      resistanceRisk: "HIGH",
      readinessScore: 0.2,
      priority: "critical",
      communicationPlan:
        "CEO-led town halls, department-specific sessions, weekly updates, " +
        "dedicated intranet portal",
      mitigationStrategy:
        "Dedicated OCM team, external change consultants, pulse surveys, " +
        "resistance management plan, executive coaching",
    },
  };

  return createBase({
    ...severityDefaults[severity],
    ...overrides,
  });
}

export { SEVERITIES, CHANGE_TYPES };
export type { Severity, ChangeType };
