/**
 * Start a new brownfield classification pass for an assessment.
 *
 * Steps:
 *   1. Resolve the active protocol (or one passed by --protocol-version)
 *   2. Create a BrownfieldClassificationPass row
 *   3. Run the rule engine (auto-classifies items handled by deterministic rules)
 *   4. Print a summary + next-step shell commands
 *
 * Usage:
 *   $ pnpm tsx scripts/brownfield/start-pass.ts <assessmentId>
 *   $ pnpm tsx scripts/brownfield/start-pass.ts <assessmentId> \
 *       --protocol-version 1.0.0 \
 *       --parent-pass-id <id>
 */

import { prisma } from "../../src/lib/db/prisma";
import { runRuleEngine } from "./rule-engine";

interface StartPassOptions {
  protocolVersion?: string;
  protocolName?: string;
  parentPassId?: string;
  actor?: string;
}

export async function startPass(
  assessmentId: string,
  options: StartPassOptions = {},
): Promise<{ passId: string }> {
  const assessment = await prisma.brownfieldAssessment.findUnique({
    where: { id: assessmentId },
    select: { id: true, name: true, customerName: true, status: true, catalogVersionId: true },
  });
  if (!assessment) throw new Error(`BrownfieldAssessment ${assessmentId} not found`);
  if (assessment.status === "signed_off") {
    throw new Error(
      `Assessment ${assessmentId} is signed_off — refusing to start a pass. Unseal first.`,
    );
  }

  // Resolve protocol — prefer the active one for this catalog
  const protocol = options.protocolVersion
    ? await prisma.brownfieldClassificationProtocol.findFirst({
        where: {
          catalogVersionId: assessment.catalogVersionId,
          version: options.protocolVersion,
          ...(options.protocolName ? { name: options.protocolName } : {}),
        },
      })
    : await prisma.brownfieldClassificationProtocol.findFirst({
        where: { catalogVersionId: assessment.catalogVersionId, isActive: true },
        orderBy: { createdAt: "desc" },
      });
  if (!protocol) {
    throw new Error(
      `No matching brownfield classification protocol found. Run scripts/brownfield/seed-protocol.ts first.`,
    );
  }

  console.log(`[start-pass] Assessment    : ${assessment.customerName} (${assessmentId})`);
  console.log(`[start-pass] Protocol      : ${protocol.name} v${protocol.version} (${protocol.id})`);
  console.log(`[start-pass] Catalog       : ${assessment.catalogVersionId}`);

  const pass = await prisma.brownfieldClassificationPass.create({
    data: {
      brownfieldAssessmentId: assessmentId,
      protocolVersionId: protocol.id,
      catalogVersionId: assessment.catalogVersionId,
      actor: options.actor ?? "orchestrator",
      actorRole: "orchestrator",
      ...(options.parentPassId ? { parentPassId: options.parentPassId } : {}),
    },
  });

  console.log(`[start-pass] Created pass  : ${pass.id}`);
  console.log(`[start-pass] Running rule engine ...`);

  const ruleResult = await runRuleEngine(pass.id);

  // Mark completedAt only AFTER both rule engine + apply scripts have run.
  // Leaving completedAt null indicates the pass is still in progress.

  console.log("");
  console.log(`================================================`);
  console.log(`PASS ${pass.id} — RULE ENGINE COMPLETE`);
  console.log(`================================================`);
  console.log(`Total items in catalog : ${ruleResult.totalItems}`);
  console.log(`Auto-classified by rule: ${ruleResult.ruled}`);
  console.log(`Pending classification : ${ruleResult.unhandled}`);
  console.log(``);
  console.log(`NEXT STEPS:`);
  console.log(``);
  console.log(`  # Step A — Emit prompt files for the unhandled items`);
  console.log(`  pnpm tsx scripts/brownfield/emit-classification-prompts.ts --pass-id ${pass.id}`);
  console.log(``);
  console.log(`  # Step B — In a separate Claude Code session, classify the prompts`);
  console.log(`  #          (see logs/brownfield-prompts/${assessmentId}/README.md)`);
  console.log(``);
  console.log(`  # Step C — Apply the result files`);
  console.log(`  pnpm tsx scripts/brownfield/apply-classification-results.ts --pass-id ${pass.id}`);
  console.log(``);
  console.log(`  # Step D — Inspect verdicts`);
  console.log(`  open /admin/brownfield-assessments/${assessmentId}/verdicts`);
  console.log(``);

  return { passId: pass.id };
}

if (process.argv[1] && process.argv[1].endsWith("start-pass.ts")) {
  const args = process.argv.slice(2);
  const assessmentId = args[0];
  if (!assessmentId || assessmentId.startsWith("--")) {
    console.error("Usage: tsx scripts/brownfield/start-pass.ts <assessmentId> [--protocol-version v] [--protocol-name n] [--parent-pass-id id] [--actor name]");
    process.exit(1);
  }
  const opts: StartPassOptions = {};
  const pv = args.indexOf("--protocol-version");
  const pn = args.indexOf("--protocol-name");
  const pp = args.indexOf("--parent-pass-id");
  const ac = args.indexOf("--actor");
  const pvVal = pv >= 0 ? args[pv + 1] : undefined;
  const pnVal = pn >= 0 ? args[pn + 1] : undefined;
  const ppVal = pp >= 0 ? args[pp + 1] : undefined;
  const acVal = ac >= 0 ? args[ac + 1] : undefined;
  if (pvVal) opts.protocolVersion = pvVal;
  if (pnVal) opts.protocolName = pnVal;
  if (ppVal) opts.parentPassId = ppVal;
  if (acVal) opts.actor = acVal;
  startPass(assessmentId, opts)
    .then(() => prisma.$disconnect())
    .catch((err) => {
      console.error("[start-pass] Failed:", err);
      void prisma.$disconnect();
      process.exit(1);
    });
}
