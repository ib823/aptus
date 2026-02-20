/**
 * Playwright global teardown — cleans up test data after E2E tests.
 */

import { PrismaClient } from "@prisma/client";
import path from "path";
import fs from "fs";
import { config } from "dotenv";

config({ path: path.join(__dirname, "../../.env.local") });

const STORAGE_STATE_PATH = path.join(__dirname, ".auth-state.json");

async function globalTeardown(): Promise<void> {
  const prisma = new PrismaClient();

  try {
    // Clean up sessions for test users
    await prisma.session.deleteMany({
      where: { user: { email: { endsWith: "@aptus.test" } } },
    });

    // Remove storage state file
    if (fs.existsSync(STORAGE_STATE_PATH)) {
      fs.unlinkSync(STORAGE_STATE_PATH);
    }

    console.log("[E2E Teardown] Test data cleaned up");
  } finally {
    await prisma.$disconnect();
  }
}

export default globalTeardown;
