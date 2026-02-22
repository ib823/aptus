/**
 * SEED-001: Empty org, trial, 0 assessments
 * Purpose: Test signup flow + first assessment creation
 */
export function seedEmptyTrial() {
  return {
    organization: {
      id: "seed-org-001",
      name: "Trial Corp",
      slug: "trial-corp",
      type: "partner",
      orgType: "partner",
      plan: "TRIAL",
      subscriptionStatus: "TRIALING",
      trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      maxActiveAssessments: 3,
      maxPartnerUsers: 10,
      isActive: true,
    },
    users: [
      {
        id: "seed-user-001",
        email: "admin@trialcorp.com",
        name: "Trial Admin",
        role: "partner_lead",
        organizationId: "seed-org-001",
        isActive: true,
      },
    ],
    assessments: [],
  };
}
