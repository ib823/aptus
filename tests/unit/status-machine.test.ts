import { describe, it, expect } from "vitest";
import {
  ASSESSMENT_STATUSES_V2,
  VALID_TRANSITIONS_V2,
  TRANSITION_ROLES_V2,
  V1_TO_V2_STATUS_MAP,
  PHASE_PREREQUISITES,
  canTransition,
  getAvailableTransitions,
  STATUS_LABELS,
  STATUS_COLORS,
} from "@/lib/assessment/status-machine";
// AssessmentStatusV2 type available from "@/types/assessment"

describe("Status Machine (Phase 18)", () => {
  describe("ASSESSMENT_STATUSES_V2", () => {
    it("should contain all 12 statuses", () => {
      expect(ASSESSMENT_STATUSES_V2).toHaveLength(12);
    });

    it("should start with draft and end with archived", () => {
      expect(ASSESSMENT_STATUSES_V2[0]).toBe("draft");
      expect(ASSESSMENT_STATUSES_V2[ASSESSMENT_STATUSES_V2.length - 1]).toBe("archived");
    });
  });

  describe("VALID_TRANSITIONS_V2", () => {
    it("should have entries for all 12 statuses", () => {
      expect(Object.keys(VALID_TRANSITIONS_V2)).toHaveLength(12);
      for (const status of ASSESSMENT_STATUSES_V2) {
        expect(VALID_TRANSITIONS_V2[status]).toBeDefined();
      }
    });

    it("draft can only go to scoping", () => {
      expect(VALID_TRANSITIONS_V2.draft).toEqual(["scoping"]);
    });

    it("scoping can go to in_progress or back to draft", () => {
      expect(VALID_TRANSITIONS_V2.scoping).toContain("in_progress");
      expect(VALID_TRANSITIONS_V2.scoping).toContain("draft");
    });

    it("in_progress can branch to workshop_active, review_cycle, gap_resolution, or back to scoping", () => {
      expect(VALID_TRANSITIONS_V2.in_progress).toContain("workshop_active");
      expect(VALID_TRANSITIONS_V2.in_progress).toContain("review_cycle");
      expect(VALID_TRANSITIONS_V2.in_progress).toContain("gap_resolution");
      expect(VALID_TRANSITIONS_V2.in_progress).toContain("scoping");
    });

    it("archived has no valid transitions (terminal state)", () => {
      expect(VALID_TRANSITIONS_V2.archived).toEqual([]);
    });

    it("signed_off can go to handed_off or archived", () => {
      expect(VALID_TRANSITIONS_V2.signed_off).toContain("handed_off");
      expect(VALID_TRANSITIONS_V2.signed_off).toContain("archived");
    });
  });

  describe("TRANSITION_ROLES_V2", () => {
    it("should have role entries for every valid transition", () => {
      for (const [from, targets] of Object.entries(VALID_TRANSITIONS_V2)) {
        for (const to of targets) {
          const key = `${from}->${to}`;
          const roles = TRANSITION_ROLES_V2[key];
          expect(roles).toBeDefined();
          expect(roles!.length).toBeGreaterThan(0);
        }
      }
    });

    it("only platform_admin can archive from signed_off", () => {
      expect(TRANSITION_ROLES_V2["signed_off->archived"]).toEqual(["platform_admin"]);
    });

    it("executive_sponsor can sign off", () => {
      expect(TRANSITION_ROLES_V2["pending_sign_off->signed_off"]).toContain("executive_sponsor");
    });

    it("solution_architect can start/end workshops", () => {
      expect(TRANSITION_ROLES_V2["in_progress->workshop_active"]).toContain("solution_architect");
      expect(TRANSITION_ROLES_V2["workshop_active->in_progress"]).toContain("solution_architect");
    });
  });

  describe("canTransition", () => {
    it("should allow valid transitions with correct role", () => {
      const result = canTransition("draft", "scoping", "consultant");
      expect(result.allowed).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it("should reject invalid transition paths", () => {
      const result = canTransition("draft", "signed_off", "platform_admin");
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("Invalid transition");
    });

    it("should reject transitions from archived (terminal state)", () => {
      const result = canTransition("archived", "draft", "platform_admin");
      expect(result.allowed).toBe(false);
    });

    it("should reject transitions with unauthorized role", () => {
      const result = canTransition("draft", "scoping", "viewer");
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("Role viewer cannot perform");
    });

    it("should reject process_owner from any transition", () => {
      const result = canTransition("draft", "scoping", "process_owner");
      expect(result.allowed).toBe(false);
    });

    it("should allow executive_sponsor to sign off", () => {
      const result = canTransition("pending_sign_off", "signed_off", "executive_sponsor");
      expect(result.allowed).toBe(true);
    });

    it("should reject executive_sponsor from non-sign-off transitions", () => {
      const result = canTransition("draft", "scoping", "executive_sponsor");
      expect(result.allowed).toBe(false);
    });

    it("should handle legacy role names via mapLegacyRole", () => {
      // "admin" maps to "platform_admin"
      const result = canTransition("draft", "scoping", "admin");
      expect(result.allowed).toBe(true);
    });

    it("should handle legacy executive role", () => {
      // "executive" maps to "executive_sponsor"
      const result = canTransition("pending_sign_off", "signed_off", "executive");
      expect(result.allowed).toBe(true);
    });

    it("should allow partner_lead to transition scoping to in_progress", () => {
      const result = canTransition("scoping", "in_progress", "partner_lead");
      expect(result.allowed).toBe(true);
    });

    it("should allow consultant to move through middle lifecycle", () => {
      expect(canTransition("in_progress", "gap_resolution", "consultant").allowed).toBe(true);
      expect(canTransition("gap_resolution", "pending_validation", "consultant").allowed).toBe(true);
    });
  });

  describe("getAvailableTransitions", () => {
    it("should return available transitions for platform_admin at draft", () => {
      const transitions = getAvailableTransitions("draft", "platform_admin");
      expect(transitions).toEqual(["scoping"]);
    });

    it("should return multiple options for platform_admin at in_progress", () => {
      const transitions = getAvailableTransitions("in_progress", "platform_admin");
      expect(transitions).toContain("workshop_active");
      expect(transitions).toContain("review_cycle");
      expect(transitions).toContain("gap_resolution");
      expect(transitions).toContain("scoping");
    });

    it("should return empty array for viewer at any status", () => {
      for (const status of ASSESSMENT_STATUSES_V2) {
        expect(getAvailableTransitions(status, "viewer")).toEqual([]);
      }
    });

    it("should return empty array for archived status", () => {
      expect(getAvailableTransitions("archived", "platform_admin")).toEqual([]);
    });

    it("should support legacy admin role", () => {
      const transitions = getAvailableTransitions("draft", "admin");
      expect(transitions).toEqual(["scoping"]);
    });

    it("should limit solution_architect to workshop transitions from in_progress", () => {
      const transitions = getAvailableTransitions("in_progress", "solution_architect");
      expect(transitions).toContain("workshop_active");
      expect(transitions).not.toContain("review_cycle");
      expect(transitions).not.toContain("gap_resolution");
    });

    it("should allow executive_sponsor only sign-off transition", () => {
      const transitions = getAvailableTransitions("pending_sign_off", "executive_sponsor");
      expect(transitions).toEqual(["signed_off"]);
    });
  });

  describe("V1_TO_V2_STATUS_MAP", () => {
    it("should map all 5 V1 statuses", () => {
      expect(Object.keys(V1_TO_V2_STATUS_MAP)).toHaveLength(5);
    });

    it("should map draft to draft", () => {
      expect(V1_TO_V2_STATUS_MAP.draft).toBe("draft");
    });

    it("should map in_progress to in_progress", () => {
      expect(V1_TO_V2_STATUS_MAP.in_progress).toBe("in_progress");
    });

    it("should map completed to pending_validation", () => {
      expect(V1_TO_V2_STATUS_MAP.completed).toBe("pending_validation");
    });

    it("should map reviewed to validated", () => {
      expect(V1_TO_V2_STATUS_MAP.reviewed).toBe("validated");
    });

    it("should map signed_off to signed_off", () => {
      expect(V1_TO_V2_STATUS_MAP.signed_off).toBe("signed_off");
    });
  });

  describe("PHASE_PREREQUISITES", () => {
    it("scoping has no prerequisites", () => {
      expect(PHASE_PREREQUISITES.scoping).toEqual([]);
    });

    it("process_review requires scoping", () => {
      expect(PHASE_PREREQUISITES.process_review).toContain("scoping");
    });

    it("gap_resolution requires process_review", () => {
      expect(PHASE_PREREQUISITES.gap_resolution).toContain("process_review");
    });

    it("validation requires both process_review and gap_resolution", () => {
      expect(PHASE_PREREQUISITES.validation).toContain("process_review");
      expect(PHASE_PREREQUISITES.validation).toContain("gap_resolution");
    });

    it("sign_off requires validation", () => {
      expect(PHASE_PREREQUISITES.sign_off).toContain("validation");
    });

    it("integration, data_migration, ocm only require scoping", () => {
      expect(PHASE_PREREQUISITES.integration).toEqual(["scoping"]);
      expect(PHASE_PREREQUISITES.data_migration).toEqual(["scoping"]);
      expect(PHASE_PREREQUISITES.ocm).toEqual(["scoping"]);
    });
  });

  describe("STATUS_LABELS", () => {
    it("should have labels for all 12 statuses", () => {
      for (const status of ASSESSMENT_STATUSES_V2) {
        expect(STATUS_LABELS[status]).toBeDefined();
        expect(typeof STATUS_LABELS[status]).toBe("string");
        expect(STATUS_LABELS[status].length).toBeGreaterThan(0);
      }
    });
  });

  describe("STATUS_COLORS", () => {
    it("should have colors for all 12 statuses", () => {
      for (const status of ASSESSMENT_STATUSES_V2) {
        expect(STATUS_COLORS[status]).toBeDefined();
        expect(typeof STATUS_COLORS[status]).toBe("string");
      }
    });
  });
});
