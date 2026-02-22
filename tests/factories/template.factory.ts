import type { AssessmentTemplate } from "@prisma/client";

let counter = 0;
const nextId = () => `test-${++counter}`;

type TemplateOverrides = Partial<AssessmentTemplate>;

function createBase(overrides: TemplateOverrides = {}): AssessmentTemplate {
  const id = overrides.id ?? nextId();
  const now = new Date();
  return {
    id,
    organizationId: overrides.organizationId ?? nextId(),
    name: overrides.name ?? `Assessment Template ${id}`,
    description: overrides.description ?? null,
    industry: overrides.industry ?? null,
    country: overrides.country ?? null,
    scopeItemIds: overrides.scopeItemIds ?? [],
    isDemo: overrides.isDemo ?? false,
    isPublic: overrides.isPublic ?? false,
    createdById: overrides.createdById ?? nextId(),
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
    companySize: overrides.companySize ?? null,
    modules: overrides.modules ?? [],
    geography: overrides.geography ?? null,
    scopeSelections: overrides.scopeSelections ?? null,
    commonGapPatterns: overrides.commonGapPatterns ?? null,
    integrationPatterns: overrides.integrationPatterns ?? null,
    dmPatterns: overrides.dmPatterns ?? null,
    workshopTemplate: overrides.workshopTemplate ?? null,
    roleTemplate: overrides.roleTemplate ?? null,
    sourceAssessmentId: overrides.sourceAssessmentId ?? null,
    isPublished: overrides.isPublished ?? false,
    timesUsed: overrides.timesUsed ?? 0,
  };
}

export function create(overrides: TemplateOverrides = {}): AssessmentTemplate {
  return createBase(overrides);
}

export function createMany(
  count: number,
  overrides: TemplateOverrides = {},
): AssessmentTemplate[] {
  return Array.from({ length: count }, () => createBase(overrides));
}

export function createDemo(overrides: TemplateOverrides = {}): AssessmentTemplate {
  return createBase({
    name: "Demo Assessment Template",
    description: "Pre-configured demo template showcasing platform capabilities",
    industry: "Manufacturing",
    country: "US",
    isDemo: true,
    isPublic: true,
    isPublished: true,
    scopeItemIds: ["J60", "J61", "J62", "J63", "J64"],
    companySize: "MEDIUM",
    modules: ["FI", "CO", "MM", "SD"],
    geography: "North America",
    scopeSelections: {
      J60: { selected: true, relevance: "high", priority: "critical" },
      J61: { selected: true, relevance: "high", priority: "high" },
      J62: { selected: true, relevance: "medium", priority: "medium" },
      J63: { selected: false, relevance: "low", priority: "low" },
      J64: { selected: true, relevance: "high", priority: "high" },
    },
    commonGapPatterns: [
      { pattern: "Custom pricing logic", resolutionType: "EXTEND", frequency: 0.7 },
      { pattern: "Legacy report format", resolutionType: "ADAPT", frequency: 0.5 },
    ],
    integrationPatterns: [
      { name: "CRM Customer Sync", direction: "INBOUND", interfaceType: "API" },
      { name: "Financial Postings Export", direction: "OUTBOUND", interfaceType: "ODATA" },
    ],
    dmPatterns: [
      { objectType: "MASTER_DATA", objectName: "Customer Master", priority: "critical" },
      { objectType: "MASTER_DATA", objectName: "Vendor Master", priority: "critical" },
    ],
    timesUsed: 15,
    ...overrides,
  });
}

export function createPublished(overrides: TemplateOverrides = {}): AssessmentTemplate {
  const sourceAssessmentId = nextId();
  return createBase({
    name: "Published Industry Template",
    description: "Industry-specific template derived from successful implementation",
    industry: "Retail",
    country: "US",
    isDemo: false,
    isPublic: false,
    isPublished: true,
    sourceAssessmentId,
    scopeItemIds: ["J60", "J61", "J65", "J66", "J70"],
    companySize: "LARGE",
    modules: ["FI", "CO", "MM", "SD", "PP", "QM"],
    geography: "Global",
    scopeSelections: {
      J60: { selected: true, relevance: "high" },
      J61: { selected: true, relevance: "high" },
      J65: { selected: true, relevance: "medium" },
      J66: { selected: true, relevance: "high" },
      J70: { selected: true, relevance: "medium" },
    },
    workshopTemplate: {
      sessions: [
        { title: "Scope Review", duration: 120, focusAreas: ["Finance", "Supply Chain"] },
        { title: "Gap Analysis Workshop", duration: 180, focusAreas: ["All"] },
      ],
    },
    roleTemplate: {
      requiredRoles: [
        { role: "consultant", count: 2 },
        { role: "process_owner", count: 3 },
        { role: "it_lead", count: 1 },
      ],
    },
    timesUsed: 8,
    ...overrides,
  });
}
