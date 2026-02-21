import { describe, it, expect } from "vitest";
import { z } from "zod";

/**
 * These tests validate the Zod schemas used in the register API routes.
 * We re-declare the schemas here to test them in isolation without
 * importing Next.js route modules (which have side effects).
 */

// Phase 14: Integration schema
const CreateIntegrationSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().min(1).max(5000),
  direction: z.enum(["INBOUND", "OUTBOUND", "BIDIRECTIONAL"]),
  sourceSystem: z.string().min(1).max(200),
  targetSystem: z.string().min(1).max(200),
  interfaceType: z.enum(["API", "IDOC", "FILE", "RFC", "ODATA", "EVENT"]),
  frequency: z.enum(["REAL_TIME", "NEAR_REAL_TIME", "BATCH_DAILY", "BATCH_WEEKLY", "ON_DEMAND"]),
  middleware: z.enum(["SAP_CPI", "SAP_PO", "MULESOFT", "BOOMI", "AZURE_INTEGRATION", "OTHER"]).optional(),
  dataVolume: z.string().max(200).optional(),
  complexity: z.enum(["LOW", "MEDIUM", "HIGH", "VERY_HIGH"]).optional(),
  priority: z.enum(["critical", "high", "medium", "low"]).optional(),
  scopeItemId: z.string().optional(),
  technicalNotes: z.string().max(5000).optional(),
});

// Phase 15: Data Migration schema
const CreateDataMigrationSchema = z.object({
  objectName: z.string().min(1).max(200),
  description: z.string().min(1).max(5000),
  objectType: z.enum(["MASTER_DATA", "TRANSACTION_DATA", "CONFIG_DATA", "HISTORICAL", "REFERENCE"]),
  sourceSystem: z.string().min(1).max(200),
  sourceFormat: z.enum(["SAP_TABLE", "CSV", "EXCEL", "XML", "DATABASE", "API"]).optional(),
  volumeEstimate: z.enum(["SMALL", "MEDIUM", "LARGE", "VERY_LARGE"]).optional(),
  recordCount: z.number().int().min(0).optional(),
  cleansingRequired: z.boolean().default(false),
  cleansingNotes: z.string().max(5000).optional(),
  mappingComplexity: z.enum(["SIMPLE", "MODERATE", "COMPLEX", "VERY_COMPLEX"]).optional(),
  migrationApproach: z.enum(["AUTOMATED", "SEMI_AUTOMATED", "MANUAL", "HYBRID"]).optional(),
  migrationTool: z.enum(["LTMC", "LSMW", "BODS", "CPI", "CUSTOM"]).optional(),
  validationRules: z.string().max(5000).optional(),
  priority: z.enum(["critical", "high", "medium", "low"]).optional(),
  dependsOn: z.array(z.string()).default([]),
  scopeItemId: z.string().optional(),
  technicalNotes: z.string().max(5000).optional(),
});

// Phase 16: OCM schema with conditional training validation
const CreateOcmSchema = z.object({
  impactedRole: z.string().min(1).max(200),
  impactedDepartment: z.string().max(200).optional(),
  functionalArea: z.string().max(200).optional(),
  changeType: z.enum(["PROCESS_CHANGE", "ROLE_CHANGE", "TECHNOLOGY_CHANGE", "ORGANIZATIONAL", "BEHAVIORAL"]),
  severity: z.enum(["LOW", "MEDIUM", "HIGH", "TRANSFORMATIONAL"]),
  description: z.string().min(1).max(5000),
  trainingRequired: z.boolean().default(false),
  trainingType: z.enum(["INSTRUCTOR_LED", "E_LEARNING", "ON_THE_JOB", "WORKSHOP"]).optional(),
  trainingDuration: z.number().min(0).max(365).optional(),
  communicationPlan: z.string().max(5000).optional(),
  resistanceRisk: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
  readinessScore: z.number().min(0).max(1).optional(),
  mitigationStrategy: z.string().max(5000).optional(),
  priority: z.enum(["critical", "high", "medium", "low"]).optional(),
  scopeItemId: z.string().optional(),
  technicalNotes: z.string().max(5000).optional(),
}).refine(
  (data) => !data.trainingRequired || data.trainingType !== undefined,
  { message: "Training type is required when training is marked as required", path: ["trainingType"] },
);

describe("CreateIntegrationSchema", () => {
  const validInput = {
    name: "Bank Statement Import",
    description: "Import bank statements for reconciliation",
    direction: "INBOUND" as const,
    sourceSystem: "Bank",
    targetSystem: "S/4HANA",
    interfaceType: "FILE" as const,
    frequency: "BATCH_DAILY" as const,
  };

  it("accepts valid minimal input", () => {
    const result = CreateIntegrationSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it("accepts valid input with all optional fields", () => {
    const result = CreateIntegrationSchema.safeParse({
      ...validInput,
      middleware: "SAP_CPI",
      dataVolume: "1000 records/day",
      complexity: "HIGH",
      priority: "critical",
      scopeItemId: "scope-123",
      technicalNotes: "Some notes",
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing required name", () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { name: _name, ...input } = validInput;
    const result = CreateIntegrationSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it("rejects empty name", () => {
    const result = CreateIntegrationSchema.safeParse({ ...validInput, name: "" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid direction", () => {
    const result = CreateIntegrationSchema.safeParse({ ...validInput, direction: "DIAGONAL" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid interface type", () => {
    const result = CreateIntegrationSchema.safeParse({ ...validInput, interfaceType: "SMOKE_SIGNALS" });
    expect(result.success).toBe(false);
  });

  it("rejects name exceeding max length", () => {
    const result = CreateIntegrationSchema.safeParse({ ...validInput, name: "x".repeat(201) });
    expect(result.success).toBe(false);
  });

  it("rejects invalid middleware", () => {
    const result = CreateIntegrationSchema.safeParse({ ...validInput, middleware: "PIGEON_POST" });
    expect(result.success).toBe(false);
  });
});

describe("CreateDataMigrationSchema", () => {
  const validInput = {
    objectName: "Customer Master",
    description: "Migrate customer master records",
    objectType: "MASTER_DATA" as const,
    sourceSystem: "SAP ECC",
  };

  it("accepts valid minimal input", () => {
    const result = CreateDataMigrationSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it("defaults cleansingRequired to false", () => {
    const result = CreateDataMigrationSchema.safeParse(validInput);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.cleansingRequired).toBe(false);
    }
  });

  it("defaults dependsOn to empty array", () => {
    const result = CreateDataMigrationSchema.safeParse(validInput);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.dependsOn).toEqual([]);
    }
  });

  it("accepts valid input with all optional fields", () => {
    const result = CreateDataMigrationSchema.safeParse({
      ...validInput,
      sourceFormat: "CSV",
      volumeEstimate: "LARGE",
      recordCount: 500000,
      cleansingRequired: true,
      cleansingNotes: "Remove duplicates",
      mappingComplexity: "COMPLEX",
      migrationApproach: "AUTOMATED",
      migrationTool: "LTMC",
      validationRules: "Validate addresses",
      priority: "high",
      dependsOn: ["dep-1", "dep-2"],
      technicalNotes: "Special handling needed",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid object type", () => {
    const result = CreateDataMigrationSchema.safeParse({ ...validInput, objectType: "MAGIC_DATA" });
    expect(result.success).toBe(false);
  });

  it("rejects negative record count", () => {
    const result = CreateDataMigrationSchema.safeParse({ ...validInput, recordCount: -1 });
    expect(result.success).toBe(false);
  });

  it("rejects non-integer record count", () => {
    const result = CreateDataMigrationSchema.safeParse({ ...validInput, recordCount: 1.5 });
    expect(result.success).toBe(false);
  });

  it("rejects missing required sourceSystem", () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { sourceSystem: _sourceSystem, ...input } = validInput;
    const result = CreateDataMigrationSchema.safeParse(input);
    expect(result.success).toBe(false);
  });
});

describe("CreateOcmSchema", () => {
  const validInput = {
    impactedRole: "AP Clerk",
    changeType: "PROCESS_CHANGE" as const,
    severity: "HIGH" as const,
    description: "Change in invoice processing workflow",
  };

  it("accepts valid minimal input", () => {
    const result = CreateOcmSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it("defaults trainingRequired to false", () => {
    const result = CreateOcmSchema.safeParse(validInput);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.trainingRequired).toBe(false);
    }
  });

  it("accepts training fields when trainingRequired is true", () => {
    const result = CreateOcmSchema.safeParse({
      ...validInput,
      trainingRequired: true,
      trainingType: "INSTRUCTOR_LED",
      trainingDuration: 16,
    });
    expect(result.success).toBe(true);
  });

  it("rejects trainingRequired=true without trainingType", () => {
    const result = CreateOcmSchema.safeParse({
      ...validInput,
      trainingRequired: true,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issues = result.error.issues;
      const trainingIssue = issues.find((i) => i.path.includes("trainingType"));
      expect(trainingIssue).toBeDefined();
    }
  });

  it("accepts trainingRequired=false without trainingType", () => {
    const result = CreateOcmSchema.safeParse({
      ...validInput,
      trainingRequired: false,
    });
    expect(result.success).toBe(true);
  });

  it("rejects readinessScore above 1", () => {
    const result = CreateOcmSchema.safeParse({ ...validInput, readinessScore: 1.5 });
    expect(result.success).toBe(false);
  });

  it("rejects readinessScore below 0", () => {
    const result = CreateOcmSchema.safeParse({ ...validInput, readinessScore: -0.1 });
    expect(result.success).toBe(false);
  });

  it("accepts readinessScore at boundaries", () => {
    expect(CreateOcmSchema.safeParse({ ...validInput, readinessScore: 0 }).success).toBe(true);
    expect(CreateOcmSchema.safeParse({ ...validInput, readinessScore: 1 }).success).toBe(true);
  });

  it("rejects invalid change type", () => {
    const result = CreateOcmSchema.safeParse({ ...validInput, changeType: "MAGICAL" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid severity", () => {
    const result = CreateOcmSchema.safeParse({ ...validInput, severity: "APOCALYPTIC" });
    expect(result.success).toBe(false);
  });

  it("rejects training duration above max", () => {
    const result = CreateOcmSchema.safeParse({
      ...validInput,
      trainingRequired: true,
      trainingType: "WORKSHOP",
      trainingDuration: 400,
    });
    expect(result.success).toBe(false);
  });

  it("accepts all optional fields together", () => {
    const result = CreateOcmSchema.safeParse({
      ...validInput,
      impactedDepartment: "Finance",
      functionalArea: "Accounts Payable",
      trainingRequired: true,
      trainingType: "E_LEARNING",
      trainingDuration: 4,
      communicationPlan: "Email + meeting",
      resistanceRisk: "HIGH",
      readinessScore: 0.65,
      mitigationStrategy: "Extra training sessions",
      priority: "critical",
      technicalNotes: "Notes here",
    });
    expect(result.success).toBe(true);
  });
});
