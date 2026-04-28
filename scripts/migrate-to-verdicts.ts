/**
 * Phase 3 — AD-1 backfill: migrate existing ClientRequirement verdict columns
 * into ClassificationVerdict + VerdictScopeItem rows.
 *
 * Strategy:
 *   1. For every Assessment with at least one classified ClientRequirement,
 *      create a synthetic ClassificationPass labelled "Pre-rebuild migration".
 *   2. For every classified requirement (solutionProviderResponse non-null),
 *      create one ClassificationVerdict pointing to that pass.
 *   3. Parse ClientRequirement.scopeItemIds (free text) and create
 *      VerdictScopeItem rows for every cited ID that exists in the catalog.
 *      Stale citations (the 5 IDs identified in Phase 0: 1WM, 1FW, 41Z, 1MD,
 *      IS) are dropped with a CSV report — they need hand reconciliation
 *      OR a re-classification pass, not a fake citation.
 *   4. Set ClientRequirement.currentVerdictId to point at the new verdict.
 *
 * Idempotent — re-running detects already-migrated requirements (those with
 * non-null currentVerdictId) and skips them.
 *
 * Outputs:
 *   - logs/migrate-to-verdicts.log — summary + per-assessment counts
 *   - logs/stale-citations.csv — requirement / cited-token / suggestion (manual review)
 *
 * Usage:
 *   $ pnpm tsx scripts/migrate-to-verdicts.ts
 */

import { PrismaClient } from "@prisma/client";
import { writeFileSync, mkdirSync, appendFileSync } from "fs";
import { join } from "path";

const KNOWN_EXTENSIBILITY_TAGS = new Set(["KUE", "ILM", "RAL"]);

interface StaleCitationRow {
  assessmentId: string;
  requirementId: string;
  module: string;
  code: string;
  citedToken: string;
  context: string;
}

const VALID_VERDICT_PREFIXES = /^(O|C|G|N\/A)\b/i;

function bucketRoleForVerdict(verdict: string): "primary" | "gap-target" {
  if (/^G\b/i.test(verdict)) return "gap-target";
  return "primary";
}

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  const logDir = join(__dirname, "..", "logs");
  mkdirSync(logDir, { recursive: true });
  const logPath = join(logDir, "migrate-to-verdicts.log");
  const stalePath = join(logDir, "stale-citations.csv");
  writeFileSync(logPath, `Migration started: ${new Date().toISOString()}\n\n`);
  writeFileSync(stalePath, "assessmentId,requirementId,module,code,citedToken,context\n");

  function log(s: string): void {
    console.log(s);
    appendFileSync(logPath, s + "\n");
  }
  function logStale(r: StaleCitationRow): void {
    appendFileSync(
      stalePath,
      [r.assessmentId, r.requirementId, r.module, r.code, r.citedToken, JSON.stringify(r.context)].join(",") + "\n",
    );
  }

  // 1. Catalog snapshot for FK validation
  const catalogRows = await prisma.scopeItem.findMany({ select: { id: true } });
  const catalog = new Set(catalogRows.map((r) => r.id));
  log(`Catalog has ${catalog.size} scope items`);

  // 2. Active protocol — used for the synthetic pass
  const protocol = await prisma.classificationProtocol.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: "desc" },
  });
  if (!protocol) throw new Error("No active ClassificationProtocol — seed Phase 2 first");

  // 3. Find every assessment with at least one classified+unmigrated requirement
  const assessmentsToMigrate = await prisma.assessment.findMany({
    where: {
      clientRequirements: {
        some: {
          solutionProviderResponse: { not: null },
          currentVerdictId: null,
        },
      },
    },
    select: { id: true, companyName: true, catalogVersionId: true, status: true },
  });
  log(`Assessments to migrate: ${assessmentsToMigrate.length}`);

  let totalMigrated = 0;
  let totalStaleDropped = 0;
  let totalCitationsCreated = 0;

  for (const assessment of assessmentsToMigrate) {
    if (!assessment.catalogVersionId) {
      log(`SKIP assessment ${assessment.id} (${assessment.companyName}) — no catalogVersionId`);
      continue;
    }

    const reqs = await prisma.clientRequirement.findMany({
      where: {
        assessmentId: assessment.id,
        solutionProviderResponse: { not: null },
        currentVerdictId: null,
      },
      select: {
        id: true, module: true, code: true,
        solutionProviderResponse: true, solutionProviderRemarks: true,
        sapModule: true, scopeItemIds: true, scopeItemNames: true,
        erpModuleSupporting: true,
      },
    });

    if (reqs.length === 0) continue;

    // One synthetic pass per assessment migration.
    const pass = await prisma.classificationPass.create({
      data: {
        assessmentId: assessment.id,
        protocolVersionId: protocol.id,
        catalogVersionId: assessment.catalogVersionId,
        startedAt: new Date(),
        completedAt: new Date(),
        actor: "migrate-to-verdicts.ts",
        actorRole: "orchestrator",
        summaryJson: { source: "Pre-rebuild migration", count: reqs.length },
      },
    });

    let assessmentStaleDropped = 0;
    let assessmentCitationsCreated = 0;

    for (const r of reqs) {
      const verdictText = (r.solutionProviderResponse ?? "").trim();
      if (!VALID_VERDICT_PREFIXES.test(verdictText)) {
        // e.g. legacy "NM - Not Met" / "UD - Under Development" — skip with a log line
        log(`SKIP req ${r.id} (${r.module}/${r.code}) — non-standard verdict "${verdictText.slice(0, 30)}"`);
        continue;
      }

      // Parse cited scope IDs; validate against catalog
      const citedTokens = (r.scopeItemIds ?? "")
        .split(/[,;]+/)
        .map((s) => s.trim())
        .filter((s) => s && s !== "—");

      const validCitations: { scopeItemId: string; role: "primary" | "gap-target" }[] = [];
      const role = bucketRoleForVerdict(verdictText);

      for (const tok of citedTokens) {
        if (catalog.has(tok)) {
          validCitations.push({ scopeItemId: tok, role });
        } else if (KNOWN_EXTENSIBILITY_TAGS.has(tok)) {
          // KUE / ILM / RAL are not catalog scope items but are valid extensibility
          // mechanisms. Drop silently — the citation lives in remarks instead.
        } else {
          // Stale or hallucinated. Drop and log.
          assessmentStaleDropped++;
          totalStaleDropped++;
          logStale({
            assessmentId: assessment.id,
            requirementId: r.id,
            module: r.module,
            code: r.code,
            citedToken: tok,
            context: `verdict=${verdictText.slice(0, 30)} sapModule=${r.sapModule ?? "—"}`,
          });
        }
      }

      const verdict = await prisma.classificationVerdict.create({
        data: {
          requirementId: r.id,
          passId: pass.id,
          protocolVersionId: protocol.id,
          verdict: verdictText,
          confidence: null,
          sapModule: r.sapModule,
          remarksMd: r.solutionProviderRemarks ?? "",
          actor: "migrate-to-verdicts.ts",
          source: "ORCHESTRATOR",
          isCurrent: true,
          frozenAt: assessment.status === "signed_off" ? new Date() : null,
          scopeCitations: {
            create: validCitations.map((c) => ({
              scopeItemId: c.scopeItemId,
              role: c.role,
            })),
          },
        },
      });
      assessmentCitationsCreated += validCitations.length;
      totalCitationsCreated += validCitations.length;

      await prisma.clientRequirement.update({
        where: { id: r.id },
        data: { currentVerdictId: verdict.id },
      });

      totalMigrated++;
    }

    log(`Migrated ${reqs.length} requirements for assessment ${assessment.id} (${assessment.companyName}) — ${assessmentCitationsCreated} citations valid, ${assessmentStaleDropped} stale dropped`);
  }

  log("");
  log(`=== TOTAL ===`);
  log(`Migrated: ${totalMigrated} requirements → ClassificationVerdict rows`);
  log(`Citations created: ${totalCitationsCreated} valid VerdictScopeItem rows`);
  log(`Stale citations dropped: ${totalStaleDropped} (see logs/stale-citations.csv for review)`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
