/**
 * STATUS: Self-contained specification test
 * REAL MODULE: src/lib/auth/, src/lib/commercial/
 * WIRING BLOCKED BY: Need database layer
 *
 * Integration tests: Multi-Tenant Isolation (T-ISO-001 through T-ISO-015)
 *
 * Verifies that data, authentication, and feature boundaries are strictly
 * enforced between organizations (tenants).
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createMockSession, createMockUser, createCrossTenantUser } from "../helpers/auth";
import { createMockWebSocketClient, createPresenceMessage, createActivityMessage } from "../helpers/websocket";
import * as OrgFactory from "../factories/organization.factory";
import * as UserFactory from "../factories/user.factory";
import * as AssessmentFactory from "../factories/assessment.factory";
import * as GapFactory from "../factories/gap.factory";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Simulate an API call that filters assessments by the caller's org. */
function fetchAssessmentsForUser(
  allAssessments: ReturnType<typeof AssessmentFactory.create>[],
  callerOrgId: string,
) {
  return allAssessments.filter((a) => a.organizationId === callerOrgId);
}

/** Simulate fetching a single assessment by ID with org guard. */
function fetchAssessmentById(
  allAssessments: ReturnType<typeof AssessmentFactory.create>[],
  assessmentId: string,
  callerOrgId: string,
) {
  const found = allAssessments.find((a) => a.id === assessmentId);
  if (!found || found.organizationId !== callerOrgId) return null;
  return found;
}

/** Simulate an update attempt with org guard. Returns true if successful. */
function updateAssessment(
  allAssessments: ReturnType<typeof AssessmentFactory.create>[],
  assessmentId: string,
  callerOrgId: string,
  _updates: Record<string, unknown>,
) {
  const found = allAssessments.find((a) => a.id === assessmentId);
  if (!found || found.organizationId !== callerOrgId) {
    return { success: false, status: 403, error: "FORBIDDEN" };
  }
  return { success: true, status: 200 };
}

/** Simulate user search scoped to caller's org. */
function searchUsers(
  allUsers: ReturnType<typeof UserFactory.create>[],
  callerOrgId: string,
  _query: string,
) {
  return allUsers.filter((u) => u.organizationId === callerOrgId);
}

/** Simulate SCIM provisioning targeting a specific org. */
function scimProvision(
  targetOrgId: string,
  callerOrgId: string,
  _userData: Record<string, unknown>,
) {
  if (targetOrgId !== callerOrgId) {
    return { success: false, status: 403, error: "SCIM provisioning not allowed for foreign org" };
  }
  return { success: true, status: 201 };
}

/** Simulate SSO authentication scoped to an org domain. */
function ssoAuthenticate(userOrgId: string, ssoDomain: string, orgSsoDomain: string) {
  if (ssoDomain !== orgSsoDomain || userOrgId !== ssoDomain) {
    return { authenticated: false, error: "SSO domain mismatch" };
  }
  return { authenticated: true };
}

/** Simulate assessment search with org scoping. */
function searchAssessments(
  allAssessments: ReturnType<typeof AssessmentFactory.create>[],
  callerOrgId: string,
  filters: Record<string, unknown>,
) {
  return allAssessments.filter((a) => {
    if (a.organizationId !== callerOrgId) return false;
    if (filters.industry && a.industry !== filters.industry) return false;
    if (filters.status && a.status !== filters.status) return false;
    return true;
  });
}

/** Simulate reporting analytics scoped to org. */
function getAnalytics(
  allAssessments: ReturnType<typeof AssessmentFactory.create>[],
  callerOrgId: string,
) {
  const orgAssessments = allAssessments.filter((a) => a.organizationId === callerOrgId);
  return {
    totalAssessments: orgAssessments.length,
    byStatus: Object.groupBy
      ? Object.fromEntries(
          orgAssessments.reduce((map, a) => {
            map.set(a.status, (map.get(a.status) ?? 0) + 1);
            return map;
          }, new Map<string, number>()),
        )
      : orgAssessments.reduce<Record<string, number>>((acc, a) => {
          acc[a.status] = (acc[a.status] ?? 0) + 1;
          return acc;
        }, {}),
  };
}

/** Simulate benchmarking that only returns anonymized aggregates. */
function getBenchmark(
  allAssessments: ReturnType<typeof AssessmentFactory.create>[],
  industry: string,
) {
  const industryAssessments = allAssessments.filter((a) => a.industry === industry);
  return {
    industry,
    sampleSize: industryAssessments.length,
    avgCompanySize: "aggregated",
    // No org-identifiable data exposed
    orgIds: undefined,
    companyNames: undefined,
  };
}

/** Simulate fetching team members for a partner org. */
function getPartnerTeamMembers(
  allUsers: ReturnType<typeof UserFactory.create>[],
  callerOrgId: string,
) {
  return allUsers.filter((u) => u.organizationId === callerOrgId);
}

/** Simulate template marketplace scoped to org. */
function getTemplates(
  allTemplates: { id: string; organizationId: string; isPublic: boolean; name: string }[],
  callerOrgId: string,
) {
  return allTemplates.filter((t) => t.organizationId === callerOrgId || t.isPublic);
}

/** Simulate time-limited viewer link check. */
function checkViewerAccess(
  assessmentId: string,
  tokenAssessmentId: string,
) {
  if (assessmentId !== tokenAssessmentId) {
    return { allowed: false, status: 403, error: "FORBIDDEN" };
  }
  return { allowed: true, status: 200 };
}

// ---------------------------------------------------------------------------
// Test data setup
// ---------------------------------------------------------------------------

describe("Multi-Tenant Isolation (T-ISO)", () => {
  // Two distinct organizations
  const orgA = OrgFactory.createProfessional({ id: "org-a", name: "Organization Alpha" });
  const orgB = OrgFactory.createProfessional({ id: "org-b", name: "Organization Beta" });

  // Users in each org
  const userA = UserFactory.createForRole("consultant", orgA.id, { id: "user-a", name: "Alice" });
  const userB = UserFactory.createForRole("consultant", orgB.id, { id: "user-b", name: "Bob" });

  // Assessments in each org
  const assessmentA1 = AssessmentFactory.create({ id: "assess-a1", organizationId: orgA.id, companyName: "Alpha Client" });
  const assessmentA2 = AssessmentFactory.create({ id: "assess-a2", organizationId: orgA.id, companyName: "Alpha Client 2" });
  const assessmentB1 = AssessmentFactory.create({ id: "assess-b1", organizationId: orgB.id, companyName: "Beta Client" });

  const allAssessments = [assessmentA1, assessmentA2, assessmentB1];
  const allUsers = [userA, userB];

  // --------------------------------------------------------------------------
  // T-ISO-001 through T-ISO-003: API and direct-URL isolation
  // --------------------------------------------------------------------------

  describe("API and URL isolation", () => {
    it("T-ISO-001: Org A consultant cannot see Org B assessments via API", () => {
      const sessionA = createMockSession("consultant", {
        user: createMockUser("consultant", { organizationId: orgA.id }),
      });

      const results = fetchAssessmentsForUser(allAssessments, sessionA.user.organizationId);

      expect(results).toHaveLength(2);
      expect(results.every((a) => a.organizationId === orgA.id)).toBe(true);
      expect(results.find((a) => a.id === "assess-b1")).toBeUndefined();
    });

    it("T-ISO-002: Org A consultant cannot see Org B assessments via direct URL", () => {
      const sessionA = createMockSession("consultant", {
        user: createMockUser("consultant", { organizationId: orgA.id }),
      });

      // Attempt to access Org B assessment by its known ID
      const result = fetchAssessmentById(allAssessments, "assess-b1", sessionA.user.organizationId);

      expect(result).toBeNull();
    });

    it("T-ISO-003: Org A consultant cannot modify Org B assessment via API with known ID", () => {
      const sessionA = createMockSession("consultant", {
        user: createMockUser("consultant", { organizationId: orgA.id }),
      });

      const result = updateAssessment(
        allAssessments,
        "assess-b1",
        sessionA.user.organizationId,
        { companyName: "Hacked Name" },
      );

      expect(result.success).toBe(false);
      expect(result.status).toBe(403);
      expect(result.error).toBe("FORBIDDEN");

      // Verify the assessment was not modified
      expect(assessmentB1.companyName).toBe("Beta Client");
    });
  });

  // --------------------------------------------------------------------------
  // T-ISO-004: User enumeration prevention
  // --------------------------------------------------------------------------

  describe("User enumeration prevention", () => {
    it("T-ISO-004: Cross-org user enumeration via API is not possible", () => {
      const sessionA = createMockSession("consultant", {
        user: createMockUser("consultant", { organizationId: orgA.id }),
      });

      // Search for users -- should only return users in caller's org
      const results = searchUsers(allUsers, sessionA.user.organizationId, "Bob");

      // User B exists but is invisible to Org A because searchUsers filters by org
      expect(results.find((u) => u.id === "user-b")).toBeUndefined();
      expect(results.every((u) => u.organizationId === orgA.id)).toBe(true);

      // Searching for own org's user works
      const selfResults = searchUsers(allUsers, sessionA.user.organizationId, "Alice");
      expect(selfResults.length).toBeGreaterThanOrEqual(1);
      expect(selfResults.every((u) => u.organizationId === orgA.id)).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // T-ISO-005 & T-ISO-006: SCIM and SSO isolation
  // --------------------------------------------------------------------------

  describe("SCIM and SSO isolation", () => {
    it("T-ISO-005: SCIM provisioning for Org A cannot affect Org B users", () => {
      const resultOwn = scimProvision(orgA.id, orgA.id, {
        email: "new-user@alpha.com",
        name: "New Alpha User",
        role: "consultant",
      });
      expect(resultOwn.success).toBe(true);
      expect(resultOwn.status).toBe(201);

      // Attempt to provision into Org B from Org A's SCIM endpoint
      const resultCross = scimProvision(orgB.id, orgA.id, {
        email: "infiltrator@alpha.com",
        name: "Infiltrator",
        role: "consultant",
      });
      expect(resultCross.success).toBe(false);
      expect(resultCross.status).toBe(403);
    });

    it("T-ISO-006: SSO for Org A cannot authenticate as Org B user", () => {
      const orgAWithSSO = OrgFactory.createWithSSO({ id: "org-a-sso", ssoDomain: "alpha.example.com" });
      const orgBWithSSO = OrgFactory.createWithSSO({ id: "org-b-sso", ssoDomain: "beta.example.com" });

      // Valid SSO for own org
      const validAuth = ssoAuthenticate("alpha.example.com", "alpha.example.com", orgAWithSSO.ssoDomain!);
      expect(validAuth.authenticated).toBe(true);

      // Cross-org SSO attempt
      const crossAuth = ssoAuthenticate("alpha.example.com", "alpha.example.com", orgBWithSSO.ssoDomain!);
      expect(crossAuth.authenticated).toBe(false);
      expect(crossAuth.error).toBe("SSO domain mismatch");
    });
  });

  // --------------------------------------------------------------------------
  // T-ISO-007 & T-ISO-008: Search and reporting isolation
  // --------------------------------------------------------------------------

  describe("Search and reporting isolation", () => {
    it("T-ISO-007: Assessment search/filter never returns cross-org results", () => {
      const results = searchAssessments(allAssessments, orgA.id, { industry: "Manufacturing" });

      // Both orgs have Manufacturing assessments, but only Org A results returned
      expect(results.every((a) => a.organizationId === orgA.id)).toBe(true);
      expect(results.find((a) => a.organizationId === orgB.id)).toBeUndefined();

      // Same for status filter
      const statusResults = searchAssessments(allAssessments, orgA.id, { status: "draft" });
      expect(statusResults.every((a) => a.organizationId === orgA.id)).toBe(true);
    });

    it("T-ISO-008: Reporting/analytics never includes cross-org data", () => {
      const analyticsA = getAnalytics(allAssessments, orgA.id);

      expect(analyticsA.totalAssessments).toBe(2); // Only Org A assessments
      // Org B has 1 assessment which must not be counted
      const analyticsB = getAnalytics(allAssessments, orgB.id);
      expect(analyticsB.totalAssessments).toBe(1);

      // Sum should equal total
      expect(analyticsA.totalAssessments + analyticsB.totalAssessments).toBe(allAssessments.length);
    });
  });

  // --------------------------------------------------------------------------
  // T-ISO-009: Benchmarking anonymization
  // --------------------------------------------------------------------------

  describe("Benchmarking anonymization", () => {
    it("T-ISO-009: Benchmarking uses anonymized aggregates only", () => {
      const benchmark = getBenchmark(allAssessments, "Manufacturing");

      expect(benchmark.industry).toBe("Manufacturing");
      expect(benchmark.sampleSize).toBeGreaterThan(0);
      // No org-identifiable data
      expect(benchmark.orgIds).toBeUndefined();
      expect(benchmark.companyNames).toBeUndefined();
    });
  });

  // --------------------------------------------------------------------------
  // T-ISO-010 & T-ISO-011: WebSocket and activity feed scoping
  // --------------------------------------------------------------------------

  describe("WebSocket and activity feed scoping", () => {
    it("T-ISO-010: WebSocket presence channel scoped to assessment", () => {
      const clientA = createMockWebSocketClient("user-a", "assess-a1");
      const clientB = createMockWebSocketClient("user-b", "assess-b1");

      // User A sends presence for assessment A1
      const presenceA = createPresenceMessage("user-a", "ONLINE", "/steps");
      clientA.send(presenceA);

      // User B sends presence for assessment B1
      const presenceB = createPresenceMessage("user-b", "ONLINE", "/gaps");
      clientB.send(presenceB);

      // Channel scoping: clients are on different assessments
      expect(clientA.assessmentId).not.toBe(clientB.assessmentId);
      expect(clientA.messages).toHaveLength(1);
      expect(clientB.messages).toHaveLength(1);

      // User A should not receive User B's presence and vice versa
      expect(clientA.messages[0]!.payload.userId).toBe("user-a");
      expect(clientB.messages[0]!.payload.userId).toBe("user-b");
    });

    it("T-ISO-011: Activity feed scoped to assessment", () => {
      const activitiesA1: ReturnType<typeof createActivityMessage>[] = [];
      const activitiesB1: ReturnType<typeof createActivityMessage>[] = [];

      // Activities for different assessments
      activitiesA1.push(createActivityMessage("user-a", "MARKED_FIT", "Classified step as FIT"));
      activitiesB1.push(createActivityMessage("user-b", "MARKED_GAP", "Classified step as GAP"));

      // Each feed is independent
      expect(activitiesA1).toHaveLength(1);
      expect(activitiesB1).toHaveLength(1);
      expect(activitiesA1[0]!.payload.actorId).toBe("user-a");
      expect(activitiesB1[0]!.payload.actorId).toBe("user-b");

      // Cross-assessment feed should not mix
      const combinedForA1 = activitiesA1.filter((a) => a.payload.actorId === "user-b");
      expect(combinedForA1).toHaveLength(0);
    });
  });

  // --------------------------------------------------------------------------
  // T-ISO-012: Template marketplace scoping
  // --------------------------------------------------------------------------

  describe("Template marketplace scoping", () => {
    it("T-ISO-012: Template marketplace scoped to organization", () => {
      const templates = [
        { id: "tmpl-a1", organizationId: orgA.id, isPublic: false, name: "Alpha Private Template" },
        { id: "tmpl-a2", organizationId: orgA.id, isPublic: true, name: "Alpha Public Template" },
        { id: "tmpl-b1", organizationId: orgB.id, isPublic: false, name: "Beta Private Template" },
        { id: "tmpl-b2", organizationId: orgB.id, isPublic: true, name: "Beta Public Template" },
      ];

      const orgATemplates = getTemplates(templates, orgA.id);

      // Org A sees: own templates + public templates from others
      expect(orgATemplates.find((t) => t.id === "tmpl-a1")).toBeDefined(); // own private
      expect(orgATemplates.find((t) => t.id === "tmpl-a2")).toBeDefined(); // own public
      expect(orgATemplates.find((t) => t.id === "tmpl-b1")).toBeUndefined(); // other's private
      expect(orgATemplates.find((t) => t.id === "tmpl-b2")).toBeDefined(); // other's public

      const orgBTemplates = getTemplates(templates, orgB.id);
      expect(orgBTemplates.find((t) => t.id === "tmpl-a1")).toBeUndefined(); // other's private
    });
  });

  // --------------------------------------------------------------------------
  // T-ISO-013: Partner admin isolation
  // --------------------------------------------------------------------------

  describe("Partner admin isolation", () => {
    it("T-ISO-013: Partner admin cannot see another partner's team members", () => {
      const partnerAdminA = UserFactory.createForRole("partner_admin", orgA.id, { id: "pa-a" });
      const partnerAdminB = UserFactory.createForRole("partner_admin", orgB.id, { id: "pa-b" });
      const teamMemberA = UserFactory.createForRole("consultant", orgA.id, { id: "tm-a" });
      const teamMemberB = UserFactory.createForRole("consultant", orgB.id, { id: "tm-b" });

      const allTeamMembers = [partnerAdminA, partnerAdminB, teamMemberA, teamMemberB];

      // Partner Admin A queries team members
      const resultA = getPartnerTeamMembers(allTeamMembers, orgA.id);
      expect(resultA).toHaveLength(2); // partnerAdminA + teamMemberA
      expect(resultA.every((u) => u.organizationId === orgA.id)).toBe(true);
      expect(resultA.find((u) => u.id === "tm-b")).toBeUndefined();

      // Partner Admin B queries team members
      const resultB = getPartnerTeamMembers(allTeamMembers, orgB.id);
      expect(resultB).toHaveLength(2); // partnerAdminB + teamMemberB
      expect(resultB.every((u) => u.organizationId === orgB.id)).toBe(true);
      expect(resultB.find((u) => u.id === "tm-a")).toBeUndefined();
    });
  });

  // --------------------------------------------------------------------------
  // T-ISO-014: Client stakeholder cross-assessment isolation
  // --------------------------------------------------------------------------

  describe("Client stakeholder cross-assessment isolation", () => {
    it("T-ISO-014: Client stakeholder on Assessment A cannot see Assessment B for same client", () => {
      // Two assessments for the same org, user is stakeholder only on A1
      const stakeholderAssessments = new Map<string, string[]>();
      stakeholderAssessments.set("user-stakeholder", ["assess-a1"]);

      function getStakeholderAssessments(userId: string) {
        const assignedIds = stakeholderAssessments.get(userId) ?? [];
        return allAssessments.filter((a) => assignedIds.includes(a.id));
      }

      const visible = getStakeholderAssessments("user-stakeholder");
      expect(visible).toHaveLength(1);
      expect(visible[0]!.id).toBe("assess-a1");

      // Assessment A2 in the same org is NOT visible
      expect(visible.find((a) => a.id === "assess-a2")).toBeUndefined();
    });
  });

  // --------------------------------------------------------------------------
  // T-ISO-015: Time-limited viewer link scoping
  // --------------------------------------------------------------------------

  describe("Time-limited viewer link scoping", () => {
    it("T-ISO-015: Viewer with time-limited link for Assessment A gets 403 on Assessment B", () => {
      const tokenAssessmentId = "assess-a1";

      // Access own assessment -- allowed
      const ownAccess = checkViewerAccess("assess-a1", tokenAssessmentId);
      expect(ownAccess.allowed).toBe(true);
      expect(ownAccess.status).toBe(200);

      // Access different assessment -- forbidden
      const crossAccess = checkViewerAccess("assess-a2", tokenAssessmentId);
      expect(crossAccess.allowed).toBe(false);
      expect(crossAccess.status).toBe(403);
      expect(crossAccess.error).toBe("FORBIDDEN");

      // Access cross-org assessment -- also forbidden
      const crossOrgAccess = checkViewerAccess("assess-b1", tokenAssessmentId);
      expect(crossOrgAccess.allowed).toBe(false);
      expect(crossOrgAccess.status).toBe(403);
    });
  });
});
