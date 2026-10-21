/**
 * `pnpm contracts:stamp` — captures that carry no contract stamp (P0.4, A38).
 *
 *   pnpm contracts:stamp           count the response schemas and mock fixtures
 *                                  with no contract stamp, which readers withhold
 *                                  as "unverified"
 *   pnpm contracts:stamp --apply   first re-run the backfill of the migration
 *                                  20261023010000_contract_stamps, in one
 *                                  transaction: stamp each unstamped capture the
 *                                  audit trail can place (current or stale), and
 *                                  leave the rest unstamped
 *   --json                         machine-readable report
 *
 * WHEN TO RUN --apply. The migration runs the backfill once. Captures the
 * pre-P0.4 code writes after that carry no stamp: those made while the build
 * that follows the migration is still running, and any made while a rollback
 * has the old build serving. Run it once the P0.4 build is promoted, and again
 * after rolling forward from a rollback. The runbook is
 * docs/runbooks/coreedge-contract-hygiene.md.
 *
 * Idempotent: every statement touches only rows still unstamped, so a capture
 * already stamped — by the new routes or an earlier run — is never changed.
 * Runs against DATABASE_URL, across every organization; writes only with
 * --apply, and then only the stamp of unstamped captures.
 *
 * Exit codes: 0 done; 2 the command is wrong or the database refused.
 */
import { prisma } from "@/lib/db/prisma";
import {
  type ContractStampResult,
  runContractStampBackfill,
  UNSTAMPED_CAPTURES_SQL,
} from "@/lib/studio/contract-stamp-backfill";

const USAGE = "usage: tsx scripts/contract-stamp.ts [--apply] [--json]";

interface Report {
  readonly stampedByApply: ContractStampResult | null;
  /** Still unstamped after this run: withheld as unverified until re-captured. */
  readonly unstamped: { readonly schemas: number; readonly fixtures: number };
}

async function unstamped(): Promise<Report["unstamped"]> {
  const [row] = await prisma.$queryRawUnsafe<{ schemas: number; fixtures: number }[]>(UNSTAMPED_CAPTURES_SQL);
  return { schemas: row?.schemas ?? 0, fixtures: row?.fixtures ?? 0 };
}

async function main(argv: readonly string[]): Promise<number> {
  const flags = new Set(argv);
  for (const f of flags) {
    if (f !== "--apply" && f !== "--json") {
      console.error(USAGE);
      return 2;
    }
  }

  const stampedByApply = flags.has("--apply") ? await runContractStampBackfill(prisma) : null;
  const report: Report = { stampedByApply, unstamped: await unstamped() };

  if (flags.has("--json")) {
    console.log(JSON.stringify(report, null, 2));
    return 0;
  }
  if (stampedByApply) {
    console.log(
      `Stamped by this run: schemas ${stampedByApply.currentSchemas} current, ${stampedByApply.staleSchemas} stale; ` +
        `fixtures ${stampedByApply.currentFixtures} current, ${stampedByApply.staleFixtures} stale`,
    );
  }
  console.log(
    `Unstamped (withheld as unverified): ${report.unstamped.schemas} schemas, ${report.unstamped.fixtures} fixtures`,
  );
  if (!stampedByApply && report.unstamped.schemas + report.unstamped.fixtures > 0) {
    console.log(
      "Run with --apply to stamp the ones the audit trail can place. The rest need a fresh capture from the Test Console.",
    );
  }
  return 0;
}

main(process.argv.slice(2))
  .then(async (code) => {
    await prisma.$disconnect();
    process.exit(code);
  })
  .catch(async (err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    await prisma.$disconnect();
    process.exit(2);
  });
