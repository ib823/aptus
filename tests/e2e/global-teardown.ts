/**
 * Playwright global teardown — cleans up test data after E2E tests.
 */

import { PrismaClient } from "@prisma/client";
import path from "path";
import fs from "fs";
import { config } from "dotenv";

config({ path: path.join(__dirname, "../../.env.local") });

const STATE_DIR = __dirname;

async function globalTeardown(): Promise<void> {
  const prisma = new PrismaClient();

  try {
    // Clean up sessions for test users
    await prisma.session.deleteMany({
      where: { user: { email: { endsWith: "@aptus.test" } } },
    });

    // Remove all storage state files
    const stateFiles = fs.readdirSync(STATE_DIR).filter((f) => f.startsWith(".auth-state"));
    for (const f of stateFiles) {
      fs.unlinkSync(path.join(STATE_DIR, f));
    }

    console.log("[E2E Teardown] Test data cleaned up");
  } finally {
    await prisma.$disconnect();
  }
}

export default globalTeardown;
