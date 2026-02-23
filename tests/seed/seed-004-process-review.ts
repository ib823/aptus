/**
 * SEED-004: Active org, 1 assessment at PROCESS_REVIEW with 200 classified steps
 * Purpose: Test step classification workflow with mixed FIT/CONFIGURE/GAP/NA/PENDING
 */
export function seedProcessReview() {
  const orgId = "seed-org-004";
  const assessmentId = "seed-assessment-004";

  type FitStatus = "FIT" | "CONFIGURE" | "GAP" | "NA" | "PENDING";
  const fitDistribution = {
    FIT: 0.40,
    CONFIGURE: 0.25,
    GAP: 0.15,
    NA: 0.10,
    PENDING: 0.10,
  };

  const scopeItems = [
    { id: "J60", name: "Accounts Payable", area: "Finance" },
    { id: "J61", name: "Accounts Receivable", area: "Finance" },
    { id: "J62", name: "General Ledger Accounting", area: "Finance" },
    { id: "J10", name: "Purchasing", area: "Procurement" },
    { id: "J11", name: "Supplier Management", area: "Procurement" },
    { id: "J30", name: "Sales Order Management", area: "Sales" },
    { id: "J31", name: "Pricing", area: "Sales" },
    { id: "J45", name: "Inventory Management", area: "Warehouse" },
  ];

  const stepResponses: Array<Record<string, unknown>> = [];
  let stepIndex = 0;

  for (const scopeItem of scopeItems) {
    const stepsPerItem = Math.floor(200 / scopeItems.length);
    for (let i = 0; i < stepsPerItem; i++) {
      stepIndex++;
      const rand = Math.random();
      let cumulative = 0;
      let status: FitStatus = "PENDING";

      for (const [key, weight] of Object.entries(fitDistribution)) {
        cumulative += weight;
        if (rand <= cumulative) {
          status = key as FitStatus;
          break;
        }
      }

      const processStepId = `seed-step-004-${String(stepIndex).padStart(3, "0")}`;

      stepResponses.push({
        id: `seed-response-004-${String(stepIndex).padStart(3, "0")}`,
        assessmentId,
        processStepId,
        fitStatus: status,
        clientNote: status === "GAP"
          ? "Current process requires custom handling not available in standard"
          : status === "CONFIGURE"
            ? "Needs configuration for local requirements"
            : status === "FIT"
              ? "Standard process meets our needs"
              : null,
        currentProcess: status !== "NA"
          ? `Current ${scopeItem.name} process step ${i + 1}`
          : null,
        respondent: status !== "PENDING" ? "seed-user-004c" : null,
        respondedAt: status !== "PENDING"
          ? new Date(Date.now() - (200 - stepIndex) * 3600 * 1000)
          : null,
        confidence: status !== "PENDING"
          ? (status === "FIT" ? "HIGH" : status === "GAP" ? "MEDIUM" : "HIGH")
          : null,
        evidenceUrls: [],
        reviewedBy: status === "FIT" || status === "CONFIGURE" ? "seed-user-004b" : null,
        reviewedAt: status === "FIT" || status === "CONFIGURE"
          ? new Date(Date.now() - (200 - stepIndex) * 1800 * 1000)
          : null,
      });
    }
  }

  return {
    organization: {
      id: orgId,
      name: "ProcessWise Consulting",
      slug: "processwise",
      type: "partner",
      orgType: "partner",
      plan: "PROFESSIONAL",
      subscriptionStatus: "ACTIVE",
      trialEndsAt: null,
      stripeCustomerId: "cus_seed_004",
      stripeSubscriptionId: "sub_seed_004",
      billingEmail: "billing@processwise.com",
      maxActiveAssessments: 10,
      maxPartnerUsers: 25,
      isActive: true,
    },
    users: [
      {
        id: "seed-user-004a",
        email: "lead@processwise.com",
        name: "Michael Tan",
        role: "partner_lead",
        organizationId: orgId,
        isActive: true,
      },
      {
        id: "seed-user-004b",
        email: "consultant@processwise.com",
        name: "Lisa Fernandez",
        role: "consultant",
        organizationId: orgId,
        isActive: true,
      },
      {
        id: "seed-user-004c",
        email: "po-finance@horizonindustries.com",
        name: "Ravi Kumar",
        role: "process_owner",
        organizationId: orgId,
        isActive: true,
      },
      {
        id: "seed-user-004d",
        email: "it@horizonindustries.com",
        name: "Chen Wei",
        role: "it_lead",
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
        operatingCountries: ["MY", "SG"],
        companySize: "LARGE",
        revenueBand: "$100M-$500M",
        currentErp: "SAP ECC 6.0",
        sapVersion: "2508",
        status: "process_review",
        createdBy: "seed-user-004b",
        organizationId: orgId,
        employeeCount: 2500,
        annualRevenue: 320000000,
        currencyCode: "MYR",
        targetGoLiveDate: new Date(Date.now() + 300 * 24 * 60 * 60 * 1000),
        deploymentModel: "cloud",
        sapModules: ["FI", "CO", "MM", "SD", "PP", "QM", "WM"],
        keyProcesses: ["Order-to-Cash", "Procure-to-Pay", "Record-to-Report"],
        languageRequirements: ["EN", "MS"],
        regulatoryFrameworks: ["SST", "MFRS"],
        itLandscapeSummary: "SAP ECC with third-party WMS integration",
        currentErpVersion: "EHP8",
        migrationApproach: "brownfield",
        profileCompletedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        profileCompletedBy: "seed-user-004b",
        phaseNumber: 1,
      },
    ],
    stepResponses,
  };
}
