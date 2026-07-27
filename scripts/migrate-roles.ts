/**
 * Phase 17: Role migration script
 *
 * Non-destructive migration from 5-role to 11-role system:
 *   "admin"     → "platform_admin"
 *   "executive" → "executive_sponsor"
 *   Other roles pass through unchanged.
 *
 * Usage: npx tsx scripts/migrate-roles.ts
 */

import { PrismaClient } from "@prisma/client";

import { ALL_USER_ROLES } from "../src/types/assessment";

const prisma = new PrismaClient();

/**
 * Every current role, derived — never re-listed here.
 *
 * This file carried two hand-written copies of the role names, and both stopped
 * at eleven when `support` was added as the twelfth. The consequence was not
 * cosmetic: `alreadyMigrated` under-counted, and every support user in the
 * database was printed as `⚠ Unrecognized role` and skipped. A migration script
 * that reports a real role as unrecognised invites someone to "fix" it.
 *
 * `ALL_USER_ROLES` is `Object.keys` of a `Record<UserRole, …>`, so the compiler
 * refuses the next role until the union declares it.
 */
const CURRENT_ROLES: string[] = [...ALL_USER_ROLES];

const LEGACY_ROLE_MAP: Record<string, string> = {
  admin: "platform_admin",
  executive: "executive_sponsor",
};

async function main() {
  console.log("=== Phase 17: Role Migration ===\n");

  let usersUpdated = 0;
  let stakeholdersUpdated = 0;
  let skipped = 0;

  // 1. Migrate User.role
  for (const [oldRole, newRole] of Object.entries(LEGACY_ROLE_MAP)) {
    const users = await prisma.user.findMany({
      where: { role: oldRole },
      select: { id: true, email: true, role: true },
    });

    if (users.length === 0) {
      console.log(`  No users with role "${oldRole}" found — skipping.`);
      continue;
    }

    console.log(`  Found ${users.length} user(s) with role "${oldRole}" → "${newRole}"`);

    for (const user of users) {
      await prisma.user.update({
        where: { id: user.id },
        data: { role: newRole },
      });

      await prisma.decisionLogEntry.create({
        data: {
          assessmentId: "SYSTEM",
          entityType: "user",
          entityId: user.id,
          action: "ROLE_CHANGED",
          oldValue: { role: oldRole },
          newValue: { role: newRole, reason: "Phase 17 role migration" },
          actor: "system",
          actorRole: "platform_admin",
        },
      });

      usersUpdated++;
      console.log(`    ✓ ${user.email}: ${oldRole} → ${newRole}`);
    }
  }

  // 2. Migrate AssessmentStakeholder.role
  for (const [oldRole, newRole] of Object.entries(LEGACY_ROLE_MAP)) {
    const stakeholders = await prisma.assessmentStakeholder.findMany({
      where: { role: oldRole },
      select: { id: true, userId: true, assessmentId: true, role: true },
    });

    if (stakeholders.length === 0) {
      console.log(`  No stakeholders with role "${oldRole}" found — skipping.`);
      continue;
    }

    console.log(`  Found ${stakeholders.length} stakeholder(s) with role "${oldRole}" → "${newRole}"`);

    for (const s of stakeholders) {
      await prisma.assessmentStakeholder.update({
        where: { id: s.id },
        data: { role: newRole },
      });

      await prisma.decisionLogEntry.create({
        data: {
          assessmentId: s.assessmentId,
          entityType: "assessment_stakeholder",
          entityId: s.id,
          action: "ROLE_CHANGED",
          oldValue: { role: oldRole },
          newValue: { role: newRole, reason: "Phase 17 role migration" },
          actor: "system",
          actorRole: "platform_admin",
        },
      });

      stakeholdersUpdated++;
    }
  }

  // 3. Check for users with roles that are already new-system
  const alreadyMigrated = await prisma.user.count({
    where: { role: { in: CURRENT_ROLES } },
  });

  // Check for unrecognized roles
  const allUsers = await prisma.user.findMany({ select: { role: true } });
  const validRoles = new Set(CURRENT_ROLES);
  for (const u of allUsers) {
    if (!validRoles.has(u.role)) {
      console.warn(`  ⚠ Unrecognized role: "${u.role}"`);
      skipped++;
    }
  }

  console.log("\n=== Migration Complete ===");
  console.log(`  Users updated:        ${usersUpdated}`);
  console.log(`  Stakeholders updated: ${stakeholdersUpdated}`);
  console.log(`  Already migrated:     ${alreadyMigrated}`);
  if (skipped > 0) console.log(`  Unrecognized roles:   ${skipped}`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
