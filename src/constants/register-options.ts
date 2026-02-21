/** Labeled option arrays for register UI dropdowns */

// Phase 14: Integration Register
export const INTEGRATION_DIRECTION_OPTIONS = [
  { value: "INBOUND", label: "Inbound" },
  { value: "OUTBOUND", label: "Outbound" },
  { value: "BIDIRECTIONAL", label: "Bidirectional" },
] as const;

export const INTERFACE_TYPE_OPTIONS = [
  { value: "API", label: "API" },
  { value: "IDOC", label: "IDoc" },
  { value: "FILE", label: "File" },
  { value: "RFC", label: "RFC" },
  { value: "ODATA", label: "OData" },
  { value: "EVENT", label: "Event" },
] as const;

export const INTEGRATION_FREQUENCY_OPTIONS = [
  { value: "REAL_TIME", label: "Real-Time" },
  { value: "NEAR_REAL_TIME", label: "Near Real-Time" },
  { value: "BATCH_DAILY", label: "Batch Daily" },
  { value: "BATCH_WEEKLY", label: "Batch Weekly" },
  { value: "ON_DEMAND", label: "On Demand" },
] as const;

export const INTEGRATION_MIDDLEWARE_OPTIONS = [
  { value: "SAP_CPI", label: "SAP CPI" },
  { value: "SAP_PO", label: "SAP PO" },
  { value: "MULESOFT", label: "MuleSoft" },
  { value: "BOOMI", label: "Boomi" },
  { value: "AZURE_INTEGRATION", label: "Azure Integration" },
  { value: "OTHER", label: "Other" },
] as const;

export const INTEGRATION_COMPLEXITY_OPTIONS = [
  { value: "LOW", label: "Low" },
  { value: "MEDIUM", label: "Medium" },
  { value: "HIGH", label: "High" },
  { value: "VERY_HIGH", label: "Very High" },
] as const;

export const INTEGRATION_STATUS_OPTIONS = [
  { value: "identified", label: "Identified" },
  { value: "analyzed", label: "Analyzed" },
  { value: "designed", label: "Designed" },
  { value: "approved", label: "Approved" },
] as const;

// Phase 15: Data Migration Register
export const DATA_MIGRATION_OBJECT_TYPE_OPTIONS = [
  { value: "MASTER_DATA", label: "Master Data" },
  { value: "TRANSACTION_DATA", label: "Transaction Data" },
  { value: "CONFIG_DATA", label: "Configuration Data" },
  { value: "HISTORICAL", label: "Historical Data" },
  { value: "REFERENCE", label: "Reference Data" },
] as const;

export const SOURCE_FORMAT_OPTIONS = [
  { value: "SAP_TABLE", label: "SAP Table" },
  { value: "CSV", label: "CSV" },
  { value: "EXCEL", label: "Excel" },
  { value: "XML", label: "XML" },
  { value: "DATABASE", label: "Database" },
  { value: "API", label: "API" },
] as const;

export const VOLUME_ESTIMATE_OPTIONS = [
  { value: "SMALL", label: "Small (< 1K)" },
  { value: "MEDIUM", label: "Medium (1K - 100K)" },
  { value: "LARGE", label: "Large (100K - 1M)" },
  { value: "VERY_LARGE", label: "Very Large (> 1M)" },
] as const;

export const MAPPING_COMPLEXITY_OPTIONS = [
  { value: "SIMPLE", label: "Simple" },
  { value: "MODERATE", label: "Moderate" },
  { value: "COMPLEX", label: "Complex" },
  { value: "VERY_COMPLEX", label: "Very Complex" },
] as const;

export const MIGRATION_APPROACH_OPTIONS = [
  { value: "AUTOMATED", label: "Automated" },
  { value: "SEMI_AUTOMATED", label: "Semi-Automated" },
  { value: "MANUAL", label: "Manual" },
  { value: "HYBRID", label: "Hybrid" },
] as const;

export const MIGRATION_TOOL_OPTIONS = [
  { value: "LTMC", label: "LTMC" },
  { value: "LSMW", label: "LSMW" },
  { value: "BODS", label: "BODS" },
  { value: "CPI", label: "CPI" },
  { value: "CUSTOM", label: "Custom" },
] as const;

export const DATA_MIGRATION_STATUS_OPTIONS = [
  { value: "identified", label: "Identified" },
  { value: "mapped", label: "Mapped" },
  { value: "cleansed", label: "Cleansed" },
  { value: "validated", label: "Validated" },
  { value: "approved", label: "Approved" },
] as const;

// Phase 16: OCM Impact Register
export const OCM_CHANGE_TYPE_OPTIONS = [
  { value: "PROCESS_CHANGE", label: "Process Change" },
  { value: "ROLE_CHANGE", label: "Role Change" },
  { value: "TECHNOLOGY_CHANGE", label: "Technology Change" },
  { value: "ORGANIZATIONAL", label: "Organizational" },
  { value: "BEHAVIORAL", label: "Behavioral" },
] as const;

export const OCM_SEVERITY_OPTIONS = [
  { value: "LOW", label: "Low" },
  { value: "MEDIUM", label: "Medium" },
  { value: "HIGH", label: "High" },
  { value: "TRANSFORMATIONAL", label: "Transformational" },
] as const;

export const TRAINING_TYPE_OPTIONS = [
  { value: "INSTRUCTOR_LED", label: "Instructor-Led" },
  { value: "E_LEARNING", label: "E-Learning" },
  { value: "ON_THE_JOB", label: "On-the-Job" },
  { value: "WORKSHOP", label: "Workshop" },
] as const;

export const RESISTANCE_RISK_OPTIONS = [
  { value: "LOW", label: "Low" },
  { value: "MEDIUM", label: "Medium" },
  { value: "HIGH", label: "High" },
] as const;

export const OCM_STATUS_OPTIONS = [
  { value: "identified", label: "Identified" },
  { value: "assessed", label: "Assessed" },
  { value: "planned", label: "Planned" },
  { value: "approved", label: "Approved" },
] as const;

// Shared priority options (used across all registers)
export const PRIORITY_OPTIONS = [
  { value: "critical", label: "Critical" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
] as const;
