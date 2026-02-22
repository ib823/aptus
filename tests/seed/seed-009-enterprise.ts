/**
 * SEED-009: Enterprise org with SSO + SCIM, 50 users (all 11 roles), 10 assessments at various states
 * Purpose: Large scale testing seed for enterprise multi-tenant scenarios
 */
export function seedEnterprise() {
  const orgId = "seed-org-009";

  const allRoles = [
    "platform_admin",
    "partner_lead",
    "consultant",
    "project_manager",
    "solution_architect",
    "process_owner",
    "it_lead",
    "data_migration_lead",
    "executive_sponsor",
    "viewer",
    "client_admin",
  ] as const;

  const roleDistribution: Record<string, number> = {
    platform_admin: 1,
    partner_lead: 2,
    consultant: 8,
    project_manager: 4,
    solution_architect: 3,
    process_owner: 15,
    it_lead: 3,
    data_migration_lead: 2,
    executive_sponsor: 4,
    viewer: 5,
    client_admin: 3,
  };

  const users: Array<Record<string, unknown>> = [];
  let userIndex = 0;

  for (const role of allRoles) {
    const count = roleDistribution[role];
    for (let i = 0; i < count; i++) {
      userIndex++;
      const paddedIndex = String(userIndex).padStart(3, "0");
      users.push({
        id: `seed-user-009-${paddedIndex}`,
        email: `user${paddedIndex}@megacorp-enterprise.com`,
        name: `Enterprise User ${paddedIndex} (${role.replace(/_/g, " ")})`,
        role,
        organizationId: orgId,
        isActive: userIndex <= 45, // 5 deactivated users
        displayRole: role
          .split("_")
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(" "),
        mfaEnabled: true,
        mfaMethod: "totp",
        totpVerified: true,
        lastLoginAt: userIndex <= 45
          ? new Date(Date.now() - userIndex * 3600 * 1000)
          : null,
        loginCount: userIndex <= 45 ? Math.floor(Math.random() * 200) + 10 : 0,
        deactivatedAt: userIndex > 45
          ? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
          : null,
        deactivatedBy: userIndex > 45 ? "seed-user-009-001" : null,
        deactivationReason: userIndex > 45 ? "Employee departed" : null,
      });
    }
  }

  const assessmentStatuses = [
    "setup",
    "scope_in_progress",
    "scope_locked",
    "process_review",
    "gap_resolution",
    "validation",
    "pending_sign_off",
    "signed_off",
    "handed_off",
    "reassessment_needed",
  ];

  const industries = [
    "Manufacturing",
    "Retail",
    "Automotive",
    "Pharmaceuticals",
    "Electronics",
    "Consumer Goods",
    "Chemicals",
    "Oil & Gas",
    "Utilities",
    "Telecommunications",
  ];

  const assessments: Array<Record<string, unknown>> = [];

  for (let i = 0; i < 10; i++) {
    const status = assessmentStatuses[i];
    const assessmentId = `seed-assessment-009-${String(i + 1).padStart(2, "0")}`;
    const creatorIndex = String(3 + (i % 8)).padStart(3, "0"); // consultants

    assessments.push({
      id: assessmentId,
      companyName: `Enterprise Client ${String.fromCharCode(65 + i)}`,
      industry: industries[i],
      country: i % 3 === 0 ? "MY" : i % 3 === 1 ? "SG" : "US",
      operatingCountries: i % 3 === 0
        ? ["MY", "SG", "TH"]
        : i % 3 === 1
          ? ["SG", "MY", "ID"]
          : ["US", "CA", "MX"],
      companySize: i < 3 ? "MEDIUM" : i < 7 ? "LARGE" : "ENTERPRISE",
      revenueBand: i < 3 ? "$100M-$500M" : i < 7 ? "$500M-$1B" : "$1B-$5B",
      currentErp: i % 2 === 0 ? "SAP ECC 6.0" : "Oracle EBS",
      sapVersion: "2508",
      status,
      createdBy: `seed-user-009-${creatorIndex}`,
      organizationId: orgId,
      employeeCount: (i + 1) * 1000,
      annualRevenue: (i + 1) * 100000000,
      currencyCode: "USD",
      targetGoLiveDate: new Date(Date.now() + (180 + i * 30) * 24 * 60 * 60 * 1000),
      deploymentModel: "cloud",
      sapModules: ["FI", "CO", "MM", "SD"].concat(
        i >= 3 ? ["PP"] : [],
        i >= 5 ? ["QM", "PM"] : [],
        i >= 7 ? ["EWM", "TM"] : [],
      ),
      keyProcesses: ["Order-to-Cash", "Procure-to-Pay", "Record-to-Report"],
      languageRequirements: ["EN"],
      regulatoryFrameworks: i < 5 ? ["SST"] : ["SOX"],
      itLandscapeSummary: `Complex ${industries[i]} IT landscape`,
      currentErpVersion: "EHP8",
      migrationApproach: i % 2 === 0 ? "brownfield" : "greenfield",
      profileCompletedAt: i >= 1
        ? new Date(Date.now() - (200 - i * 20) * 24 * 60 * 60 * 1000)
        : null,
      profileCompletedBy: i >= 1 ? `seed-user-009-${creatorIndex}` : null,
      phaseNumber: 1,
    });
  }

  return {
    organization: {
      id: orgId,
      name: "MegaCorp Enterprise Solutions",
      slug: "megacorp-enterprise",
      type: "partner",
      orgType: "partner",
      plan: "ENTERPRISE",
      subscriptionStatus: "ACTIVE",
      trialEndsAt: null,
      stripeCustomerId: "cus_seed_009",
      stripeSubscriptionId: "sub_seed_009",
      billingEmail: "billing@megacorp-enterprise.com",
      maxActiveAssessments: 100,
      maxPartnerUsers: 100,
      isActive: true,
      ssoEnabled: true,
      ssoProvider: "azure-ad",
      ssoDomain: "megacorp-enterprise.com",
      ssoMetadataUrl: "https://login.microsoftonline.com/tenant-id-009/.well-known/openid-configuration",
      ssoClientId: "client-id-megacorp-009",
      ssoClientSecret: "client-secret-megacorp-009",
      scimEnabled: true,
      scimEndpoint: "https://megacorp-enterprise.com/scim/v2",
      scimBearerToken: "scim-token-megacorp-009",
      mfaPolicy: "required",
      brandPrimaryColor: "#0D47A1",
      brandLogoUrl: "https://megacorp-enterprise.com/logo.png",
      primaryColor: "#0D47A1",
      reportFooterText: "Confidential - MegaCorp Enterprise Solutions",
      industryFocus: ["Manufacturing", "Retail", "Automotive"],
      contactEmail: "support@megacorp-enterprise.com",
      websiteUrl: "https://megacorp-enterprise.com",
    },
    users,
    assessments,
  };
}
