/**
 * READ-ONLY audit of standing API access. Writes nothing, ever.
 *
 * WHY THIS EXISTS. Two governance controls were tightened after rows had
 * already been written under the looser rules, and neither tightening is
 * retroactive:
 *
 *   1. `evaluateDecision` now refuses ANY granting decision with a null expiry
 *      (src/lib/studio/grants.ts, GRANT_REQUIRES_EXPIRY). It used to bind only
 *      writes, so READ grants approved before that change authorise reads of a
 *      client's SAP data FOREVER. A settled grant cannot be re-decided and
 *      there is no revocation path, so nothing ends them.
 *
 *   2. Credential issue and rotate now refuse a solution with any owner slot
 *      empty (src/app/api/studio/clients/route.ts). Credentials minted before
 *      that change exist on unowned solutions with no accountable party.
 *
 * The Console surfaces both conditions honestly — the Credential Register
 * labels a pre-fix row "issued while unowned". That is the detector working,
 * not the control failing. This script exists to answer the question the
 * detector raises: HOW MANY, WHICH ONES, and which reach production.
 *
 * Usage:
 *   DATABASE_URL=... node scripts/audit-standing-access.mjs
 *   DATABASE_URL=... node scripts/audit-standing-access.mjs --json
 *
 * Point it at one database deliberately. Note that a shared preview/production
 * database will return preview-written test rows mixed in with real ones; the
 * heuristics below flag likely test artefacts but cannot be authoritative.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const asJson = process.argv.includes("--json");

/** Decisions that actually confer access — mirrors GRANTING in lib/studio/grants.ts. */
const GRANTING = new Set(["APPROVED", "SANDBOX_ONLY", "READ_ONLY"]);

/**
 * Names that look like they came from a test run rather than a person.
 * Deliberately conservative and advisory only — a real solution can have an
 * odd name, so this NEVER decides anything, it only annotates.
 */
function looksLikeTestArtefact(name) {
  if (!name) return false;
  const n = name.trim();
  return (
    /^(qa|e2e|test|repro|smoke)[-_ ]/i.test(n) ||
    /(e2e|regression|repro)/i.test(n) ||
    /<script|onerror=/i.test(n) ||
    // Keyboard mash: 8+ chars, letters only, no vowel-consonant rhythm.
    (/^[a-z]{8,}$/.test(n) && !/[aeiou]{1}/i.test(n.slice(1, -1)))
  );
}

function fmt(d) {
  return d ? new Date(d).toISOString().slice(0, 10) : "never";
}

async function main() {
  const now = new Date();

  const [grants, clients, solutions] = await Promise.all([
    prisma.apiAccessGrant.findMany({
      select: {
        id: true,
        environment: true,
        operation: true,
        decision: true,
        justification: true,
        expiresAt: true,
        decidedAt: true,
        createdAt: true,
        solution: {
          select: {
            id: true,
            name: true,
            status: true,
            technicalOwnerId: true,
            businessOwnerId: true,
            supportOwnerId: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.solutionClient.findMany({
      select: {
        id: true,
        label: true,
        environment: true,
        isActive: true,
        revokedAt: true,
        expiresAt: true,
        lastUsedAt: true,
        createdAt: true,
        solution: {
          select: {
            id: true,
            name: true,
            status: true,
            technicalOwnerId: true,
            businessOwnerId: true,
            supportOwnerId: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.solution.findMany({
      select: {
        id: true,
        name: true,
        status: true,
        dataClass: true,
        technicalOwnerId: true,
        businessOwnerId: true,
        supportOwnerId: true,
      },
    }),
  ]);

  const missingOwners = (s) =>
    ["technicalOwnerId", "businessOwnerId", "supportOwnerId"].filter((k) => !s?.[k]);

  // ── 1. Grants that authorise something and can never end ────────────
  const unbounded = grants
    .filter((g) => GRANTING.has(g.decision) && g.expiresAt === null)
    .map((g) => ({
      id: g.id,
      solution: g.solution?.name ?? "(deleted)",
      solutionStatus: g.solution?.status ?? null,
      environment: g.environment,
      operation: g.operation,
      decision: g.decision,
      decidedAt: fmt(g.decidedAt),
      missingOwners: missingOwners(g.solution),
      justification: (g.justification ?? "").slice(0, 140),
      likelyTestArtefact: looksLikeTestArtefact(g.solution?.name),
    }));

  // ── 2. Grants already lapsed (for contrast: these DID end) ──────────
  const lapsed = grants.filter(
    (g) => GRANTING.has(g.decision) && g.expiresAt !== null && g.expiresAt <= now,
  ).length;

  // ── 3. Credentials that never expire and are still live ─────────────
  const neverExpiring = clients
    .filter((c) => c.expiresAt === null && c.isActive && c.revokedAt === null)
    .map((c) => ({
      id: c.id,
      label: c.label,
      solution: c.solution?.name ?? "(deleted)",
      solutionStatus: c.solution?.status ?? null,
      environment: c.environment,
      createdAt: fmt(c.createdAt),
      lastUsedAt: fmt(c.lastUsedAt),
      missingOwners: missingOwners(c.solution),
      likelyTestArtefact: looksLikeTestArtefact(c.solution?.name),
    }));

  // ── 4. Live credentials on solutions nobody owns ────────────────────
  const unownedCredentials = neverExpiring
    .concat(
      clients
        .filter((c) => c.expiresAt !== null && c.isActive && c.revokedAt === null)
        .map((c) => ({
          id: c.id,
          label: c.label,
          solution: c.solution?.name ?? "(deleted)",
          solutionStatus: c.solution?.status ?? null,
          environment: c.environment,
          createdAt: fmt(c.createdAt),
          lastUsedAt: fmt(c.lastUsedAt),
          missingOwners: missingOwners(c.solution),
          likelyTestArtefact: looksLikeTestArtefact(c.solution?.name),
        })),
    )
    .filter((c) => c.missingOwners.length > 0);

  // ── 5. Duplicate solution names — why the registers are unreadable ──
  const byName = new Map();
  for (const s of solutions) {
    byName.set(s.name, (byName.get(s.name) ?? 0) + 1);
  }
  const duplicateNames = [...byName.entries()]
    .filter(([, n]) => n > 1)
    .map(([name, n]) => ({ name, count: n }));

  const report = {
    generatedAt: now.toISOString(),
    totals: {
      grants: grants.length,
      solutions: solutions.length,
      credentials: clients.length,
    },
    unboundedGrants: unbounded,
    unboundedProdGrants: unbounded.filter((g) => g.environment === "PROD"),
    lapsedGrantCount: lapsed,
    neverExpiringCredentials: neverExpiring,
    credentialsOnUnownedSolutions: unownedCredentials,
    duplicateSolutionNames: duplicateNames,
    likelyTestArtefacts: solutions
      .filter((s) => looksLikeTestArtefact(s.name))
      .map((s) => ({ name: s.name, status: s.status, dataClass: s.dataClass })),
  };

  if (asJson) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const h = (t) => console.log(`\n${t}\n${"-".repeat(t.length)}`);

  console.log(`Standing-access audit — ${now.toISOString()}`);
  console.log(
    `${grants.length} grants · ${clients.length} credentials · ${solutions.length} solutions`,
  );

  h(`Grants that authorise access and can never end: ${unbounded.length}`);
  if (unbounded.length === 0) {
    console.log("none — every granting decision is time-bounded");
  }
  for (const g of unbounded) {
    const flags = [
      g.environment === "PROD" ? "**PROD**" : g.environment,
      g.solutionStatus,
      g.missingOwners.length ? `unowned(${g.missingOwners.length})` : null,
      g.likelyTestArtefact ? "looks-like-test-artefact" : null,
    ]
      .filter(Boolean)
      .join(" · ");
    console.log(`  ${g.solution} — ${g.operation} — ${flags}`);
    console.log(`      decided ${g.decidedAt}  id=${g.id}`);
    if (g.justification) console.log(`      "${g.justification}"`);
  }

  h(`Live credentials with no expiry: ${neverExpiring.length}`);
  for (const c of neverExpiring) {
    const flags = [
      c.environment,
      c.solutionStatus,
      c.missingOwners.length ? `unowned(${c.missingOwners.length})` : null,
      c.likelyTestArtefact ? "looks-like-test-artefact" : null,
    ]
      .filter(Boolean)
      .join(" · ");
    console.log(`  ${c.solution} / ${c.label} — ${flags}`);
    console.log(`      created ${c.createdAt}  last used ${c.lastUsedAt}  id=${c.id}`);
  }

  h(`Live credentials on solutions with an empty owner slot: ${unownedCredentials.length}`);
  for (const c of unownedCredentials) {
    console.log(`  ${c.solution} / ${c.label} — missing: ${c.missingOwners.join(", ")}`);
  }

  h(`Duplicate solution names: ${duplicateNames.length}`);
  for (const d of duplicateNames) console.log(`  ${d.name} ×${d.count}`);

  h(`Solutions that look like test artefacts: ${report.likelyTestArtefacts.length}`);
  for (const s of report.likelyTestArtefacts) {
    console.log(`  ${s.name} — ${s.status} — dataClass="${s.dataClass}"`);
  }

  console.log(
    "\nNOTE: 'looks-like-test-artefact' is a naming heuristic, not a verdict. " +
      "On a database shared with preview deployments, expect preview-written rows here.",
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
