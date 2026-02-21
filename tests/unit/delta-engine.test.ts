import { describe, it, expect } from "vitest";
import {
  computeDeltaReport,
  computeDeltaSummary,
  computeImpactSummary,
} from "@/lib/lifecycle/delta-engine";
import type { SnapshotData } from "@/types/signoff";
import type { UnlockedEntity } from "@/types/lifecycle";

function makeSnapshot(overrides?: Partial<SnapshotData>): SnapshotData {
  return {
    assessmentId: "test-assessment",
    companyName: "Test Corp",
    industry: "Manufacturing",
    country: "US",
    status: "validated",
    scopeSelections: [],
    stepResponses: [],
    gapResolutions: [],
    integrationPoints: [],
    dataMigrationObjects: [],
    statistics: {
      totalScopeItems: 0,
      selectedScopeItems: 0,
      totalSteps: 0,
      fitCount: 0,
      configureCount: 0,
      gapCount: 0,
      naCount: 0,
      pendingCount: 0,
      totalGapResolutions: 0,
      approvedGapResolutions: 0,
      integrationPointCount: 0,
      dataMigrationObjectCount: 0,
    },
    ...overrides,
  };
}

describe("Delta Engine (Phase 31)", () => {
  describe("computeDeltaReport", () => {
    it("should return empty changes for identical snapshots", () => {
      const snapshot = makeSnapshot({
        scopeSelections: [{ id: "s1", scopeItemId: "J60", selected: true, relevance: "YES", notes: null }],
        stepResponses: [{ id: "r1", processStepId: "ps1", fitStatus: "FIT", clientNote: null, confidence: "HIGH" }],
      });

      const delta = computeDeltaReport(snapshot, snapshot);
      expect(delta.scopeChanges).toHaveLength(0);
      expect(delta.classificationChanges).toHaveLength(0);
      expect(delta.gapResolutionChanges).toHaveLength(0);
      expect(delta.integrationChanges).toHaveLength(0);
      expect(delta.dataMigrationChanges).toHaveLength(0);
    });

    it("should detect scope additions", () => {
      const base = makeSnapshot({ scopeSelections: [] });
      const compare = makeSnapshot({
        scopeSelections: [{ id: "s1", scopeItemId: "J60", selected: true, relevance: "YES", notes: null }],
      });

      const delta = computeDeltaReport(base, compare);
      expect(delta.scopeChanges).toHaveLength(1);
      expect(delta.scopeChanges[0]?.changeType).toBe("added");
      expect(delta.scopeChanges[0]?.scopeItemId).toBe("J60");
    });

    it("should detect scope removals", () => {
      const base = makeSnapshot({
        scopeSelections: [{ id: "s1", scopeItemId: "J60", selected: true, relevance: "YES", notes: null }],
      });
      const compare = makeSnapshot({ scopeSelections: [] });

      const delta = computeDeltaReport(base, compare);
      expect(delta.scopeChanges).toHaveLength(1);
      expect(delta.scopeChanges[0]?.changeType).toBe("removed");
    });

    it("should detect scope modifications", () => {
      const base = makeSnapshot({
        scopeSelections: [{ id: "s1", scopeItemId: "J60", selected: true, relevance: "YES", notes: null }],
      });
      const compare = makeSnapshot({
        scopeSelections: [{ id: "s1", scopeItemId: "J60", selected: false, relevance: "NO", notes: null }],
      });

      const delta = computeDeltaReport(base, compare);
      expect(delta.scopeChanges).toHaveLength(1);
      expect(delta.scopeChanges[0]?.changeType).toBe("modified");
      expect(delta.scopeChanges[0]?.previousSelected).toBe(true);
      expect(delta.scopeChanges[0]?.newSelected).toBe(false);
    });

    it("should detect classification changes (step response)", () => {
      const base = makeSnapshot({
        stepResponses: [{ id: "r1", processStepId: "ps1", fitStatus: "FIT", clientNote: null, confidence: "HIGH" }],
      });
      const compare = makeSnapshot({
        stepResponses: [{ id: "r1", processStepId: "ps1", fitStatus: "GAP", clientNote: null, confidence: "LOW" }],
      });

      const delta = computeDeltaReport(base, compare);
      expect(delta.classificationChanges).toHaveLength(1);
      expect(delta.classificationChanges[0]?.changeType).toBe("modified");
      expect(delta.classificationChanges[0]?.previousFitStatus).toBe("FIT");
      expect(delta.classificationChanges[0]?.newFitStatus).toBe("GAP");
    });

    it("should detect added step responses", () => {
      const base = makeSnapshot({ stepResponses: [] });
      const compare = makeSnapshot({
        stepResponses: [{ id: "r1", processStepId: "ps1", fitStatus: "FIT", clientNote: null, confidence: null }],
      });

      const delta = computeDeltaReport(base, compare);
      expect(delta.classificationChanges).toHaveLength(1);
      expect(delta.classificationChanges[0]?.changeType).toBe("added");
    });

    it("should detect removed step responses", () => {
      const base = makeSnapshot({
        stepResponses: [{ id: "r1", processStepId: "ps1", fitStatus: "FIT", clientNote: null, confidence: null }],
      });
      const compare = makeSnapshot({ stepResponses: [] });

      const delta = computeDeltaReport(base, compare);
      expect(delta.classificationChanges).toHaveLength(1);
      expect(delta.classificationChanges[0]?.changeType).toBe("removed");
    });

    it("should detect gap resolution changes", () => {
      const base = makeSnapshot({
        gapResolutions: [
          { id: "g1", processStepId: "ps1", scopeItemId: "J60", resolutionType: "CONFIGURE", resolutionDescription: "test", priority: "high", riskCategory: "technical", clientApproved: false },
        ],
      });
      const compare = makeSnapshot({
        gapResolutions: [
          { id: "g1", processStepId: "ps1", scopeItemId: "J60", resolutionType: "BTP_EXT", resolutionDescription: "test", priority: "critical", riskCategory: "technical", clientApproved: true },
        ],
      });

      const delta = computeDeltaReport(base, compare);
      expect(delta.gapResolutionChanges).toHaveLength(1);
      expect(delta.gapResolutionChanges[0]?.changeType).toBe("modified");
      expect(delta.gapResolutionChanges[0]?.previousResolutionType).toBe("CONFIGURE");
      expect(delta.gapResolutionChanges[0]?.newResolutionType).toBe("BTP_EXT");
    });

    it("should detect added gap resolutions", () => {
      const base = makeSnapshot({ gapResolutions: [] });
      const compare = makeSnapshot({
        gapResolutions: [
          { id: "g1", processStepId: "ps1", scopeItemId: "J60", resolutionType: "FIT", resolutionDescription: "ok", priority: null, riskCategory: null, clientApproved: false },
        ],
      });

      const delta = computeDeltaReport(base, compare);
      expect(delta.gapResolutionChanges).toHaveLength(1);
      expect(delta.gapResolutionChanges[0]?.changeType).toBe("added");
    });

    it("should detect removed gap resolutions", () => {
      const base = makeSnapshot({
        gapResolutions: [
          { id: "g1", processStepId: "ps1", scopeItemId: "J60", resolutionType: "FIT", resolutionDescription: "ok", priority: null, riskCategory: null, clientApproved: false },
        ],
      });
      const compare = makeSnapshot({ gapResolutions: [] });

      const delta = computeDeltaReport(base, compare);
      expect(delta.gapResolutionChanges).toHaveLength(1);
      expect(delta.gapResolutionChanges[0]?.changeType).toBe("removed");
    });

    it("should detect integration changes", () => {
      const base = makeSnapshot({
        integrationPoints: [
          { id: "i1", name: "SAP CPI", direction: "OUTBOUND", sourceSystem: "SAP", targetSystem: "Salesforce", interfaceType: "API", status: "identified" },
        ],
      });
      const compare = makeSnapshot({
        integrationPoints: [
          { id: "i1", name: "SAP CPI", direction: "OUTBOUND", sourceSystem: "SAP", targetSystem: "Salesforce", interfaceType: "API", status: "approved" },
        ],
      });

      const delta = computeDeltaReport(base, compare);
      expect(delta.integrationChanges).toHaveLength(1);
      expect(delta.integrationChanges[0]?.changeType).toBe("modified");
    });

    it("should detect data migration changes", () => {
      const base = makeSnapshot({
        dataMigrationObjects: [
          { id: "d1", objectName: "Customers", objectType: "MASTER_DATA", sourceSystem: "Legacy", status: "identified" },
        ],
      });
      const compare = makeSnapshot({
        dataMigrationObjects: [
          { id: "d1", objectName: "Customers", objectType: "MASTER_DATA", sourceSystem: "Legacy", status: "validated" },
        ],
      });

      const delta = computeDeltaReport(base, compare);
      expect(delta.dataMigrationChanges).toHaveLength(1);
      expect(delta.dataMigrationChanges[0]?.changeType).toBe("modified");
    });

    it("should handle complex multi-category changes", () => {
      const base = makeSnapshot({
        scopeSelections: [
          { id: "s1", scopeItemId: "J60", selected: true, relevance: "YES", notes: null },
          { id: "s2", scopeItemId: "J61", selected: true, relevance: "YES", notes: null },
        ],
        stepResponses: [
          { id: "r1", processStepId: "ps1", fitStatus: "FIT", clientNote: null, confidence: null },
        ],
      });
      const compare = makeSnapshot({
        scopeSelections: [
          { id: "s1", scopeItemId: "J60", selected: false, relevance: "NO", notes: null },
          { id: "s3", scopeItemId: "J62", selected: true, relevance: "MAYBE", notes: null },
        ],
        stepResponses: [
          { id: "r1", processStepId: "ps1", fitStatus: "GAP", clientNote: null, confidence: null },
          { id: "r2", processStepId: "ps2", fitStatus: "CONFIGURE", clientNote: null, confidence: null },
        ],
      });

      const delta = computeDeltaReport(base, compare);
      expect(delta.scopeChanges).toHaveLength(3); // 1 modified, 1 removed, 1 added
      expect(delta.classificationChanges).toHaveLength(2); // 1 modified, 1 added
    });
  });

  describe("computeDeltaSummary", () => {
    it("should return all zeros for empty delta", () => {
      const delta = computeDeltaReport(makeSnapshot(), makeSnapshot());
      const summary = computeDeltaSummary(delta);
      expect(summary.totalChanges).toBe(0);
      expect(summary.scopeAdded).toBe(0);
      expect(summary.scopeRemoved).toBe(0);
      expect(summary.scopeModified).toBe(0);
    });

    it("should correctly count changes by type", () => {
      const base = makeSnapshot({
        scopeSelections: [
          { id: "s1", scopeItemId: "J60", selected: true, relevance: "YES", notes: null },
          { id: "s2", scopeItemId: "J61", selected: true, relevance: "YES", notes: null },
        ],
      });
      const compare = makeSnapshot({
        scopeSelections: [
          { id: "s1", scopeItemId: "J60", selected: false, relevance: "NO", notes: null },
          { id: "s3", scopeItemId: "J62", selected: true, relevance: "MAYBE", notes: null },
        ],
      });

      const delta = computeDeltaReport(base, compare);
      const summary = computeDeltaSummary(delta);

      expect(summary.scopeModified).toBe(1); // J60 modified
      expect(summary.scopeRemoved).toBe(1); // J61 removed
      expect(summary.scopeAdded).toBe(1); // J62 added
      expect(summary.totalChanges).toBe(3);
    });

    it("should count integration changes", () => {
      const base = makeSnapshot({
        integrationPoints: [
          { id: "i1", name: "API1", direction: "OUTBOUND", sourceSystem: "SAP", targetSystem: "CRM", interfaceType: "API", status: "identified" },
        ],
      });
      const compare = makeSnapshot({
        integrationPoints: [
          { id: "i1", name: "API1", direction: "OUTBOUND", sourceSystem: "SAP", targetSystem: "CRM", interfaceType: "API", status: "approved" },
          { id: "i2", name: "API2", direction: "INBOUND", sourceSystem: "CRM", targetSystem: "SAP", interfaceType: "ODATA", status: "identified" },
        ],
      });

      const delta = computeDeltaReport(base, compare);
      const summary = computeDeltaSummary(delta);
      expect(summary.integrationsModified).toBe(1);
      expect(summary.integrationsAdded).toBe(1);
    });
  });

  describe("computeImpactSummary", () => {
    it("should return low risk for few changes", () => {
      const entities: UnlockedEntity[] = [
        { entityType: "scope_selection", entityId: "s1", reason: "test" },
      ];
      const snapshot = makeSnapshot({
        statistics: {
          totalScopeItems: 100,
          selectedScopeItems: 50,
          totalSteps: 200,
          fitCount: 100,
          configureCount: 50,
          gapCount: 30,
          naCount: 10,
          pendingCount: 10,
          totalGapResolutions: 30,
          approvedGapResolutions: 20,
          integrationPointCount: 10,
          dataMigrationObjectCount: 5,
        },
      });

      const impact = computeImpactSummary(entities, snapshot);
      expect(impact.riskLevel).toBe("low");
      expect(impact.totalEntitiesAffected).toBe(1);
      expect(impact.scopeChanges).toBe(1);
    });

    it("should return critical risk for many changes", () => {
      const entities: UnlockedEntity[] = Array.from({ length: 60 }, (_, i) => ({
        entityType: "scope_selection" as const,
        entityId: `s${i}`,
        reason: "bulk change",
      }));
      const snapshot = makeSnapshot({
        statistics: {
          totalScopeItems: 100,
          selectedScopeItems: 100,
          totalSteps: 200,
          fitCount: 100,
          configureCount: 50,
          gapCount: 30,
          naCount: 10,
          pendingCount: 10,
          totalGapResolutions: 30,
          approvedGapResolutions: 20,
          integrationPointCount: 10,
          dataMigrationObjectCount: 5,
        },
      });

      const impact = computeImpactSummary(entities, snapshot);
      expect(impact.riskLevel).toBe("critical");
      expect(impact.totalEntitiesAffected).toBe(60);
    });

    it("should collect affected functional areas", () => {
      const entities: UnlockedEntity[] = [
        { entityType: "scope_selection", entityId: "s1", functionalArea: "Finance", reason: "test" },
        { entityType: "step_response", entityId: "r1", functionalArea: "HR", reason: "test" },
        { entityType: "scope_selection", entityId: "s2", functionalArea: "Finance", reason: "test" },
      ];
      const snapshot = makeSnapshot({
        statistics: {
          totalScopeItems: 100,
          selectedScopeItems: 50,
          totalSteps: 200,
          fitCount: 100,
          configureCount: 50,
          gapCount: 30,
          naCount: 10,
          pendingCount: 10,
          totalGapResolutions: 30,
          approvedGapResolutions: 20,
          integrationPointCount: 10,
          dataMigrationObjectCount: 5,
        },
      });

      const impact = computeImpactSummary(entities, snapshot);
      expect(impact.affectedFunctionalAreas).toContain("Finance");
      expect(impact.affectedFunctionalAreas).toContain("HR");
      expect(impact.affectedFunctionalAreas).toHaveLength(2); // deduplicated
    });

    it("should calculate estimated rework days", () => {
      const entities: UnlockedEntity[] = [
        { entityType: "scope_selection", entityId: "s1", reason: "test" },
        { entityType: "gap_resolution", entityId: "g1", reason: "test" },
        { entityType: "integration", entityId: "i1", reason: "test" },
      ];
      const snapshot = makeSnapshot({
        statistics: {
          totalScopeItems: 100,
          selectedScopeItems: 50,
          totalSteps: 200,
          fitCount: 100,
          configureCount: 50,
          gapCount: 30,
          naCount: 10,
          pendingCount: 10,
          totalGapResolutions: 30,
          approvedGapResolutions: 20,
          integrationPointCount: 10,
          dataMigrationObjectCount: 5,
        },
      });

      const impact = computeImpactSummary(entities, snapshot);
      // 1 scope * 0.5 + 1 gap * 1.0 + 1 integration * 2.0 = 3.5 -> ceil = 4
      expect(impact.estimatedReworkDays).toBe(4);
    });

    it("should count entity types correctly", () => {
      const entities: UnlockedEntity[] = [
        { entityType: "scope_selection", entityId: "s1", reason: "test" },
        { entityType: "scope_selection", entityId: "s2", reason: "test" },
        { entityType: "step_response", entityId: "r1", reason: "test" },
        { entityType: "gap_resolution", entityId: "g1", reason: "test" },
        { entityType: "integration", entityId: "i1", reason: "test" },
      ];
      const snapshot = makeSnapshot({
        statistics: {
          totalScopeItems: 100,
          selectedScopeItems: 50,
          totalSteps: 200,
          fitCount: 100,
          configureCount: 50,
          gapCount: 30,
          naCount: 10,
          pendingCount: 10,
          totalGapResolutions: 30,
          approvedGapResolutions: 20,
          integrationPointCount: 10,
          dataMigrationObjectCount: 5,
        },
      });

      const impact = computeImpactSummary(entities, snapshot);
      expect(impact.scopeChanges).toBe(2);
      expect(impact.classificationChanges).toBe(1);
      expect(impact.gapResolutionChanges).toBe(1);
      expect(impact.integrationChanges).toBe(1);
    });
  });
});
