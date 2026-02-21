import { describe, it, expect } from "vitest";
import {
  canTransitionSignOff,
  getAvailableTransitions,
  isTerminalState,
  getRequiredRole,
} from "@/lib/signoff/state-machine";
import { SIGNOFF_TRANSITIONS, SIGNOFF_STATUSES } from "@/types/signoff";
import type { SignOffStatus } from "@/types/signoff";

describe("Sign-Off State Machine (Phase 30)", () => {
  describe("SIGNOFF_TRANSITIONS", () => {
    it("should have entries for all 12 statuses", () => {
      expect(Object.keys(SIGNOFF_TRANSITIONS)).toHaveLength(12);
      for (const status of SIGNOFF_STATUSES) {
        expect(SIGNOFF_TRANSITIONS[status]).toBeDefined();
      }
    });
  });

  describe("canTransitionSignOff", () => {
    it("should allow VALIDATION_NOT_STARTED to AREA_VALIDATION_IN_PROGRESS", () => {
      expect(canTransitionSignOff("VALIDATION_NOT_STARTED", "AREA_VALIDATION_IN_PROGRESS")).toBe(true);
    });

    it("should reject VALIDATION_NOT_STARTED to COMPLETED directly", () => {
      expect(canTransitionSignOff("VALIDATION_NOT_STARTED", "COMPLETED")).toBe(false);
    });

    it("should allow AREA_VALIDATION_IN_PROGRESS to AREA_VALIDATION_COMPLETE", () => {
      expect(canTransitionSignOff("AREA_VALIDATION_IN_PROGRESS", "AREA_VALIDATION_COMPLETE")).toBe(true);
    });

    it("should allow AREA_VALIDATION_IN_PROGRESS to REJECTED", () => {
      expect(canTransitionSignOff("AREA_VALIDATION_IN_PROGRESS", "REJECTED")).toBe(true);
    });

    it("should allow AREA_VALIDATION_COMPLETE to TECHNICAL_VALIDATION_IN_PROGRESS", () => {
      expect(canTransitionSignOff("AREA_VALIDATION_COMPLETE", "TECHNICAL_VALIDATION_IN_PROGRESS")).toBe(true);
    });

    it("should allow TECHNICAL_VALIDATION_IN_PROGRESS to TECHNICAL_VALIDATION_COMPLETE", () => {
      expect(canTransitionSignOff("TECHNICAL_VALIDATION_IN_PROGRESS", "TECHNICAL_VALIDATION_COMPLETE")).toBe(true);
    });

    it("should allow TECHNICAL_VALIDATION_IN_PROGRESS to REJECTED", () => {
      expect(canTransitionSignOff("TECHNICAL_VALIDATION_IN_PROGRESS", "REJECTED")).toBe(true);
    });

    it("should allow TECHNICAL_VALIDATION_COMPLETE to CROSS_FUNCTIONAL_VALIDATION_IN_PROGRESS", () => {
      expect(canTransitionSignOff("TECHNICAL_VALIDATION_COMPLETE", "CROSS_FUNCTIONAL_VALIDATION_IN_PROGRESS")).toBe(true);
    });

    it("should allow CROSS_FUNCTIONAL_VALIDATION_IN_PROGRESS to CROSS_FUNCTIONAL_VALIDATION_COMPLETE", () => {
      expect(canTransitionSignOff("CROSS_FUNCTIONAL_VALIDATION_IN_PROGRESS", "CROSS_FUNCTIONAL_VALIDATION_COMPLETE")).toBe(true);
    });

    it("should allow CROSS_FUNCTIONAL_VALIDATION_COMPLETE to EXECUTIVE_SIGN_OFF_PENDING", () => {
      expect(canTransitionSignOff("CROSS_FUNCTIONAL_VALIDATION_COMPLETE", "EXECUTIVE_SIGN_OFF_PENDING")).toBe(true);
    });

    it("should allow EXECUTIVE_SIGN_OFF_PENDING to EXECUTIVE_SIGNED", () => {
      expect(canTransitionSignOff("EXECUTIVE_SIGN_OFF_PENDING", "EXECUTIVE_SIGNED")).toBe(true);
    });

    it("should allow EXECUTIVE_SIGN_OFF_PENDING to REJECTED", () => {
      expect(canTransitionSignOff("EXECUTIVE_SIGN_OFF_PENDING", "REJECTED")).toBe(true);
    });

    it("should allow EXECUTIVE_SIGNED to PARTNER_COUNTERSIGN_PENDING", () => {
      expect(canTransitionSignOff("EXECUTIVE_SIGNED", "PARTNER_COUNTERSIGN_PENDING")).toBe(true);
    });

    it("should allow PARTNER_COUNTERSIGN_PENDING to COMPLETED", () => {
      expect(canTransitionSignOff("PARTNER_COUNTERSIGN_PENDING", "COMPLETED")).toBe(true);
    });

    it("should allow PARTNER_COUNTERSIGN_PENDING to REJECTED", () => {
      expect(canTransitionSignOff("PARTNER_COUNTERSIGN_PENDING", "REJECTED")).toBe(true);
    });

    it("should allow REJECTED to VALIDATION_NOT_STARTED (restart)", () => {
      expect(canTransitionSignOff("REJECTED", "VALIDATION_NOT_STARTED")).toBe(true);
    });

    it("should reject transition from COMPLETED (terminal)", () => {
      expect(canTransitionSignOff("COMPLETED", "VALIDATION_NOT_STARTED")).toBe(false);
      expect(canTransitionSignOff("COMPLETED", "REJECTED")).toBe(false);
    });

    it("should reject skipping steps", () => {
      expect(canTransitionSignOff("VALIDATION_NOT_STARTED", "TECHNICAL_VALIDATION_IN_PROGRESS")).toBe(false);
      expect(canTransitionSignOff("AREA_VALIDATION_IN_PROGRESS", "EXECUTIVE_SIGNED")).toBe(false);
    });

    it("should reject backward transitions in the middle", () => {
      expect(canTransitionSignOff("TECHNICAL_VALIDATION_IN_PROGRESS", "AREA_VALIDATION_IN_PROGRESS")).toBe(false);
    });

    it("should reject self-transitions", () => {
      expect(canTransitionSignOff("AREA_VALIDATION_IN_PROGRESS", "AREA_VALIDATION_IN_PROGRESS")).toBe(false);
    });
  });

  describe("getAvailableTransitions", () => {
    it("should return single target for VALIDATION_NOT_STARTED", () => {
      const transitions = getAvailableTransitions("VALIDATION_NOT_STARTED");
      expect(transitions).toEqual(["AREA_VALIDATION_IN_PROGRESS"]);
    });

    it("should return two targets for AREA_VALIDATION_IN_PROGRESS (complete or reject)", () => {
      const transitions = getAvailableTransitions("AREA_VALIDATION_IN_PROGRESS");
      expect(transitions).toHaveLength(2);
      expect(transitions).toContain("AREA_VALIDATION_COMPLETE");
      expect(transitions).toContain("REJECTED");
    });

    it("should return empty array for COMPLETED", () => {
      const transitions = getAvailableTransitions("COMPLETED");
      expect(transitions).toEqual([]);
    });

    it("should return restart option for REJECTED", () => {
      const transitions = getAvailableTransitions("REJECTED");
      expect(transitions).toContain("VALIDATION_NOT_STARTED");
    });

    it("should handle all statuses without errors", () => {
      for (const status of SIGNOFF_STATUSES) {
        const transitions = getAvailableTransitions(status);
        expect(Array.isArray(transitions)).toBe(true);
      }
    });
  });

  describe("isTerminalState", () => {
    it("should return true for COMPLETED", () => {
      expect(isTerminalState("COMPLETED")).toBe(true);
    });

    it("should return false for REJECTED (can restart)", () => {
      expect(isTerminalState("REJECTED")).toBe(false);
    });

    it("should return false for VALIDATION_NOT_STARTED", () => {
      expect(isTerminalState("VALIDATION_NOT_STARTED")).toBe(false);
    });

    it("should return false for all in-progress statuses", () => {
      const inProgressStatuses: SignOffStatus[] = [
        "AREA_VALIDATION_IN_PROGRESS",
        "TECHNICAL_VALIDATION_IN_PROGRESS",
        "CROSS_FUNCTIONAL_VALIDATION_IN_PROGRESS",
        "EXECUTIVE_SIGN_OFF_PENDING",
        "PARTNER_COUNTERSIGN_PENDING",
      ];
      for (const status of inProgressStatuses) {
        expect(isTerminalState(status)).toBe(false);
      }
    });
  });

  describe("getRequiredRole", () => {
    it("should return consultant for VALIDATION_NOT_STARTED", () => {
      expect(getRequiredRole("VALIDATION_NOT_STARTED")).toBe("consultant");
    });

    it("should return process_owner for AREA_VALIDATION_IN_PROGRESS", () => {
      expect(getRequiredRole("AREA_VALIDATION_IN_PROGRESS")).toBe("process_owner");
    });

    it("should return it_lead for TECHNICAL_VALIDATION_IN_PROGRESS", () => {
      expect(getRequiredRole("TECHNICAL_VALIDATION_IN_PROGRESS")).toBe("it_lead");
    });

    it("should return solution_architect for CROSS_FUNCTIONAL_VALIDATION_IN_PROGRESS", () => {
      expect(getRequiredRole("CROSS_FUNCTIONAL_VALIDATION_IN_PROGRESS")).toBe("solution_architect");
    });

    it("should return executive_sponsor for EXECUTIVE_SIGN_OFF_PENDING", () => {
      expect(getRequiredRole("EXECUTIVE_SIGN_OFF_PENDING")).toBe("executive_sponsor");
    });

    it("should return partner_lead for PARTNER_COUNTERSIGN_PENDING", () => {
      expect(getRequiredRole("PARTNER_COUNTERSIGN_PENDING")).toBe("partner_lead");
    });

    it("should return null for COMPLETED", () => {
      expect(getRequiredRole("COMPLETED")).toBeNull();
    });

    it("should return null for REJECTED", () => {
      expect(getRequiredRole("REJECTED")).toBeNull();
    });
  });
});
