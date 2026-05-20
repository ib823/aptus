/**
 * Playwright global setup — seeds test users for each role and creates
 * authenticated sessions with separate storageState files.
 *
 * Also seeds a presales fixture (PresalesBundle + Grant + Session) and
 * exports PRESALES_TEST_BUNDLE_ID, PRESALES_TEST_SCOPE_CODE,
 * PRESALES_TEST_SESSION_COOKIE into process.env so the redaction integration
 * test (tests/e2e/external-redaction.unauth.spec.ts) can pick them up.
 */

import { PrismaClient } from "@prisma/client";
import { createHash, randomBytes } from "crypto";
import path from "path";
import fs from "fs";
import { config } from "dotenv";
import { scopeItems } from "../../src/lib/fts/data";
import { hashUserAgent } from "../../src/lib/presales/ua-fingerprint";
import {
  PRESALES_TEST_BUNDLE_ID,
  PRESALES_TEST_GRANT_ID,
  PRESALES_TEST_SCOPE_CODE,
  PRESALES_TEST_UA,
} from "./fixtures/presales-constants";

config({ path: path.join(__dirname, "../../.env.local") });

const STATE_DIR = __dirname;

export const TEST_USERS = {
  admin: { email: "e2e-admin@abeam.test", name: "E2E Admin", role: "admin" },
  journeysAdmin: {
    email: "e2e-journeys-admin@abeam.test",
    name: "E2E Journeys Admin",
    role: "admin",
  },
  consultant: { email: "e2e-consultant@abeam.test", name: "E2E Consultant", role: "consultant" },
  processOwner: { email: "e2e-po@abeam.test", name: "E2E Process Owner", role: "process_owner" },
  itLead: { email: "e2e-it@abeam.test", name: "E2E IT Lead", role: "it_lead" },
  executive: { email: "e2e-exec@abeam.test", name: "E2E Executive", role: "executive" },
} as const;

export function storageStatePath(role: string): string {
  return path.join(STATE_DIR, `.auth-state-${role}.json`);
}

// Backward compat
export const STORAGE_STATE_PATH = storageStatePath("admin");

async function createUserAndSession(
  prisma: PrismaClient,
  user: { email: string; name: string; role: string },
): Promise<{ userId: string; token: string }> {
  await prisma.session.deleteMany({
    where: { user: { email: user.email } },
  });

  // mfaEnabled is now a soft preference; mark external roles as enrolled for parity with prod
  const externalRoles = ["process_owner", "it_lead", "executive"];
  const isExternal = externalRoles.includes(user.role);

  const dbUser = await prisma.user.upsert({
    where: { email: user.email },
    update: {
      name: user.name, role: user.role, isActive: true,
      mfaEnabled: isExternal,
    },
    create: {
      email: user.email, name: user.name, role: user.role, isActive: true,
      mfaEnabled: isExternal,
    },
  });

  await prisma.onboardingProgress.upsert({
    where: { userId: dbUser.id },
    update: {
      role: user.role,
      currentStep: 3,
      completedSteps: [0, 1, 2],
      isComplete: true,
      completedAt: new Date(),
    },
    create: {
      userId: dbUser.id,
      role: user.role,
      currentStep: 3,
      completedSteps: [0, 1, 2],
      isComplete: true,
      completedAt: new Date(),
    },
  });

  const token = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  const needsMfa = isExternal;

  await prisma.session.create({
    data: {
      userId: dbUser.id,
      tokenHash,
      expiresAt,
      ipAddress: "127.0.0.1",
      userAgent: `Playwright E2E (${user.role})`,
      mfaVerified: needsMfa,
      mfaVerifiedAt: needsMfa ? new Date() : null,
    },
  });

  return { userId: dbUser.id, token };
}

function writeStorageState(filePath: string, token: string): void {
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const state = {
    cookies: [
      {
        name: "abeam-session",
        value: token,
        domain: "localhost",
        path: "/",
        httpOnly: true,
        secure: false,
        sameSite: "Lax" as const,
        expires: Math.floor(expiresAt.getTime() / 1000),
      },
    ],
    origins: [],
  };
  fs.writeFileSync(filePath, JSON.stringify(state, null, 2));
}

async function warmUpApp(baseUrl: string): Promise<void> {
  const warmupPaths = ["/login", "/dashboard", "/assessment"];
  const deadline = Date.now() + 180_000;
  let lastError: unknown;

  for (const route of warmupPaths) {
    let ready = false;
    while (Date.now() < deadline && !ready) {
      try {
        const res = await fetch(`${baseUrl}${route}`, { redirect: "manual" });
        if (res.status >= 200 && res.status < 500) {
          ready = true;
          break;
        }
        lastError = new Error(`Warmup for ${route} returned status ${res.status}`);
      } catch (error) {
        lastError = error;
      }
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
    if (!ready) {
      throw new Error(
        `Timed out warming route ${route} at ${baseUrl}. Last error: ${String(lastError)}`,
      );
    }
  }
}

async function seedPresalesFixture(prisma: PrismaClient, opts: {
  organizationId: string;
  creatorUserId: string;
  assessmentId: string;
}): Promise<void> {
  // The five deleteMany calls below rely on the CASCADE strategy from
  // migration 20260520000000_presales_workbench_pass1 §4. Specifically:
  // deleting a PresalesBundle cascades to PresalesAccessGrant,
  // PresalesSession, PresalesBundleDecision, and PresalesAuditEvent rows.
  // The explicit per-table deletions are belt-and-braces for environments
  // where the seeder is partially applied; CASCADE handles the canonical
  // case. If a future maintainer flips any of those FKs from CASCADE to
  // RESTRICT, the deletion order below stops being sufficient and this
  // seeder will leave orphaned rows that fail the unique-token-hash
  // constraint on re-run. Revisit the deletion order before changing the
  // CASCADE strategy in the migration.
  //
  // Build a snapshot that DELIBERATELY carries the IP-bearing fields. The
  // redaction integration test will fail if any of these survive to the
  // hydration JSON at /c/s/[scopeCode]. That's the whole point of the test.
  const bd9 = scopeItems.BD9;
  const bdg = scopeItems.BDG;
  if (!bd9 || !bdg) {
    throw new Error("[E2E Setup] BD9/BDG scope content missing from src/lib/fts/data");
  }
  const snapshot = [bd9, bdg];

  const bundleId = PRESALES_TEST_BUNDLE_ID;
  const grantId = PRESALES_TEST_GRANT_ID;
  const sessionId = randomBytes(24).toString("hex");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days
  const sessionExpiresAt = new Date(now.getTime() + 8 * 60 * 60 * 1000); // 8h cap

  // Idempotent: nuke any prior fixture rows, recreate cleanly.
  await prisma.presalesSession.deleteMany({ where: { bundleId } });
  await prisma.presalesAuditEvent.deleteMany({ where: { bundleId } });
  await prisma.presalesBundleDecision.deleteMany({ where: { bundleId } });
  await prisma.presalesAccessGrant.deleteMany({ where: { bundleId } });
  await prisma.presalesBundle.deleteMany({ where: { id: bundleId } });

  await prisma.presalesBundle.create({
    data: {
      id: bundleId,
      name: "E2E Presales Bundle",
      assessmentId: opts.assessmentId,
      organizationId: opts.organizationId,
      createdBy: opts.creatorUserId,
      scopeCodes: ["BD9", "BDG"],
      defaultScopeCode: PRESALES_TEST_SCOPE_CODE,
      contentSnapshotJson: snapshot as unknown as object,
      clientCompanyName: "Acme Corp (E2E)",
      startsAt: now,
      expiresAt,
      acknowledgementTextVersion: "v1",
      pdpaNoticeTextVersion: "v1",
    },
  });

  const tokenRaw = "e2e-presales-token-" + randomBytes(16).toString("hex");
  const tokenHash = createHash("sha256").update(tokenRaw).digest("hex");

  await prisma.presalesAccessGrant.create({
    data: {
      id: grantId,
      bundleId,
      email: "e2e-prospect@acme.test",
      displayName: "E2E Prospect",
      canSignOff: true,
      tokenHash,
      startsAt: now,
      expiresAt,
      acknowledgedAt: now,
      acknowledgedIp: "127.0.0.1",
      acknowledgedUa: "Playwright E2E",
      acknowledgementTextVersion: "v1",
      pdpaConsentCrossBorder: true,
      pdpaConsentTextVersion: "v1",
      otpAttemptCount: 0,
    },
  });

  // Pre-write the otp_verified audit so /c/s/[scopeCode] does not redirect
  // to /c/verify. The redaction test focuses on the workbench surface; the
  // OTP gate is exercised in a separate test.
  //
  // The per-device OTP check matches on payload.uaHash, so we hash the
  // pinned test UA and write that into the row. The integration test sends
  // the same UA via Playwright's user-agent override on every request.
  await prisma.presalesAuditEvent.create({
    data: {
      bundleId,
      grantId,
      eventType: "otp_verified",
      payload: { uaHash: hashUserAgent(PRESALES_TEST_UA) },
    },
  });

  await prisma.presalesSession.create({
    data: {
      id: sessionId,
      grantId,
      bundleId,
      ipAtIssuance: "127.0.0.1",
      userAgentAtIssuance: "Playwright E2E",
      issuedAt: now,
      expiresAt: sessionExpiresAt,
      lastActivityAt: now,
      idleTimeoutSec: 3600,
    },
  });

  process.env.PRESALES_TEST_BUNDLE_ID = bundleId;
  process.env.PRESALES_TEST_SCOPE_CODE = PRESALES_TEST_SCOPE_CODE;
  process.env.PRESALES_TEST_SESSION_COOKIE = sessionId;

  console.log(
    `[E2E Setup] Presales fixture seeded (bundle=${bundleId}, scope=${PRESALES_TEST_SCOPE_CODE})`,
  );
}

async function globalSetup(): Promise<void> {
  const prisma = new PrismaClient();
  const baseUrl = process.env.BASE_URL ?? "http://localhost:3003";

  try {
    await warmUpApp(baseUrl);

    // Create all role users and sessions
    const userIds = new Map<string, string>();
    for (const [key, user] of Object.entries(TEST_USERS)) {
      const { userId, token } = await createUserAndSession(prisma, user);
      userIds.set(key, userId);
      writeStorageState(storageStatePath(key), token);
    }

    const adminId = userIds.get("admin")!;

    // Ensure a test organization exists
    const org = await prisma.organization.upsert({
      where: { id: "e2e-test-org" },
      update: { name: "E2E Test Org" },
      create: { id: "e2e-test-org", name: "E2E Test Org", type: "partner" },
    });

    // Create a test assessment if none exists
    const existing = await prisma.assessment.findFirst({
      where: { companyName: "E2E Test Corp", deletedAt: null },
    });

    if (!existing) {
      const assessment = await prisma.assessment.create({
        data: {
          companyName: "E2E Test Corp",
          industry: "Technology",
          country: "United States",
          companySize: "medium",
          sapVersion: "S/4HANA Cloud 2508",
          status: "in_progress",
          createdBy: adminId,
          organizationId: org.id,
        },
      });

      // Add stakeholders for each role
      const stakeholderRoles: Record<string, string> = {
        admin: "consultant",
        consultant: "consultant",
        processOwner: "process_owner",
        itLead: "it_lead",
        executive: "executive",
      };

      for (const [key, role] of Object.entries(stakeholderRoles)) {
        const user = TEST_USERS[key as keyof typeof TEST_USERS];
        await prisma.assessmentStakeholder.create({
          data: {
            assessmentId: assessment.id,
            userId: userIds.get(key)!,
            name: user.name,
            email: user.email,
            role,
            invitedBy: adminId,
            assignedAreas: role === "process_owner" ? ["Finance", "Procurement"] : [],
          },
        });
      }
    }

    console.log("[E2E Setup] Test users, sessions, and assessment created");

    const assessment = await prisma.assessment.findFirst({
      where: { companyName: "E2E Test Corp", deletedAt: null },
    });
    if (assessment) {
      await seedPresalesFixture(prisma, {
        organizationId: org.id,
        creatorUserId: adminId,
        assessmentId: assessment.id,
      });
    }
  } finally {
    await prisma.$disconnect();
  }
}

export default globalSetup;
