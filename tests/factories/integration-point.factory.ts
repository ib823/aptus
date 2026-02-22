import type { IntegrationPoint } from "@prisma/client";

let counter = 0;
const nextId = () => `test-${++counter}`;

type IntegrationPointOverrides = Partial<IntegrationPoint>;

const DIRECTIONS = ["INBOUND", "OUTBOUND", "BIDIRECTIONAL"] as const;
const COMPLEXITIES = ["LOW", "MEDIUM", "HIGH", "VERY_HIGH"] as const;

type Direction = (typeof DIRECTIONS)[number];
type Complexity = (typeof COMPLEXITIES)[number];

function createBase(overrides: IntegrationPointOverrides = {}): IntegrationPoint {
  const id = overrides.id ?? nextId();
  const now = new Date();
  return {
    id,
    assessmentId: overrides.assessmentId ?? nextId(),
    scopeItemId: overrides.scopeItemId ?? null,
    name: overrides.name ?? `Integration Point ${id}`,
    description: overrides.description ?? `Description for integration point ${id}`,
    direction: overrides.direction ?? "INBOUND",
    sourceSystem: overrides.sourceSystem ?? "Legacy ERP",
    targetSystem: overrides.targetSystem ?? "S/4HANA Cloud",
    interfaceType: overrides.interfaceType ?? "API",
    frequency: overrides.frequency ?? "REAL_TIME",
    middleware: overrides.middleware ?? null,
    dataVolume: overrides.dataVolume ?? null,
    complexity: overrides.complexity ?? null,
    priority: overrides.priority ?? null,
    status: overrides.status ?? "identified",
    technicalNotes: overrides.technicalNotes ?? null,
    createdBy: overrides.createdBy ?? nextId(),
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
  };
}

export function create(overrides: IntegrationPointOverrides = {}): IntegrationPoint {
  return createBase(overrides);
}

export function createMany(
  count: number,
  overrides: IntegrationPointOverrides = {},
): IntegrationPoint[] {
  return Array.from({ length: count }, () => createBase(overrides));
}

export function createByDirection(
  direction: Direction,
  overrides: IntegrationPointOverrides = {},
): IntegrationPoint {
  const directionDefaults: Record<Direction, Partial<IntegrationPoint>> = {
    INBOUND: {
      direction: "INBOUND",
      sourceSystem: "External CRM",
      targetSystem: "S/4HANA Cloud",
      name: "Customer Master Data Inbound",
      description: "Inbound customer master data synchronization from CRM system",
      interfaceType: "IDOC",
      frequency: "NEAR_REAL_TIME",
    },
    OUTBOUND: {
      direction: "OUTBOUND",
      sourceSystem: "S/4HANA Cloud",
      targetSystem: "Data Warehouse",
      name: "Financial Postings Outbound",
      description: "Outbound financial posting data for reporting and analytics",
      interfaceType: "ODATA",
      frequency: "BATCH_DAILY",
    },
    BIDIRECTIONAL: {
      direction: "BIDIRECTIONAL",
      sourceSystem: "S/4HANA Cloud",
      targetSystem: "SAP CPI / Third-party",
      name: "Purchase Order Bidirectional Sync",
      description: "Bidirectional purchase order synchronization with supplier portal",
      interfaceType: "API",
      frequency: "REAL_TIME",
      middleware: "SAP_CPI",
    },
  };

  return createBase({
    ...directionDefaults[direction],
    ...overrides,
  });
}

export function createByComplexity(
  complexity: Complexity,
  overrides: IntegrationPointOverrides = {},
): IntegrationPoint {
  const complexityDefaults: Record<Complexity, Partial<IntegrationPoint>> = {
    LOW: {
      complexity: "LOW",
      name: "Simple File Import",
      description: "Basic flat file import with direct field mapping",
      interfaceType: "FILE",
      frequency: "BATCH_DAILY",
      middleware: null,
      priority: "low",
    },
    MEDIUM: {
      complexity: "MEDIUM",
      name: "API-Based Data Exchange",
      description: "REST API integration with moderate transformation logic",
      interfaceType: "API",
      frequency: "NEAR_REAL_TIME",
      middleware: "SAP_CPI",
      priority: "medium",
    },
    HIGH: {
      complexity: "HIGH",
      name: "Complex Event-Driven Integration",
      description: "Event-driven integration with complex mapping, error handling, and retry logic",
      interfaceType: "EVENT",
      frequency: "REAL_TIME",
      middleware: "SAP_CPI",
      priority: "high",
    },
    VERY_HIGH: {
      complexity: "VERY_HIGH",
      name: "Multi-System Orchestration",
      description:
        "Complex orchestration across multiple systems with custom transformation, " +
        "compensation logic, and cross-system transaction management",
      interfaceType: "API",
      frequency: "REAL_TIME",
      middleware: "MULESOFT",
      priority: "critical",
    },
  };

  return createBase({
    ...complexityDefaults[complexity],
    ...overrides,
  });
}

export { DIRECTIONS, COMPLEXITIES };
export type { Direction, Complexity };
