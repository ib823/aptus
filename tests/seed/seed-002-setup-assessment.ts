/**
 * SEED-002: Active org, 1 assessment at SETUP state
 * Purpose: Test assessment setup flow with basic company profile
 */
export function seedSetupAssessment() {
  const orgId = "seed-org-002";
  const assessmentId = "seed-assessment-002";

  return {
    organization: {
      id: orgId,
      name: "Setup Solutions Sdn Bhd",
      slug: "setup-solutions",
      type: "partner",
      orgType: "partner",
      plan: "STARTER",
      subscriptionStatus: "ACTIVE",
      trialEndsAt: null,
      maxActiveAssessments: 3,
      maxPartnerUsers: 10,
      isActive: true,
    },
    users: [
      {
        id: "seed-user-002a",
        email: "lead@setupsolutions.com",
        name: "Sarah Chen",
        role: "partner_lead",
        organizationId: orgId,
        isActive: true,
      },
      {
        id: "seed-user-002b",
        email: "consultant@setupsolutions.com",
        name: "James Wong",
        role: "consultant",
        organizationId: orgId,
        isActive: true,
      },
      {
        id: "seed-user-002c",
        email: "pm@setupsolutions.com",
        name: "Aisha Rahman",
        role: "project_manager",
        organizationId: orgId,
        isActive: true,
      },
    ],
    assessments: [
      {
        id: assessmentId,
        companyName: "Meridian Manufacturing",
        industry: "Manufacturing",
        country: "MY",
        operatingCountries: ["MY", "SG", "TH"],
        companySize: "MEDIUM",
        revenueBand: "$50M-$100M",
        currentErp: "SAP ECC 6.0",
        sapVersion: "2508",
        status: "setup",
        createdBy: "seed-user-002b",
        organizationId: orgId,
        employeeCount: 800,
        annualRevenue: 75000000,
        currencyCode: "MYR",
        targetGoLiveDate: new Date(Date.now() + 270 * 24 * 60 * 60 * 1000),
        deploymentModel: "cloud",
        sapModules: ["FI", "CO", "MM", "SD"],
        keyProcesses: ["Order-to-Cash", "Procure-to-Pay", "Record-to-Report"],
        languageRequirements: ["EN", "MS"],
        regulatoryFrameworks: ["SST", "MFRS"],
        itLandscapeSummary: "Legacy SAP ECC with custom bolt-ons for local tax compliance",
        currentErpVersion: "EHP7",
        migrationApproach: "brownfield",
        profileCompletedAt: new Date(),
        profileCompletedBy: "seed-user-002b",
        phaseNumber: 1,
      },
    ],
    stakeholders: [
      {
        id: "seed-stakeholder-002a",
        assessmentId,
        userId: "seed-user-002b",
        name: "James Wong",
        email: "consultant@setupsolutions.com",
        role: "consultant",
        assignedAreas: ["Finance", "Controlling"],
        canEdit: true,
        invitedBy: "seed-user-002a",
      },
      {
        id: "seed-stakeholder-002b",
        assessmentId,
        userId: "seed-user-002c",
        name: "Aisha Rahman",
        email: "pm@setupsolutions.com",
        role: "project_manager",
        assignedAreas: [],
        canEdit: true,
        invitedBy: "seed-user-002a",
      },
    ],
  };
}
