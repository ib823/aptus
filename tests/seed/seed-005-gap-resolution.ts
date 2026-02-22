/**
 * SEED-005: Active org, 1 assessment at GAP_RESOLUTION with 30 gaps at various states
 * Purpose: Test gap resolution workflow with different resolution types and costs
 */
export function seedGapResolution() {
  const orgId = "seed-org-005";
  const assessmentId = "seed-assessment-005";

  const resolutionTypes = [
    "EXTEND",
    "CONFIGURE",
    "ADAPT",
    "WORKAROUND",
    "PHASE_2",
    "ACCEPT",
    "BTP_SERVICE",
  ] as const;

  const gapTemplates = [
    { scope: "J60", area: "Finance", desc: "Custom payment approval workflow" },
    { scope: "J60", area: "Finance", desc: "Multi-currency revaluation with local GAAP" },
    { scope: "J61", area: "Finance", desc: "Complex dunning with legal escalation" },
    { scope: "J62", area: "Finance", desc: "Parallel ledger for tax reporting" },
    { scope: "J62", area: "Finance", desc: "Intercompany reconciliation automation" },
    { scope: "J10", area: "Procurement", desc: "Vendor self-service portal integration" },
    { scope: "J10", area: "Procurement", desc: "Custom RFQ scoring algorithm" },
    { scope: "J11", area: "Procurement", desc: "Supplier risk assessment dashboard" },
    { scope: "J30", area: "Sales", desc: "Complex pricing with tiered rebates" },
    { scope: "J30", area: "Sales", desc: "Custom ATP check for make-to-order" },
    { scope: "J31", area: "Sales", desc: "Dynamic pricing engine integration" },
    { scope: "J45", area: "Warehouse", desc: "Barcode scanning with custom label format" },
    { scope: "J45", area: "Warehouse", desc: "Cross-docking automation rules" },
    { scope: "J50", area: "Quality", desc: "Quality certificate auto-generation" },
    { scope: "J50", area: "Quality", desc: "Supplier quality scoring integration" },
  ];

  const gapResolutions: Array<Record<string, unknown>> = [];

  for (let i = 0; i < 30; i++) {
    const template = gapTemplates[i % gapTemplates.length];
    const resType = resolutionTypes[i % resolutionTypes.length];
    const isResolved = i < 18; // 18 resolved, 12 pending
    const isApproved = i < 12; // 12 client-approved
    const riskLevel = i % 5 === 0 ? "HIGH" : i % 3 === 0 ? "MEDIUM" : "LOW";

    const costMultiplier = resType === "EXTEND" ? 5 : resType === "BTP_SERVICE" ? 4 : resType === "ADAPT" ? 3 : resType === "CONFIGURE" ? 1 : resType === "WORKAROUND" ? 0.5 : 0;
    const baseCost = (i + 1) * 2000;

    gapResolutions.push({
      id: `seed-gap-005-${String(i + 1).padStart(3, "0")}`,
      assessmentId,
      processStepId: `seed-step-005-${String(i + 1).padStart(3, "0")}`,
      scopeItemId: template.scope,
      gapDescription: `${template.desc} (variation ${Math.floor(i / gapTemplates.length) + 1})`,
      resolutionType: resType,
      resolutionDescription: isResolved
        ? `Resolved via ${resType}: implement ${template.desc.toLowerCase()} using ${resType === "BTP_SERVICE" ? "BTP CAP framework" : resType === "EXTEND" ? "ABAP BAdI enhancement" : resType === "ADAPT" ? "key user extensibility" : resType === "CONFIGURE" ? "standard configuration" : resType === "WORKAROUND" ? "manual process adjustment" : "phased approach"}`
        : `Pending resolution analysis for: ${template.desc}`,
      effortDays: isResolved ? Math.ceil((i + 1) * 1.5) : null,
      costEstimate: isResolved ? { labor: baseCost * costMultiplier, license: resType === "BTP_SERVICE" ? 5000 : 0 } : null,
      riskLevel: isResolved ? riskLevel : null,
      upgradeImpact: resType === "EXTEND"
        ? "Custom code requires upgrade impact analysis"
        : resType === "BTP_SERVICE"
          ? "Side-by-side extension, upgrade safe"
          : null,
      decidedBy: isResolved ? "seed-user-005b" : null,
      decidedAt: isResolved ? new Date(Date.now() - (30 - i) * 24 * 60 * 60 * 1000) : null,
      clientApproved: isApproved,
      rationale: isResolved ? `Best approach for ${template.area} requirements` : null,
      priority: isResolved
        ? (riskLevel === "HIGH" ? "critical" : riskLevel === "MEDIUM" ? "high" : "medium")
        : null,
      oneTimeCost: isResolved ? baseCost * costMultiplier : null,
      recurringCost: resType === "BTP_SERVICE" ? 6000 : resType === "EXTEND" ? 2000 : 0,
      costCurrency: "USD",
      implementationDays: isResolved ? Math.ceil((i + 1) * 1.5) : null,
      riskCategory: isResolved ? riskLevel.toLowerCase() : null,
      upgradeStrategy: isResolved
        ? (resType === "EXTEND" ? "Requires regression testing on upgrade" : "Compatible with standard upgrade")
        : null,
      clientApprovalNote: isApproved ? "Approved during gap review workshop" : null,
      clientApprovedBy: isApproved ? "seed-user-005d" : null,
      clientApprovedAt: isApproved ? new Date(Date.now() - (20 - i) * 24 * 60 * 60 * 1000) : null,
    });
  }

  return {
    organization: {
      id: orgId,
      name: "GapBridge Partners",
      slug: "gapbridge",
      type: "partner",
      orgType: "partner",
      plan: "PROFESSIONAL",
      subscriptionStatus: "ACTIVE",
      trialEndsAt: null,
      stripeCustomerId: "cus_seed_005",
      stripeSubscriptionId: "sub_seed_005",
      billingEmail: "billing@gapbridge.com",
      maxActiveAssessments: 10,
      maxPartnerUsers: 25,
      isActive: true,
    },
    users: [
      {
        id: "seed-user-005a",
        email: "lead@gapbridge.com",
        name: "Rachel Ng",
        role: "partner_lead",
        organizationId: orgId,
        isActive: true,
      },
      {
        id: "seed-user-005b",
        email: "consultant@gapbridge.com",
        name: "Omar Farouk",
        role: "consultant",
        organizationId: orgId,
        isActive: true,
      },
      {
        id: "seed-user-005c",
        email: "architect@gapbridge.com",
        name: "Yuki Tanaka",
        role: "solution_architect",
        organizationId: orgId,
        isActive: true,
      },
      {
        id: "seed-user-005d",
        email: "sponsor@acmeclient.com",
        name: "Robert Chang",
        role: "executive_sponsor",
        organizationId: orgId,
        isActive: true,
      },
    ],
    assessments: [
      {
        id: assessmentId,
        companyName: "Acme Manufacturing Corp",
        industry: "Manufacturing",
        country: "MY",
        operatingCountries: ["MY", "SG", "TH", "VN"],
        companySize: "LARGE",
        revenueBand: "$500M-$1B",
        currentErp: "SAP ECC 6.0",
        sapVersion: "2508",
        status: "gap_resolution",
        createdBy: "seed-user-005b",
        organizationId: orgId,
        employeeCount: 5000,
        annualRevenue: 750000000,
        currencyCode: "USD",
        targetGoLiveDate: new Date(Date.now() + 240 * 24 * 60 * 60 * 1000),
        deploymentModel: "cloud",
        sapModules: ["FI", "CO", "MM", "SD", "PP", "QM", "WM"],
        keyProcesses: ["Order-to-Cash", "Procure-to-Pay", "Plan-to-Produce", "Record-to-Report"],
        languageRequirements: ["EN", "MS", "TH", "VI"],
        regulatoryFrameworks: ["SOX", "SST", "MFRS"],
        itLandscapeSummary: "Multi-country SAP ECC with legacy integrations",
        currentErpVersion: "EHP8",
        migrationApproach: "brownfield",
        profileCompletedAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
        profileCompletedBy: "seed-user-005b",
        phaseNumber: 1,
      },
    ],
    gapResolutions,
  };
}
