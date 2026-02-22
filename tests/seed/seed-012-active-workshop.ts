/**
 * SEED-012: Org with active workshop session, 5 connected users
 * Purpose: Test live workshop with attendees (consultant, 3 POs, executive) and voting
 */
export function seedActiveWorkshop() {
  const orgId = "seed-org-012";
  const assessmentId = "seed-assessment-012";
  const sessionId = "seed-workshop-012";

  const workshopStepIds = Array.from({ length: 10 }, (_, i) =>
    `seed-step-012-${String(i + 1).padStart(3, "0")}`,
  );

  const attendeeUsers = [
    {
      id: "seed-user-012b",
      email: "consultant@workshopco.com",
      name: "Hannah Yeoh",
      role: "consultant",
      workshopRole: "facilitator",
      isPresenter: true,
    },
    {
      id: "seed-user-012c",
      email: "po-finance@clientco.com",
      name: "Mohan Raj",
      role: "process_owner",
      workshopRole: "attendee",
      isPresenter: false,
    },
    {
      id: "seed-user-012d",
      email: "po-procurement@clientco.com",
      name: "Nurul Aisyah",
      role: "process_owner",
      workshopRole: "attendee",
      isPresenter: false,
    },
    {
      id: "seed-user-012e",
      email: "po-sales@clientco.com",
      name: "Lim Beng Hock",
      role: "process_owner",
      workshopRole: "attendee",
      isPresenter: false,
    },
    {
      id: "seed-user-012f",
      email: "cfo@clientco.com",
      name: "Dato Razali",
      role: "executive_sponsor",
      workshopRole: "attendee",
      isPresenter: false,
    },
  ];

  const workshopAttendees = attendeeUsers.map((user) => ({
    id: `seed-attendee-012-${user.id.split("-").pop()}`,
    sessionId,
    userId: user.id,
    role: user.workshopRole,
    joinedAt: new Date(Date.now() - 45 * 60 * 1000),
    leftAt: null,
    deviceType: user.role === "executive_sponsor" ? "mobile" : "desktop",
    isFollowing: true,
    isPresenter: user.isPresenter,
    connectionStatus: "connected",
    lastPingAt: new Date(Date.now() - 5 * 1000),
  }));

  const classifications = ["FIT", "CONFIGURE", "GAP", "NA"] as const;
  const confidenceLevels = ["HIGH", "MEDIUM", "LOW"] as const;

  const workshopVotes: Array<Record<string, unknown>> = [];
  let voteIndex = 0;

  for (const stepId of workshopStepIds.slice(0, 7)) {
    for (const user of attendeeUsers.filter((u) => u.role !== "executive_sponsor")) {
      voteIndex++;
      const classIndex = Math.floor(Math.random() * classifications.length);
      workshopVotes.push({
        id: `seed-vote-012-${String(voteIndex).padStart(3, "0")}`,
        sessionId,
        processStepId: stepId,
        userId: user.id,
        classification: classifications[classIndex],
        confidence: confidenceLevels[Math.floor(Math.random() * confidenceLevels.length)],
        notes: classIndex === 2
          ? "This process requires custom handling"
          : classIndex === 1
            ? "Configuration required for local requirements"
            : null,
        votedAt: new Date(Date.now() - (30 - voteIndex) * 60 * 1000),
      });
    }
  }

  return {
    organization: {
      id: orgId,
      name: "Workshop Co",
      slug: "workshop-co",
      type: "partner",
      orgType: "partner",
      plan: "PROFESSIONAL",
      subscriptionStatus: "ACTIVE",
      trialEndsAt: null,
      stripeCustomerId: "cus_seed_012",
      stripeSubscriptionId: "sub_seed_012",
      billingEmail: "billing@workshopco.com",
      maxActiveAssessments: 10,
      maxPartnerUsers: 25,
      isActive: true,
    },
    users: [
      {
        id: "seed-user-012a",
        email: "lead@workshopco.com",
        name: "Alex Koh",
        role: "partner_lead",
        organizationId: orgId,
        isActive: true,
      },
      ...attendeeUsers.map((u) => ({
        id: u.id,
        email: u.email,
        name: u.name,
        role: u.role,
        organizationId: orgId,
        isActive: true,
      })),
    ],
    assessments: [
      {
        id: assessmentId,
        companyName: "ClientCo Industries",
        industry: "Manufacturing",
        country: "MY",
        operatingCountries: ["MY", "SG"],
        companySize: "LARGE",
        revenueBand: "$100M-$500M",
        currentErp: "SAP ECC 6.0",
        sapVersion: "2508",
        status: "process_review",
        createdBy: "seed-user-012b",
        organizationId: orgId,
        employeeCount: 3000,
        annualRevenue: 250000000,
        currencyCode: "MYR",
        targetGoLiveDate: new Date(Date.now() + 300 * 24 * 60 * 60 * 1000),
        deploymentModel: "cloud",
        sapModules: ["FI", "CO", "MM", "SD", "PP"],
        keyProcesses: ["Order-to-Cash", "Procure-to-Pay", "Record-to-Report"],
        languageRequirements: ["EN", "MS"],
        regulatoryFrameworks: ["SST", "MFRS"],
        itLandscapeSummary: "SAP ECC 6.0 with custom bolt-ons",
        currentErpVersion: "EHP8",
        migrationApproach: "brownfield",
        profileCompletedAt: new Date(Date.now() - 21 * 24 * 60 * 60 * 1000),
        profileCompletedBy: "seed-user-012b",
        phaseNumber: 1,
      },
    ],
    workshopSession: {
      id: sessionId,
      assessmentId,
      sessionCode: "WS012A",
      title: "Finance Process Classification Workshop",
      description: "Live workshop to classify Accounts Payable and Accounts Receivable process steps with process owners and executive sponsor.",
      status: "in_progress",
      facilitatorId: "seed-user-012b",
      facilitatorName: "Hannah Yeoh",
      scheduledAt: new Date(Date.now() - 60 * 60 * 1000),
      startedAt: new Date(Date.now() - 45 * 60 * 1000),
      completedAt: null,
      attendeeCount: 5,
      notes: null,
      facilitatorNotes: "Focus on AP invoice processing first, then move to AR collections.",
      agenda: {
        items: [
          { order: 1, title: "Welcome & Overview", duration: 5, status: "completed" },
          { order: 2, title: "AP Invoice Processing", duration: 20, status: "in_progress" },
          { order: 3, title: "AP Payment Runs", duration: 15, status: "pending" },
          { order: 4, title: "AR Invoice Creation", duration: 15, status: "pending" },
          { order: 5, title: "AR Collections", duration: 15, status: "pending" },
          { order: 6, title: "Wrap-up & Action Items", duration: 10, status: "pending" },
        ],
      },
      currentStepId: workshopStepIds[4],
      currentScopeItemId: "J60",
      duration: null,
    },
    workshopAttendees,
    workshopVotes,
    actionItems: [
      {
        id: "seed-action-012-001",
        sessionId,
        title: "Clarify custom payment approval levels",
        description: "Need to confirm the number of approval levels required for vendor invoices above MYR 50,000.",
        assignedTo: "seed-user-012c",
        assignedToName: "Mohan Raj",
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        status: "open",
        priority: "high",
        relatedStepId: workshopStepIds[2],
        relatedScopeItemId: "J60",
      },
      {
        id: "seed-action-012-002",
        sessionId,
        title: "Document current procurement approval matrix",
        description: "Provide the current approval matrix for purchase orders and contracts.",
        assignedTo: "seed-user-012d",
        assignedToName: "Nurul Aisyah",
        dueDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
        status: "open",
        priority: "medium",
        relatedStepId: null,
        relatedScopeItemId: "J10",
      },
    ],
  };
}
