/**
 * SEED-003: Active org, 1 assessment at SCOPE_LOCKED with 50 scope items
 * Purpose: Test scope review and transition to process review
 */
export function seedScopeLocked() {
  const orgId = "seed-org-003";
  const assessmentId = "seed-assessment-003";

  const functionalAreas = [
    { area: "Finance", subArea: "Accounts Payable", prefix: "J", start: 60, count: 8 },
    { area: "Finance", subArea: "Accounts Receivable", prefix: "J", start: 68, count: 7 },
    { area: "Finance", subArea: "General Ledger", prefix: "J", start: 75, count: 5 },
    { area: "Controlling", subArea: "Cost Center Accounting", prefix: "1", start: 10, count: 5 },
    { area: "Procurement", subArea: "Purchasing", prefix: "J", start: 10, count: 8 },
    { area: "Sales", subArea: "Order Management", prefix: "J", start: 30, count: 7 },
    { area: "Warehouse", subArea: "Inventory Management", prefix: "J", start: 45, count: 5 },
    { area: "Quality", subArea: "Quality Management", prefix: "J", start: 50, count: 5 },
  ];

  const scopeSelections: Array<Record<string, unknown>> = [];
  let scopeCounter = 0;

  for (const fa of functionalAreas) {
    for (let i = 0; i < fa.count; i++) {
      scopeCounter++;
      const scopeItemId = `${fa.prefix}${fa.start + i}`;
      const isSelected = scopeCounter <= 40; // 40 selected, 10 excluded
      scopeSelections.push({
        id: `seed-scope-003-${String(scopeCounter).padStart(3, "0")}`,
        assessmentId,
        scopeItemId,
        selected: isSelected,
        relevance: isSelected ? "HIGH" : "LOW",
        currentState: isSelected ? "in_scope" : "excluded",
        notes: isSelected ? null : "Not applicable for this phase",
        respondent: "seed-user-003b",
        respondedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        priority: isSelected ? (scopeCounter <= 15 ? "critical" : scopeCounter <= 30 ? "high" : "medium") : null,
        businessJustification: isSelected ? `Required for ${fa.area} operations` : null,
        estimatedComplexity: isSelected ? (scopeCounter % 3 === 0 ? "HIGH" : scopeCounter % 2 === 0 ? "MEDIUM" : "LOW") : null,
        dependsOnScopeItems: [],
      });
    }
  }

  return {
    organization: {
      id: orgId,
      name: "Scope Masters Consulting",
      slug: "scope-masters",
      type: "partner",
      orgType: "partner",
      plan: "PROFESSIONAL",
      subscriptionStatus: "ACTIVE",
      trialEndsAt: null,
      stripeCustomerId: "cus_seed_003",
      stripeSubscriptionId: "sub_seed_003",
      billingEmail: "billing@scopemasters.com",
      maxActiveAssessments: 10,
      maxPartnerUsers: 25,
      isActive: true,
    },
    users: [
      {
        id: "seed-user-003a",
        email: "lead@scopemasters.com",
        name: "David Lim",
        role: "partner_lead",
        organizationId: orgId,
        isActive: true,
      },
      {
        id: "seed-user-003b",
        email: "consultant@scopemasters.com",
        name: "Priya Nair",
        role: "consultant",
        organizationId: orgId,
        isActive: true,
      },
      {
        id: "seed-user-003c",
        email: "po-finance@meridian.com",
        name: "Ahmad Razak",
        role: "process_owner",
        organizationId: orgId,
        isActive: true,
      },
    ],
    assessments: [
      {
        id: assessmentId,
        companyName: "Horizon Industries",
        industry: "Manufacturing",
        country: "MY",
        operatingCountries: ["MY", "SG", "ID", "VN"],
        companySize: "LARGE",
        revenueBand: "$100M-$500M",
        currentErp: "SAP ECC 6.0",
        sapVersion: "2508",
        status: "scope_locked",
        createdBy: "seed-user-003b",
        organizationId: orgId,
        employeeCount: 2500,
        annualRevenue: 320000000,
        currencyCode: "MYR",
        targetGoLiveDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        deploymentModel: "cloud",
        sapModules: ["FI", "CO", "MM", "SD", "PP", "QM", "WM"],
        keyProcesses: ["Order-to-Cash", "Procure-to-Pay", "Plan-to-Produce", "Record-to-Report"],
        languageRequirements: ["EN", "MS", "ZH"],
        regulatoryFrameworks: ["SST", "MFRS", "SOX"],
        itLandscapeSummary: "Complex multi-site SAP ECC landscape with third-party WMS and CRM",
        currentErpVersion: "EHP8",
        migrationApproach: "brownfield",
        profileCompletedAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
        profileCompletedBy: "seed-user-003b",
        phaseNumber: 1,
      },
    ],
    scopeSelections,
  };
}
