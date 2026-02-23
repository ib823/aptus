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

const prisma = new PrismaClient();

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
    where: {
      role: {
        in: [
          "platform_admin", "partner_lead", "consultant", "project_manager",
          "solution_architect", "process_owner", "it_lead", "data_migration_lead",
          "executive_sponsor", "viewer", "client_admin",
        ],
      },
    },
  });

  // Check for unrecognized roles
  const allUsers = await prisma.user.findMany({ select: { role: true } });
  const validRoles = new Set([
    "platform_admin", "partner_lead", "consultant", "project_manager",
    "solution_architect", "process_owner", "it_lead", "data_migration_lead",
    "executive_sponsor", "viewer", "client_admin",
  ]);
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
