import type { DataMigrationObject } from "@prisma/client";

let counter = 0;
const nextId = () => `test-${++counter}`;

type DataMigrationOverrides = Partial<DataMigrationObject>;

const OBJECT_TYPES = [
  "MASTER_DATA",
  "TRANSACTION_DATA",
  "CONFIG_DATA",
  "HISTORICAL",
  "REFERENCE",
] as const;

const MAPPING_COMPLEXITIES = [
  "SIMPLE",
  "MODERATE",
  "COMPLEX",
  "VERY_COMPLEX",
] as const;

type ObjectType = (typeof OBJECT_TYPES)[number];
type MappingComplexity = (typeof MAPPING_COMPLEXITIES)[number];

function createBase(overrides: DataMigrationOverrides = {}): DataMigrationObject {
  const id = overrides.id ?? nextId();
  const now = new Date();
  return {
    id,
    assessmentId: overrides.assessmentId ?? nextId(),
    scopeItemId: overrides.scopeItemId ?? null,
    objectName: overrides.objectName ?? `Migration Object ${id}`,
    description: overrides.description ?? `Data migration object description for ${id}`,
    objectType: overrides.objectType ?? "MASTER_DATA",
    sourceSystem: overrides.sourceSystem ?? "Legacy ERP",
    sourceFormat: overrides.sourceFormat ?? null,
    volumeEstimate: overrides.volumeEstimate ?? null,
    recordCount: overrides.recordCount ?? null,
    cleansingRequired: overrides.cleansingRequired ?? false,
    cleansingNotes: overrides.cleansingNotes ?? null,
    mappingComplexity: overrides.mappingComplexity ?? null,
    migrationApproach: overrides.migrationApproach ?? null,
    migrationTool: overrides.migrationTool ?? null,
    validationRules: overrides.validationRules ?? null,
    priority: overrides.priority ?? null,
    status: overrides.status ?? "identified",
    dependsOn: overrides.dependsOn ?? [],
    technicalNotes: overrides.technicalNotes ?? null,
    estimatedEffortDays: overrides.estimatedEffortDays ?? null,
    functionalArea: overrides.functionalArea ?? null,
    updatedBy: overrides.updatedBy ?? null,
    createdBy: overrides.createdBy ?? nextId(),
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
  };
}

export function create(overrides: DataMigrationOverrides = {}): DataMigrationObject {
  return createBase(overrides);
}

export function createMany(
  count: number,
  overrides: DataMigrationOverrides = {},
): DataMigrationObject[] {
  return Array.from({ length: count }, () => createBase(overrides));
}

export function createByType(
  objectType: ObjectType,
  overrides: DataMigrationOverrides = {},
): DataMigrationObject {
  const typeDefaults: Record<ObjectType, Partial<DataMigrationObject>> = {
    MASTER_DATA: {
      objectType: "MASTER_DATA",
      objectName: "Customer Master",
      description: "Customer master data including addresses, payment terms, and credit limits",
      sourceFormat: "SAP_TABLE",
      volumeEstimate: "LARGE",
      recordCount: 50000,
      cleansingRequired: true,
      cleansingNotes: "Remove duplicates, standardize address formats",
      mappingComplexity: "MODERATE",
      migrationApproach: "AUTOMATED",
      migrationTool: "LTMC",
      priority: "critical",
    },
    TRANSACTION_DATA: {
      objectType: "TRANSACTION_DATA",
      objectName: "Open Sales Orders",
      description: "Open sales orders to be migrated for continuity",
      sourceFormat: "SAP_TABLE",
      volumeEstimate: "MEDIUM",
      recordCount: 5000,
      cleansingRequired: false,
      mappingComplexity: "COMPLEX",
      migrationApproach: "SEMI_AUTOMATED",
      migrationTool: "LTMC",
      priority: "high",
    },
    CONFIG_DATA: {
      objectType: "CONFIG_DATA",
      objectName: "Chart of Accounts",
      description: "Chart of accounts and G/L account master data",
      sourceFormat: "EXCEL",
      volumeEstimate: "SMALL",
      recordCount: 2000,
      cleansingRequired: true,
      cleansingNotes: "Align with new S/4HANA account structure",
      mappingComplexity: "COMPLEX",
      migrationApproach: "MANUAL",
      migrationTool: "LTMC",
      priority: "critical",
    },
    HISTORICAL: {
      objectType: "HISTORICAL",
      objectName: "Historical Financial Postings",
      description: "Three years of historical financial postings for reporting",
      sourceFormat: "DATABASE",
      volumeEstimate: "VERY_LARGE",
      recordCount: 5000000,
      cleansingRequired: false,
      mappingComplexity: "SIMPLE",
      migrationApproach: "AUTOMATED",
      migrationTool: "BODS",
      priority: "medium",
    },
    REFERENCE: {
      objectType: "REFERENCE",
      objectName: "Country/Region Codes",
      description: "Reference data for country and region codes",
      sourceFormat: "CSV",
      volumeEstimate: "SMALL",
      recordCount: 250,
      cleansingRequired: false,
      mappingComplexity: "SIMPLE",
      migrationApproach: "MANUAL",
      migrationTool: "LTMC",
      priority: "low",
    },
  };

  return createBase({
    ...typeDefaults[objectType],
    ...overrides,
  });
}

export function createByComplexity(
  mappingComplexity: MappingComplexity,
  overrides: DataMigrationOverrides = {},
): DataMigrationObject {
  const complexityDefaults: Record<MappingComplexity, Partial<DataMigrationObject>> = {
    SIMPLE: {
      mappingComplexity: "SIMPLE",
      objectName: "Simple Reference Data",
      description: "Direct 1:1 field mapping with no transformation",
      migrationApproach: "AUTOMATED",
      migrationTool: "LTMC",
      cleansingRequired: false,
      priority: "low",
    },
    MODERATE: {
      mappingComplexity: "MODERATE",
      objectName: "Vendor Master Data",
      description: "Moderate mapping with some field transformations and lookups",
      migrationApproach: "AUTOMATED",
      migrationTool: "LTMC",
      cleansingRequired: true,
      cleansingNotes: "Standardize vendor classifications",
      priority: "medium",
    },
    COMPLEX: {
      mappingComplexity: "COMPLEX",
      objectName: "Material Master with BOM",
      description: "Complex mapping with multi-table joins, conditional logic, and BOM structures",
      migrationApproach: "SEMI_AUTOMATED",
      migrationTool: "BODS",
      cleansingRequired: true,
      cleansingNotes: "Resolve conflicting unit of measure conversions, validate BOM levels",
      priority: "high",
    },
    VERY_COMPLEX: {
      mappingComplexity: "VERY_COMPLEX",
      objectName: "Custom Master Data with Extensions",
      description:
        "Very complex mapping requiring custom transformations, cross-system lookups, " +
        "and validation against multiple reference tables",
      migrationApproach: "HYBRID",
      migrationTool: "CUSTOM",
      cleansingRequired: true,
      cleansingNotes:
        "Requires dedicated data quality team for cleansing, deduplication, " +
        "and enrichment across multiple source systems",
      priority: "critical",
    },
  };

  return createBase({
    ...complexityDefaults[mappingComplexity],
    ...overrides,
  });
}

export { OBJECT_TYPES, MAPPING_COMPLEXITIES };
export type { ObjectType, MappingComplexity };
