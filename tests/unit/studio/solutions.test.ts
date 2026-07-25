/**
 * The ownership gate.
 *
 * What it protects against is not a careless click: it is an ACTIVE solution
 * touching a client's SAP system with nobody named to answer for it. Both
 * directions are tested — refusing a promotion, and catching a solution that
 * loses an owner AFTER it went active, which is the case that actually happens
 * in the wild (people leave projects; nobody re-reads the passport).
 */

import { describe, expect, it } from "vitest";

import {
  evaluatePromotion,
  hasCompleteOwnership,
  isOrphaningAnActiveSolution,
  missingOwners,
  resolveStatusOnSave,
  slugify,
  type Ownership,
} from "@/lib/studio/solutions";

const COMPLETE: Ownership = {
  technicalOwnerId: "u_tech",
  businessOwnerId: "u_biz",
  supportOwnerId: "u_sup",
};

describe("complete ownership", () => {
  it("requires all three roles", () => {
    expect(hasCompleteOwnership(COMPLETE)).toBe(true);
  });

  it("is false when any single role is missing", () => {
    for (const key of ["technicalOwnerId", "businessOwnerId", "supportOwnerId"] as const) {
      expect(hasCompleteOwnership({ ...COMPLETE, [key]: null }), `${key} missing`).toBe(false);
    }
  });

  it("treats an empty string as unassigned, not as an owner", () => {
    // A blank form field must not satisfy accountability.
    expect(hasCompleteOwnership({ ...COMPLETE, technicalOwnerId: "" })).toBe(false);
  });

  it("names precisely which roles are missing", () => {
    expect(missingOwners({ technicalOwnerId: null, businessOwnerId: "b", supportOwnerId: null })).toEqual([
      "technical owner",
      "support owner",
    ]);
    expect(missingOwners(COMPLETE)).toEqual([]);
  });
});

describe("promotion is refused, not silently downgraded", () => {
  it("allows promotion with all three owners", () => {
    expect(evaluatePromotion(COMPLETE).ok).toBe(true);
  });

  it("refuses promotion when an owner is missing, and says which", () => {
    const r = evaluatePromotion({ ...COMPLETE, supportOwnerId: null });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toContain("support owner");
      // A promotion that quietly did not happen is worse than one clearly declined.
      expect(r.reason).toContain("cannot be ACTIVE");
    }
  });

  it("refuses when nobody is assigned at all", () => {
    const r = evaluatePromotion({ technicalOwnerId: null, businessOwnerId: null, supportOwnerId: null });
    expect(r.ok).toBe(false);
  });
});

describe("an active solution that loses an owner drops to RESTRICTED", () => {
  it("detects the orphaning case", () => {
    expect(
      isOrphaningAnActiveSolution("ACTIVE", "ACTIVE", { ...COMPLETE, businessOwnerId: null }),
    ).toBe(true);
  });

  it("is not orphaning when ownership stays complete", () => {
    expect(isOrphaningAnActiveSolution("ACTIVE", "ACTIVE", COMPLETE)).toBe(false);
  });

  it("is not orphaning when the solution was not ACTIVE to begin with", () => {
    // A DRAFT with no owners is a normal starting point, not a violation.
    expect(
      isOrphaningAnActiveSolution("DRAFT", "DRAFT", { technicalOwnerId: null, businessOwnerId: null, supportOwnerId: null }),
    ).toBe(false);
  });

  it("resolves the save to RESTRICTED with a reason naming the gap", () => {
    const r = resolveStatusOnSave("ACTIVE", { ...COMPLETE, technicalOwnerId: null });
    expect(r.status).toBe("RESTRICTED");
    expect(r.autoDropped).toBe(true);
    if (r.autoDropped) expect(r.reason).toContain("technical owner");
  });

  it("leaves a complete ACTIVE solution alone", () => {
    const r = resolveStatusOnSave("ACTIVE", COMPLETE);
    expect(r.status).toBe("ACTIVE");
    expect(r.autoDropped).toBe(false);
  });
});

describe("ownership does not police DRAFT or RETIRED", () => {
  it("lets a DRAFT exist with no owners", () => {
    const r = resolveStatusOnSave("DRAFT", { technicalOwnerId: null, businessOwnerId: null, supportOwnerId: null });
    expect(r.status).toBe("DRAFT");
    expect(r.autoDropped).toBe(false);
  });

  it("lets a RETIRED solution keep no owners", () => {
    // A retired solution with no owners is a finished thing, not a problem.
    const r = resolveStatusOnSave("RETIRED", { technicalOwnerId: null, businessOwnerId: null, supportOwnerId: null });
    expect(r.status).toBe("RETIRED");
  });

  it("does not force a RESTRICTED solution back up or further down", () => {
    const r = resolveStatusOnSave("RESTRICTED", { ...COMPLETE, supportOwnerId: null });
    expect(r.status).toBe("RESTRICTED");
    expect(r.autoDropped).toBe(false);
  });
});

describe("slugify", () => {
  it("produces a URL-safe slug", () => {
    expect(slugify("Finance Accelerator")).toBe("finance-accelerator");
    expect(slugify("  S/4 HANA — Migration!  ")).toBe("s-4-hana-migration");
  });

  it("collapses runs and trims stray hyphens", () => {
    expect(slugify("a---b")).toBe("a-b");
    expect(slugify("!!!edge!!!")).toBe("edge");
  });

  it("returns empty for a name with nothing usable", () => {
    // The caller refuses the save rather than inventing an identifier.
    expect(slugify("!!!")).toBe("");
  });

  it("bounds the length", () => {
    expect(slugify("x".repeat(200)).length).toBeLessThanOrEqual(60);
  });
});
