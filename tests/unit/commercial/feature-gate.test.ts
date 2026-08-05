/**
 * The plan entitlement gate.
 *
 * plan-engine.ts has its own tests; what matters here is the enforcement
 * seam — that an organization's stored plan actually decides the answer, and
 * that the internal-test escape hatch cannot leak into a customer deploy
 * (it requires the exact string "true").
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  orgFindUniqueOrThrow: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    organization: { findUniqueOrThrow: mocks.orgFindUniqueOrThrow },
  },
}));

import { checkFeatureAccess, isOrgReadOnly } from "@/lib/commercial/feature-gate";

describe("checkFeatureAccess", () => {
  beforeEach(() => {
    mocks.orgFindUniqueOrThrow.mockReset();
    delete process.env.INTERNAL_TEST_DEPLOYMENT;
  });

  afterEach(() => {
    delete process.env.INTERNAL_TEST_DEPLOYMENT;
  });

  it("denies a feature the org's tier does not include", async () => {
    mocks.orgFindUniqueOrThrow.mockResolvedValue({ plan: "TRIAL" });
    const result = await checkFeatureAccess("org1", "analytics");
    expect(result).toEqual({ allowed: false, plan: "TRIAL", feature: "analytics" });
  });

  it("allows a feature the org's tier includes", async () => {
    mocks.orgFindUniqueOrThrow.mockResolvedValue({ plan: "PROFESSIONAL" });
    const result = await checkFeatureAccess("org1", "analytics");
    expect(result.allowed).toBe(true);
  });

  it("grants everything on an internal test deployment", async () => {
    process.env.INTERNAL_TEST_DEPLOYMENT = "true";
    mocks.orgFindUniqueOrThrow.mockResolvedValue({ plan: "TRIAL" });
    const result = await checkFeatureAccess("org1", "sso_scim");
    expect(result.allowed).toBe(true);
  });

  it("does not treat a truthy-but-wrong flag value as internal", async () => {
    process.env.INTERNAL_TEST_DEPLOYMENT = "1";
    mocks.orgFindUniqueOrThrow.mockResolvedValue({ plan: "TRIAL" });
    const result = await checkFeatureAccess("org1", "sso_scim");
    expect(result.allowed).toBe(false);
  });
});

describe("isOrgReadOnly", () => {
  it("marks expired and canceled orgs read-only, and no one else", () => {
    expect(isOrgReadOnly("TRIAL_EXPIRED")).toBe(true);
    expect(isOrgReadOnly("CANCELED")).toBe(true);
    expect(isOrgReadOnly("TRIALING")).toBe(false);
    expect(isOrgReadOnly("ACTIVE")).toBe(false);
    expect(isOrgReadOnly("PAST_DUE")).toBe(false);
  });
});
