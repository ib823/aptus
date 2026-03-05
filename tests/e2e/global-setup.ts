/**
 * Playwright global setup — seeds test users for each role and creates
 * authenticated sessions with separate storageState files.
 */

import { PrismaClient } from "@prisma/client";
import { randomBytes } from "crypto";
import path from "path";
import fs from "fs";
import { config } from "dotenv";

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

  // External roles need MFA/TOTP marked as verified for E2E testing
  const externalRoles = ["process_owner", "it_lead", "executive"];
  const isExternal = externalRoles.includes(user.role);

  const dbUser = await prisma.user.upsert({
    where: { email: user.email },
    update: {
      name: user.name, role: user.role, isActive: true,
      mfaEnabled: isExternal, totpVerified: isExternal,
    },
    create: {
      email: user.email, name: user.name, role: user.role, isActive: true,
      mfaEnabled: isExternal, totpVerified: isExternal,
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
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  const needsMfa = isExternal;

  await prisma.session.create({
    data: {
      userId: dbUser.id,
      token,
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
  } finally {
    await prisma.$disconnect();
  }
}

export default globalSetup;
