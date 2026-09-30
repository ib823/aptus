import { describe, expect, it, vi } from "vitest";
import type { SessionUser } from "@/types/assessment";
import { canViewRestrictedScope } from "@/lib/product-scope/access";

const findUnique = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db/prisma", () => ({ prisma: { productScopeItem: { findUnique } } }));

import { getScopeDetail } from "@/lib/product-scope/detail";

const admin = { role: "platform_admin", mfaVerified: true } as SessionUser;

describe("partner scope access", () => {
  it("requires an ABeam admin whose MFA policy is satisfied", () => {
    expect(canViewRestrictedScope(null)).toBe(false);
    expect(canViewRestrictedScope({ ...admin, role: "consultant" })).toBe(false);
    expect(canViewRestrictedScope({ ...admin, mfaVerified: false, organizationMfaPolicy: "required" })).toBe(false);
    expect(canViewRestrictedScope(admin)).toBe(true);
  });

  it("does not return restricted details to ordinary catalog readers", async () => {
    findUnique.mockResolvedValue({
      id: "partner-1", productKey: "ARIBA", solutionKey: "INVOICE", release: "2602",
      scopeCode: "P1", title: "Invoice", scopeKind: "PROCESS", visibility: "ABEAM_ADMIN",
      description: null, sourceUrl: "https://me.sap.com/processnavigator/example",
      sourceKind: "PARTNER_EXPORT", processSourceUrl: null, configSourceUrl: null,
      processSteps: [], configQuestions: [],
    });
    expect(await getScopeDetail("product", "partner-1")).toBeNull();
    expect((await getScopeDetail("product", "partner-1", true))?.code).toBe("P1");
  });
});
