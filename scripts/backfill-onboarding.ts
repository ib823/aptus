/**
 * Backfill script: Mark all existing users as onboarding-complete.
 *
 * Run: npx tsx scripts/backfill-onboarding.ts
 *
 * Existing users who were active before onboarding was introduced
 * should not be forced through the wizard. This script creates
 * OnboardingProgress records with isComplete=true for every user
 * that doesn't already have one.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Starting onboarding backfill...");

  // Find users without an OnboardingProgress record
  const usersWithoutProgress = await prisma.user.findMany({
    where: {
      onboardingProgress: null,
    },
    select: {
      id: true,
      role: true,
    },
  });

  console.log(`Found ${usersWithoutProgress.length} users without onboarding progress.`);

  if (usersWithoutProgress.length === 0) {
    console.log("Nothing to backfill.");
    return;
  }

  // Create completed OnboardingProgress for each user
  const result = await prisma.onboardingProgress.createMany({
    data: usersWithoutProgress.map((user) => ({
      userId: user.id,
      role: user.role,
      currentStep: 0,
      completedSteps: [],
      skippedSteps: [],
      isComplete: true,
      completedAt: new Date(),
    })),
    skipDuplicates: true,
  });

  console.log(`Created ${result.count} onboarding progress records (all marked complete).`);
  console.log("Backfill complete.");
}

main()
  .catch((e) => {
    console.error("Backfill failed:", e);
    process.exit(1);
  })
  .finally(() => {
    prisma.$disconnect();
  });
