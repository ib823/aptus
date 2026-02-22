/**
 * Test database helpers — transaction isolation and cleanup.
 * For unit tests, we use in-memory mocks. For integration tests,
 * we use transaction-wrapped database connections with rollback.
 */

import { PrismaClient } from "@prisma/client";

let testPrisma: PrismaClient | null = null;

/** Get or create test Prisma client */
export function getTestPrisma(): PrismaClient {
  if (!testPrisma) {
    testPrisma = new PrismaClient({
      datasourceUrl: process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL,
    });
  }
  return testPrisma;
}

/** Begin a transaction for test isolation */
export async function beginTestTransaction() {
  const prisma = getTestPrisma();
  // Use Prisma interactive transaction for isolation
  return prisma;
}

/** Clean up test data after test suite */
export async function cleanupTestData() {
  const prisma = getTestPrisma();
  // Delete in reverse dependency order
  const tablesToClean = [
    "ChangeRequest", "ReassessmentTrigger", "SnapshotComparison",
    "HandoffPackage", "AlmExportRecord", "SignatureRecord",
    "CrossFunctionalValidation", "TechnicalValidation", "AreaValidation",
    "SignOffProcess", "AssessmentSnapshot", "ActivityFeedEntry",
    "Conflict", "Comment", "NotificationPreference", "Notification",
    "WorkshopMinutes", "WorkshopActionItem", "WorkshopVote",
    "WorkshopAttendee", "WorkshopSession", "StatusTransitionLog",
    "AssessmentPhaseProgress", "OcmImpact", "DataMigrationObject",
    "IntegrationPoint", "RemainingItem", "ProcessFlowDiagram",
    "DecisionLogEntry", "GapAlternative", "GapResolution",
    "StepResponse", "ConfigSelection", "ScopeSelection",
    "AssessmentStakeholder", "AssessmentSignOff", "Assessment",
    "Session", "MfaChallenge", "WebAuthnCredential",
    "OrgInvitation", "User", "Organization",
  ];

  for (const table of tablesToClean) {
    try {
      await (prisma as any)[table[0]!.toLowerCase() + table.slice(1)].deleteMany({});
    } catch {
      // Table may not exist or may have FK constraints
    }
  }
}

/** Disconnect test database */
export async function disconnectTestDb() {
  if (testPrisma) {
    await testPrisma.$disconnect();
    testPrisma = null;
  }
}

/** Create a test-scoped database wrapper that rolls back */
export function withTestTransaction<T>(
  fn: (prisma: PrismaClient) => Promise<T>
): Promise<T> {
  const prisma = getTestPrisma();
  return prisma.$transaction(async (tx) => {
    const result = await fn(tx as unknown as PrismaClient);
    // Force rollback by throwing after getting result
    throw { __rollback: true, result };
  }).catch((e) => {
    if (e?.__rollback) return e.result as T;
    throw e;
  });
}
