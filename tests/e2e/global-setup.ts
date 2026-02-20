/**
 * Playwright global setup — seeds a test user and session before E2E tests.
 * Writes a storageState JSON that Playwright uses for authenticated tests.
 */

import { PrismaClient } from "@prisma/client";
import { randomBytes } from "crypto";
import path from "path";
import fs from "fs";
import { config } from "dotenv";

// Load environment variables from .env.local (Next.js convention)
config({ path: path.join(__dirname, "../../.env.local") });

const STORAGE_STATE_PATH = path.join(__dirname, ".auth-state.json");

export const TEST_USER = {
  email: "e2e-admin@aptus.test",
  name: "E2E Admin",
  role: "admin",
};

async function globalSetup(): Promise<void> {
  const prisma = new PrismaClient();

  try {
    // Clean up any previous test data
    await prisma.session.deleteMany({
      where: { user: { email: TEST_USER.email } },
    });

    // Upsert the test user
    const user = await prisma.user.upsert({
      where: { email: TEST_USER.email },
      update: { name: TEST_USER.name, role: TEST_USER.role, isActive: true },
      create: {
        email: TEST_USER.email,
        name: TEST_USER.name,
        role: TEST_USER.role,
        isActive: true,
      },
    });

    // Create a session
    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await prisma.session.create({
      data: {
        userId: user.id,
        token,
        expiresAt,
        ipAddress: "127.0.0.1",
        userAgent: "Playwright E2E",
      },
    });

    // Write storageState with the session cookie
    const storageState = {
      cookies: [
        {
          name: "fit-portal-session",
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

    fs.writeFileSync(STORAGE_STATE_PATH, JSON.stringify(storageState, null, 2));
    console.log("[E2E Setup] Test user and session created");
  } finally {
    await prisma.$disconnect();
  }
}

export default globalSetup;
export { STORAGE_STATE_PATH };
