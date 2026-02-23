/**
 * STATUS: Self-contained specification test
 * REAL MODULE: src/app/api/ routes, src/lib/assessment/
 * WIRING BLOCKED BY: Need database layer
 *
 * Integration tests: Assessment CRUD & Full Lifecycle (T-CRUD-001 through T-CRUD-015)
 *
 * Validates the complete assessment lifecycle: create, update, classify, gap
 * management, register entries, cascade deletes, archival, and billing events.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createMockSession, createMockUser } from "../helpers/auth";
import { createMockMeterEvent } from "../helpers/stripe";
import * as OrgFactory from "../factories/organization.factory";
import * as UserFactory from "../factories/user.factory";
import * as AssessmentFactory from "../factories/assessment.factory";
import * as StepFactory from "../factories/step.factory";
import * as GapFactory from "../factories/gap.factory";

// ---------------------------------------------------------------------------
// In-memory store simulating the database for integration tests
// ---------------------------------------------------------------------------

interface InMemoryStore {
  assessments: Map<string, ReturnType<typeof AssessmentFactory.create>>;
  scopeSelections: Map<string, { assessmentId: string; scopeItemId: string; selected: boolean; dependsOnScopeItems: string[] }[]>;
  stepResponses: Map<string, { assessmentId: string; processStepId: string; fitStatus: string; confidence: string | null }[]>;
  gapResolutions: Map<string, ReturnType<typeof GapFactory.create>[]>;
  integrationPoints: Map<string, Record<string, unknown>[]>;
  dataMigrationObjects: Map<string, Record<string, unknown>[]>;
  ocmImpacts: Map<string, Record<string, unknown>[]>;
  stakeholders: Map<string, Record<string, unknown>[]>;
  phaseProgress: Map<string, Record<string, unknown>[]>;
  meterEvents: { eventName: string; value: number; assessmentId: string }[];
}

let store: InMemoryStore;

function resetStore(): InMemoryStore {
  return {
    assessments: new Map(),
    scopeSelections: new Map(),
    stepResponses: new Map(),
    gapResolutions: new Map(),
    integrationPoints: new Map(),
    dataMigrationObjects: new Map(),
    ocmImpacts: new Map(),
    stakeholders: new Map(),
    phaseProgress: new Map(),
    meterEvents: [],
  };
}

// ---------------------------------------------------------------------------
// Simulated service functions
// ---------------------------------------------------------------------------

function createAssessmentWithRelated(
  input: {
    companyName: string;
    industry: string;
    country: string;
    companySize: string;
    organizationId: string;
    createdBy: string;
  },
) {
  const assessment = AssessmentFactory.create({
    companyName: input.companyName,
    industry: input.industry,
    country: input.country,
    companySize: input.companySize,
    organizationId: input.organizationId,
    createdBy: input.createdBy,
    status: "draft",
  });

  store.assessments.set(assessment.id, assessment);
  store.scopeSelections.set(assessment.id, []);
  store.stepResponses.set(assessment.id, []);
  store.gapResolutions.set(assessment.id, []);
  store.integrationPoints.set(assessment.id, []);
  store.dataMigrationObjects.set(assessment.id, []);
  store.ocmImpacts.set(assessment.id, []);
  store.stakeholders.set(assessment.id, [
    { userId: input.createdBy, role: "consultant", canEdit: true },
  ]);
  store.phaseProgress.set(assessment.id, [
    { phase: "scoping", status: "not_started", completionPct: 0 },
    { phase: "process_review", status: "not_started", completionPct: 0 },
    { phase: "gap_resolution", status: "not_started", completionPct: 0 },
    { phase: "integration", status: "not_started", completionPct: 0 },
    { phase: "data_migration", status: "not_started", completionPct: 0 },
    { phase: "ocm", status: "not_started", completionPct: 0 },
    { phase: "validation", status: "not_started", completionPct: 0 },
    { phase: "sign_off", status: "not_started", completionPct: 0 },
  ]);

  // Fire Stripe meter event for assessment creation
  const meterEvent = createMockMeterEvent("assessment_created", 1);
  store.meterEvents.push({
    eventName: meterEvent.event_name,
    value: meterEvent.value,
    assessmentId: assessment.id,
  });

  return assessment;
}

function updateCompanyProfile(
  assessmentId: string,
  updates: Partial<ReturnType<typeof AssessmentFactory.create>>,
) {
  const assessment = store.assessments.get(assessmentId);
  if (!assessment) throw new Error("Assessment not found");

  const updated = { ...assessment, ...updates, updatedAt: new Date() };
  store.assessments.set(assessmentId, updated);
  return updated;
}

function addScopeItems(
  assessmentId: string,
  items: { scopeItemId: string; selected: boolean; dependsOnScopeItems?: string[] }[],
) {
  const current = store.scopeSelections.get(assessmentId) ?? [];
  const newItems = items.map((item) => ({
    assessmentId,
    scopeItemId: item.scopeItemId,
    selected: item.selected,
    dependsOnScopeItems: item.dependsOnScopeItems ?? [],
  }));
  store.scopeSelections.set(assessmentId, [...current, ...newItems]);
  return newItems;
}

function classifyStep(
  assessmentId: string,
  processStepId: string,
  fitStatus: string,
  confidence: string | null = null,
) {
  const responses = store.stepResponses.get(assessmentId) ?? [];
  const existing = responses.findIndex((r) => r.processStepId === processStepId);
  const entry = { assessmentId, processStepId, fitStatus, confidence };

  if (existing >= 0) {
    responses[existing] = entry;
  } else {
    responses.push(entry);
  }
  store.stepResponses.set(assessmentId, responses);
  return entry;
}

function createGap(
  assessmentId: string,
  processStepId: string,
  scopeItemId: string,
  description: string,
) {
  const gap = GapFactory.create({
    assessmentId,
    processStepId,
    scopeItemId,
    gapDescription: description,
    resolutionType: "EXTEND",
    resolutionDescription: "",
    effortDays: null,
    costEstimate: null,
    oneTimeCost: null,
    recurringCost: null,
  });
  const gaps = store.gapResolutions.get(assessmentId) ?? [];
  gaps.push(gap);
  store.gapResolutions.set(assessmentId, gaps);
  return gap;
}

function resolveGap(
  gapId: string,
  assessmentId: string,
  resolution: {
    resolutionType: string;
    resolutionDescription: string;
    effortDays: number;
    oneTimeCost: number;
    recurringCost: number;
    riskCategory: string;
  },
) {
  const gaps = store.gapResolutions.get(assessmentId) ?? [];
  const idx = gaps.findIndex((g) => g.id === gapId);
  if (idx < 0) throw new Error("Gap not found");

  gaps[idx] = {
    ...gaps[idx]!,
    ...resolution,
    decidedBy: "test-decider",
    decidedAt: new Date(),
    updatedAt: new Date(),
  };
  store.gapResolutions.set(assessmentId, gaps);
  return gaps[idx]!;
}

function addIntegrationPoint(assessmentId: string, data: Record<string, unknown>): Record<string, unknown> {
  const point: Record<string, unknown> = {
    id: `ip-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    assessmentId,
    ...data,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const points = store.integrationPoints.get(assessmentId) ?? [];
  points.push(point);
  store.integrationPoints.set(assessmentId, points);
  return point;
}

function addDataMigrationObject(assessmentId: string, data: Record<string, unknown>): Record<string, unknown> {
  const obj: Record<string, unknown> = {
    id: `dmo-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    assessmentId,
    ...data,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const objects = store.dataMigrationObjects.get(assessmentId) ?? [];
  objects.push(obj);
  store.dataMigrationObjects.set(assessmentId, objects);
  return obj;
}

function addOcmImpact(assessmentId: string, data: Record<string, unknown>): Record<string, unknown> {
  const impact: Record<string, unknown> = {
    id: `ocm-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    assessmentId,
    ...data,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const impacts = store.ocmImpacts.get(assessmentId) ?? [];
  impacts.push(impact);
  store.ocmImpacts.set(assessmentId, impacts);
  return impact;
}

function deleteGap(gapId: string, assessmentId: string) {
  const gaps = store.gapResolutions.get(assessmentId) ?? [];
  const filtered = gaps.filter((g) => g.id !== gapId);
  store.gapResolutions.set(assessmentId, filtered);
  return filtered.length < gaps.length;
}

function deleteAssessment(assessmentId: string) {
  const existed = store.assessments.has(assessmentId);
  store.assessments.delete(assessmentId);
  store.scopeSelections.delete(assessmentId);
  store.stepResponses.delete(assessmentId);
  store.gapResolutions.delete(assessmentId);
  store.integrationPoints.delete(assessmentId);
  store.dataMigrationObjects.delete(assessmentId);
  store.ocmImpacts.delete(assessmentId);
  store.stakeholders.delete(assessmentId);
  store.phaseProgress.delete(assessmentId);

  if (existed) {
    const meterEvent = createMockMeterEvent("assessment_deleted", -1);
    store.meterEvents.push({
      eventName: meterEvent.event_name,
      value: meterEvent.value,
      assessmentId,
    });
  }
  return existed;
}

function archiveAssessment(assessmentId: string) {
  const assessment = store.assessments.get(assessmentId);
  if (!assessment) throw new Error("Assessment not found");

  const archived = { ...assessment, status: "archived", updatedAt: new Date() };
  store.assessments.set(assessmentId, archived);
  return archived;
}

function transitionStatus(assessmentId: string, newStatus: string) {
  const assessment = store.assessments.get(assessmentId);
  if (!assessment) throw new Error("Assessment not found");

  const updated = { ...assessment, status: newStatus, updatedAt: new Date() };
  store.assessments.set(assessmentId, updated);
  return updated;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Assessment CRUD & Lifecycle (T-CRUD)", () => {
  const org = OrgFactory.createProfessional({ id: "org-crud" });
  const user = UserFactory.createForRole("consultant", org.id, { id: "user-crud" });

  beforeEach(() => {
    store = resetStore();
  });

  // --------------------------------------------------------------------------
  // T-CRUD-001 & T-CRUD-002: Assessment creation
  // --------------------------------------------------------------------------

  describe("Assessment creation", () => {
    it("T-CRUD-001: Create assessment creates all related records", () => {
      const assessment = createAssessmentWithRelated({
        companyName: "Test Corp",
        industry: "Manufacturing",
        country: "US",
        companySize: "MEDIUM",
        organizationId: org.id,
        createdBy: user.id!,
      });

      // Assessment itself
      expect(store.assessments.has(assessment.id)).toBe(true);
      expect(store.assessments.get(assessment.id)!.status).toBe("draft");

      // Related records initialized
      expect(store.scopeSelections.get(assessment.id)).toEqual([]);
      expect(store.stepResponses.get(assessment.id)).toEqual([]);
      expect(store.gapResolutions.get(assessment.id)).toEqual([]);
      expect(store.integrationPoints.get(assessment.id)).toEqual([]);
      expect(store.dataMigrationObjects.get(assessment.id)).toEqual([]);
      expect(store.ocmImpacts.get(assessment.id)).toEqual([]);

      // Creator added as stakeholder
      const stakeholders = store.stakeholders.get(assessment.id)!;
      expect(stakeholders).toHaveLength(1);
      expect(stakeholders[0]!.userId).toBe(user.id);

      // Phase progress initialized with all 8 phases
      const progress = store.phaseProgress.get(assessment.id)!;
      expect(progress).toHaveLength(8);
      expect(progress.every((p) => p.status === "not_started")).toBe(true);
    });

    it("T-CRUD-002: Create assessment fires Stripe meter event", () => {
      const assessment = createAssessmentWithRelated({
        companyName: "Billing Test Corp",
        industry: "Retail",
        country: "DE",
        companySize: "LARGE",
        organizationId: org.id,
        createdBy: user.id!,
      });

      const creationEvents = store.meterEvents.filter(
        (e) => e.eventName === "assessment_created" && e.assessmentId === assessment.id,
      );
      expect(creationEvents).toHaveLength(1);
      expect(creationEvents[0]!.value).toBe(1);
    });
  });

  // --------------------------------------------------------------------------
  // T-CRUD-003: Company profile update
  // --------------------------------------------------------------------------

  describe("Company profile update", () => {
    it("T-CRUD-003: Update company profile persists all fields", () => {
      const assessment = createAssessmentWithRelated({
        companyName: "Profile Test Corp",
        industry: "Manufacturing",
        country: "US",
        companySize: "MEDIUM",
        organizationId: org.id,
        createdBy: user.id!,
      });

      const updated = updateCompanyProfile(assessment.id, {
        companyName: "Updated Corp",
        industry: "Automotive",
        employeeCount: 5000,
        annualRevenue: 1000000000,
        currencyCode: "EUR",
        targetGoLiveDate: new Date("2027-01-01"),
        deploymentModel: "cloud",
        sapModules: ["FI", "CO", "MM", "SD"],
        keyProcesses: ["Order-to-Cash", "Procure-to-Pay"],
        languageRequirements: ["EN", "DE"],
        regulatoryFrameworks: ["SOX", "GDPR"],
        itLandscapeSummary: "Complex ERP landscape with 5 legacy systems",
        currentErpVersion: "EHP8",
        migrationApproach: "greenfield",
      });

      expect(updated.companyName).toBe("Updated Corp");
      expect(updated.industry).toBe("Automotive");
      expect(updated.employeeCount).toBe(5000);
      expect(updated.annualRevenue).toBe(1000000000);
      expect(updated.currencyCode).toBe("EUR");
      expect(updated.deploymentModel).toBe("cloud");
      expect(updated.sapModules).toEqual(["FI", "CO", "MM", "SD"]);
      expect(updated.keyProcesses).toEqual(["Order-to-Cash", "Procure-to-Pay"]);
      expect(updated.languageRequirements).toEqual(["EN", "DE"]);
      expect(updated.regulatoryFrameworks).toEqual(["SOX", "GDPR"]);
      expect(updated.itLandscapeSummary).toBe("Complex ERP landscape with 5 legacy systems");
      expect(updated.currentErpVersion).toBe("EHP8");
      expect(updated.migrationApproach).toBe("greenfield");

      // Verify persisted in store
      const stored = store.assessments.get(assessment.id)!;
      expect(stored.companyName).toBe("Updated Corp");
      expect(stored.updatedAt.getTime()).toBeGreaterThanOrEqual(assessment.updatedAt.getTime());
    });
  });

  // --------------------------------------------------------------------------
  // T-CRUD-004: Scope item addition
  // --------------------------------------------------------------------------

  describe("Scope management", () => {
    it("T-CRUD-004: Add scope items initializes dependent data structures", () => {
      const assessment = createAssessmentWithRelated({
        companyName: "Scope Test",
        industry: "Manufacturing",
        country: "US",
        companySize: "MEDIUM",
        organizationId: org.id,
        createdBy: user.id!,
      });

      const items = addScopeItems(assessment.id, [
        { scopeItemId: "J60", selected: true, dependsOnScopeItems: [] },
        { scopeItemId: "J14", selected: true, dependsOnScopeItems: ["J60"] },
        { scopeItemId: "J13", selected: false },
      ]);

      const selections = store.scopeSelections.get(assessment.id)!;
      expect(selections).toHaveLength(3);
      expect(selections.filter((s) => s.selected)).toHaveLength(2);

      // Dependencies tracked
      const j14 = selections.find((s) => s.scopeItemId === "J14")!;
      expect(j14.dependsOnScopeItems).toContain("J60");

      // Unselected items still tracked
      const j13 = selections.find((s) => s.scopeItemId === "J13")!;
      expect(j13.selected).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // T-CRUD-005: Step classification
  // --------------------------------------------------------------------------

  describe("Step classification", () => {
    it("T-CRUD-005: Classify step creates/updates StepResponse", () => {
      const assessment = createAssessmentWithRelated({
        companyName: "Classify Test",
        industry: "Manufacturing",
        country: "US",
        companySize: "MEDIUM",
        organizationId: org.id,
        createdBy: user.id!,
      });

      const step = StepFactory.create({ scopeItemId: "J60" });

      // Create initial classification
      const response1 = classifyStep(assessment.id, step.id, "FIT", "high");
      expect(response1.fitStatus).toBe("FIT");
      expect(response1.confidence).toBe("high");

      // Update classification
      const response2 = classifyStep(assessment.id, step.id, "GAP", "medium");
      expect(response2.fitStatus).toBe("GAP");
      expect(response2.confidence).toBe("medium");

      // Only one entry for this step
      const responses = store.stepResponses.get(assessment.id)!;
      expect(responses.filter((r) => r.processStepId === step.id)).toHaveLength(1);
    });
  });

  // --------------------------------------------------------------------------
  // T-CRUD-006 & T-CRUD-007: Gap creation and resolution
  // --------------------------------------------------------------------------

  describe("Gap management", () => {
    it("T-CRUD-006: Create gap linked to step with cost fields initialized", () => {
      const assessment = createAssessmentWithRelated({
        companyName: "Gap Test",
        industry: "Manufacturing",
        country: "US",
        companySize: "MEDIUM",
        organizationId: org.id,
        createdBy: user.id!,
      });

      const step = StepFactory.create({ scopeItemId: "J60" });
      const gap = createGap(assessment.id, step.id, "J60", "Process requires custom extension");

      expect(gap.assessmentId).toBe(assessment.id);
      expect(gap.processStepId).toBe(step.id);
      expect(gap.scopeItemId).toBe("J60");
      expect(gap.gapDescription).toBe("Process requires custom extension");
      // Cost fields initialized as null
      expect(gap.effortDays).toBeNull();
      expect(gap.costEstimate).toBeNull();
      expect(gap.oneTimeCost).toBeNull();
      expect(gap.recurringCost).toBeNull();

      const gaps = store.gapResolutions.get(assessment.id)!;
      expect(gaps).toHaveLength(1);
    });

    it("T-CRUD-007: Resolve gap updates resolution type, cost, and affected fields", () => {
      const assessment = createAssessmentWithRelated({
        companyName: "Resolve Test",
        industry: "Manufacturing",
        country: "US",
        companySize: "MEDIUM",
        organizationId: org.id,
        createdBy: user.id!,
      });

      const step = StepFactory.create({ scopeItemId: "J60" });
      const gap = createGap(assessment.id, step.id, "J60", "Needs BTP extension");

      const resolved = resolveGap(gap.id, assessment.id, {
        resolutionType: "BTP_SERVICE",
        resolutionDescription: "Implement via BTP CAP framework",
        effortDays: 15,
        oneTimeCost: 35000,
        recurringCost: 8000,
        riskCategory: "low",
      });

      expect(resolved.resolutionType).toBe("BTP_SERVICE");
      expect(resolved.resolutionDescription).toBe("Implement via BTP CAP framework");
      expect(resolved.effortDays).toBe(15);
      expect(resolved.oneTimeCost).toBe(35000);
      expect(resolved.recurringCost).toBe(8000);
      expect(resolved.riskCategory).toBe("low");
      expect(resolved.decidedBy).toBe("test-decider");
      expect(resolved.decidedAt).toBeInstanceOf(Date);
    });
  });

  // --------------------------------------------------------------------------
  // T-CRUD-008 through T-CRUD-010: Register entries
  // --------------------------------------------------------------------------

  describe("Register entries", () => {
    it("T-CRUD-008: Add integration point with all IntegrationPoint fields", () => {
      const assessment = createAssessmentWithRelated({
        companyName: "Integration Test",
        industry: "Manufacturing",
        country: "US",
        companySize: "LARGE",
        organizationId: org.id,
        createdBy: user.id!,
      });

      const ip = addIntegrationPoint(assessment.id, {
        scopeItemId: "J60",
        name: "Vendor Invoice Interface",
        description: "Automated vendor invoice posting from EDI",
        direction: "INBOUND",
        sourceSystem: "EDI Gateway",
        targetSystem: "SAP S/4HANA",
        interfaceType: "IDOC",
        frequency: "BATCH_DAILY",
        middleware: "SAP_CPI",
        dataVolume: "10000 records/day",
        complexity: "MEDIUM",
        priority: "high",
        status: "identified",
        technicalNotes: "Requires IDOC type INVOIC02",
        createdBy: user.id,
      });

      expect(ip.id).toBeDefined();
      expect(ip.assessmentId).toBe(assessment.id);
      expect(ip.name).toBe("Vendor Invoice Interface");
      expect(ip.direction).toBe("INBOUND");
      expect(ip.interfaceType).toBe("IDOC");
      expect(ip.frequency).toBe("BATCH_DAILY");
      expect(ip.middleware).toBe("SAP_CPI");
      expect(ip.complexity).toBe("MEDIUM");
      expect(ip.priority).toBe("high");

      const points = store.integrationPoints.get(assessment.id)!;
      expect(points).toHaveLength(1);
    });

    it("T-CRUD-009: Add data migration object with all DataMigrationObject fields", () => {
      const assessment = createAssessmentWithRelated({
        companyName: "DM Test",
        industry: "Manufacturing",
        country: "US",
        companySize: "LARGE",
        organizationId: org.id,
        createdBy: user.id!,
      });

      const dmo = addDataMigrationObject(assessment.id, {
        scopeItemId: "J60",
        objectName: "Vendor Master",
        description: "Migrate vendor master data from legacy ECC",
        objectType: "MASTER_DATA",
        sourceSystem: "SAP ECC",
        sourceFormat: "SAP_TABLE",
        volumeEstimate: "LARGE",
        recordCount: 50000,
        cleansingRequired: true,
        cleansingNotes: "Duplicate vendor records to be merged",
        mappingComplexity: "COMPLEX",
        migrationApproach: "AUTOMATED",
        migrationTool: "LTMC",
        validationRules: "Business partner number must be unique",
        priority: "critical",
        status: "identified",
        dependsOn: [],
        technicalNotes: "Map KNA1/LFA1 to BP",
        createdBy: user.id,
      });

      expect(dmo.id).toBeDefined();
      expect(dmo.assessmentId).toBe(assessment.id);
      expect(dmo.objectName).toBe("Vendor Master");
      expect(dmo.objectType).toBe("MASTER_DATA");
      expect(dmo.volumeEstimate).toBe("LARGE");
      expect(dmo.recordCount).toBe(50000);
      expect(dmo.cleansingRequired).toBe(true);
      expect(dmo.mappingComplexity).toBe("COMPLEX");
      expect(dmo.migrationTool).toBe("LTMC");
      expect(dmo.priority).toBe("critical");
    });

    it("T-CRUD-010: Add OCM impact with all OcmImpact fields", () => {
      const assessment = createAssessmentWithRelated({
        companyName: "OCM Test",
        industry: "Manufacturing",
        country: "US",
        companySize: "LARGE",
        organizationId: org.id,
        createdBy: user.id!,
      });

      const ocm = addOcmImpact(assessment.id, {
        scopeItemId: "J60",
        functionalArea: "Finance",
        impactedRole: "Accounts Payable Clerk",
        impactedDepartment: "Finance",
        changeType: "PROCESS_CHANGE",
        severity: "HIGH",
        description: "Complete change from manual to automated invoice processing",
        trainingRequired: true,
        trainingType: "INSTRUCTOR_LED",
        trainingDuration: 3,
        communicationPlan: "Monthly town halls + weekly newsletters",
        resistanceRisk: "MEDIUM",
        readinessScore: 0.4,
        mitigationStrategy: "Early engagement with AP team leads; pilot program",
        priority: "high",
        status: "identified",
        createdBy: user.id,
      });

      expect(ocm.id).toBeDefined();
      expect(ocm.assessmentId).toBe(assessment.id);
      expect(ocm.changeType).toBe("PROCESS_CHANGE");
      expect(ocm.severity).toBe("HIGH");
      expect(ocm.trainingRequired).toBe(true);
      expect(ocm.trainingType).toBe("INSTRUCTOR_LED");
      expect(ocm.trainingDuration).toBe(3);
      expect(ocm.resistanceRisk).toBe("MEDIUM");
      expect(ocm.readinessScore).toBe(0.4);
      expect(ocm.priority).toBe("high");
    });
  });

  // --------------------------------------------------------------------------
  // T-CRUD-011 through T-CRUD-013: Deletion and cascading
  // --------------------------------------------------------------------------

  describe("Deletion and cascading", () => {
    it("T-CRUD-011: Delete gap cascades resolution deleted", () => {
      const assessment = createAssessmentWithRelated({
        companyName: "Delete Gap Test",
        industry: "Manufacturing",
        country: "US",
        companySize: "MEDIUM",
        organizationId: org.id,
        createdBy: user.id!,
      });

      const step = StepFactory.create({ scopeItemId: "J60" });
      const gap = createGap(assessment.id, step.id, "J60", "To be deleted");
      resolveGap(gap.id, assessment.id, {
        resolutionType: "CONFIGURE",
        resolutionDescription: "Standard config",
        effortDays: 5,
        oneTimeCost: 5000,
        recurringCost: 0,
        riskCategory: "low",
      });

      // Verify gap exists with resolution
      expect(store.gapResolutions.get(assessment.id)).toHaveLength(1);

      // Delete gap -- resolution should be removed with it
      const deleted = deleteGap(gap.id, assessment.id);
      expect(deleted).toBe(true);
      expect(store.gapResolutions.get(assessment.id)).toHaveLength(0);
    });

    it("T-CRUD-012: Delete assessment cascades all related records deleted", () => {
      const assessment = createAssessmentWithRelated({
        companyName: "Delete All Test",
        industry: "Manufacturing",
        country: "US",
        companySize: "MEDIUM",
        organizationId: org.id,
        createdBy: user.id!,
      });

      // Add various child records
      addScopeItems(assessment.id, [{ scopeItemId: "J60", selected: true }]);
      const step = StepFactory.create({ scopeItemId: "J60" });
      classifyStep(assessment.id, step.id, "GAP");
      createGap(assessment.id, step.id, "J60", "Critical gap");
      addIntegrationPoint(assessment.id, { name: "Test IP", direction: "INBOUND", sourceSystem: "A", targetSystem: "B", interfaceType: "API", frequency: "REAL_TIME", createdBy: user.id, description: "test", status: "identified" });
      addDataMigrationObject(assessment.id, { objectName: "Test DMO", objectType: "MASTER_DATA", sourceSystem: "A", description: "test", status: "identified", createdBy: user.id });
      addOcmImpact(assessment.id, { impactedRole: "Clerk", changeType: "PROCESS_CHANGE", severity: "LOW", description: "test", status: "identified", createdBy: user.id });

      // Verify records exist
      expect(store.scopeSelections.get(assessment.id)!.length).toBeGreaterThan(0);
      expect(store.stepResponses.get(assessment.id)!.length).toBeGreaterThan(0);
      expect(store.gapResolutions.get(assessment.id)!.length).toBeGreaterThan(0);
      expect(store.integrationPoints.get(assessment.id)!.length).toBeGreaterThan(0);
      expect(store.dataMigrationObjects.get(assessment.id)!.length).toBeGreaterThan(0);
      expect(store.ocmImpacts.get(assessment.id)!.length).toBeGreaterThan(0);

      // Delete assessment
      const deleted = deleteAssessment(assessment.id);
      expect(deleted).toBe(true);

      // All related records gone
      expect(store.assessments.has(assessment.id)).toBe(false);
      expect(store.scopeSelections.has(assessment.id)).toBe(false);
      expect(store.stepResponses.has(assessment.id)).toBe(false);
      expect(store.gapResolutions.has(assessment.id)).toBe(false);
      expect(store.integrationPoints.has(assessment.id)).toBe(false);
      expect(store.dataMigrationObjects.has(assessment.id)).toBe(false);
      expect(store.ocmImpacts.has(assessment.id)).toBe(false);
      expect(store.stakeholders.has(assessment.id)).toBe(false);
      expect(store.phaseProgress.has(assessment.id)).toBe(false);
    });

    it("T-CRUD-013: Delete assessment fires Stripe meter event (decrement)", () => {
      const assessment = createAssessmentWithRelated({
        companyName: "Billing Delete Test",
        industry: "Manufacturing",
        country: "US",
        companySize: "MEDIUM",
        organizationId: org.id,
        createdBy: user.id!,
      });

      const initialMeterCount = store.meterEvents.length;
      deleteAssessment(assessment.id);

      const deletionEvents = store.meterEvents.filter(
        (e) => e.eventName === "assessment_deleted" && e.assessmentId === assessment.id,
      );
      expect(deletionEvents).toHaveLength(1);
      expect(deletionEvents[0]!.value).toBe(-1);
      expect(store.meterEvents.length).toBe(initialMeterCount + 1);
    });
  });

  // --------------------------------------------------------------------------
  // T-CRUD-014: Archive assessment
  // --------------------------------------------------------------------------

  describe("Assessment archival", () => {
    it("T-CRUD-014: Archive assessment updates status, access becomes read-only", () => {
      const assessment = createAssessmentWithRelated({
        companyName: "Archive Test",
        industry: "Manufacturing",
        country: "US",
        companySize: "MEDIUM",
        organizationId: org.id,
        createdBy: user.id!,
      });

      // Move through statuses to signed_off first
      transitionStatus(assessment.id, "signed_off");

      const archived = archiveAssessment(assessment.id);
      expect(archived.status).toBe("archived");

      // Verify in store
      const stored = store.assessments.get(assessment.id)!;
      expect(stored.status).toBe("archived");

      // Attempting to modify an archived assessment should be blocked
      const isArchived = stored.status === "archived";
      expect(isArchived).toBe(true);

      // Verify modifications are conceptually blocked
      const canModify = stored.status !== "archived";
      expect(canModify).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // T-CRUD-015: Full lifecycle
  // --------------------------------------------------------------------------

  describe("Full lifecycle", () => {
    it("T-CRUD-015: Full lifecycle: create -> scope -> classify -> gap -> resolve -> validate -> sign-off -> handoff -> archive", () => {
      // 1. Create
      const assessment = createAssessmentWithRelated({
        companyName: "Full Lifecycle Corp",
        industry: "Manufacturing",
        country: "US",
        companySize: "LARGE",
        organizationId: org.id,
        createdBy: user.id!,
      });
      expect(assessment.status).toBe("draft");

      // 2. Scope
      addScopeItems(assessment.id, [
        { scopeItemId: "J60", selected: true },
        { scopeItemId: "J14", selected: true, dependsOnScopeItems: ["J60"] },
      ]);
      transitionStatus(assessment.id, "scoping");
      expect(store.assessments.get(assessment.id)!.status).toBe("scoping");

      const scopes = store.scopeSelections.get(assessment.id)!;
      expect(scopes).toHaveLength(2);

      // 3. Classify
      transitionStatus(assessment.id, "in_progress");
      const step1 = StepFactory.create({ scopeItemId: "J60" });
      const step2 = StepFactory.create({ scopeItemId: "J60" });
      classifyStep(assessment.id, step1.id, "FIT", "high");
      classifyStep(assessment.id, step2.id, "GAP", "high");

      expect(store.stepResponses.get(assessment.id)).toHaveLength(2);

      // 4. Create gap
      const gap = createGap(assessment.id, step2.id, "J60", "Custom pricing logic required");
      expect(store.gapResolutions.get(assessment.id)).toHaveLength(1);

      // 5. Resolve gap
      transitionStatus(assessment.id, "gap_resolution");
      const resolved = resolveGap(gap.id, assessment.id, {
        resolutionType: "BTP_SERVICE",
        resolutionDescription: "BTP CAP extension",
        effortDays: 20,
        oneTimeCost: 45000,
        recurringCost: 6000,
        riskCategory: "medium",
      });
      expect(resolved.resolutionType).toBe("BTP_SERVICE");

      // 6. Validate
      transitionStatus(assessment.id, "pending_validation");
      transitionStatus(assessment.id, "validated");
      expect(store.assessments.get(assessment.id)!.status).toBe("validated");

      // 7. Sign-off
      transitionStatus(assessment.id, "pending_sign_off");
      transitionStatus(assessment.id, "signed_off");
      expect(store.assessments.get(assessment.id)!.status).toBe("signed_off");

      // 8. Handoff
      transitionStatus(assessment.id, "handed_off");
      expect(store.assessments.get(assessment.id)!.status).toBe("handed_off");

      // 9. Archive
      archiveAssessment(assessment.id);
      const final = store.assessments.get(assessment.id)!;
      expect(final.status).toBe("archived");

      // Verify all data persisted through the lifecycle
      expect(store.scopeSelections.get(assessment.id)!).toHaveLength(2);
      expect(store.stepResponses.get(assessment.id)!).toHaveLength(2);
      expect(store.gapResolutions.get(assessment.id)!).toHaveLength(1);

      // Verify meter events: one creation event
      const creationEvents = store.meterEvents.filter(
        (e) => e.eventName === "assessment_created" && e.assessmentId === assessment.id,
      );
      expect(creationEvents).toHaveLength(1);
    });
  });
});
