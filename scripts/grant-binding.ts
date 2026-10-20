/**
 * `pnpm grants:binding` — how many access grants are bound to no interface (P0.1, A47).
 *
 *   pnpm grants:binding            count, by reason, and how many still authorise
 *                                  calls (live) and were used in the last 7 days
 *   pnpm grants:binding --apply    first re-run the P0.1 backfill: bind each unbound
 *                                  grant that now matches exactly one interface
 *                                  (idempotent; the migration's own statement)
 *   pnpm grants:binding --check    exit 1 while any LIVE unbound grant remains —
 *                                  the precondition for COREEDGE_GRANT_BINDING=strict
 *   --json                         machine-readable report
 *
 * Strict refuses every unbound grant at the broker. It is safe to switch on
 * once `live` is 0, or once every live one is known and its replacement has
 * been approved. The runbook is docs/runbooks/coreedge-grant-binding.md.
 *
 * Runs against DATABASE_URL. Reads every organization's grants; writes only
 * with --apply, and then only the binding columns of unbound grants.
 *
 * Exit codes: 0 done (and, with --check, nothing live is unbound); 1 --check
 * found live unbound grants; 2 the command is wrong.
 */
import { prisma } from "@/lib/db/prisma";
import { permitCrossTenantReads } from "@/lib/db/tenant-guard";
import { GRANT_BINDING_BACKFILL_SQL, grantBindingMode } from "@/lib/studio/grant-binding";

const USAGE = "usage: tsx scripts/grant-binding.ts [--apply] [--check] [--json]";
const RECENT_DAYS = 7;

interface Report {
  readonly mode: string;
  readonly bound: number;
  readonly unbound: { readonly total: number; readonly noMatch: number; readonly ambiguous: number; readonly unchecked: number };
  /** Unbound, settled as granting, not revoked, not expired: what strict would refuse. */
  readonly live: number;
  /** Live and used in the last RECENT_DAYS days: traffic strict would refuse now. */
  readonly usedRecently: number;
  readonly boundByApply: number | null;
}

async function main(argv: readonly string[]): Promise<number> {
  const flags = new Set(argv);
  for (const f of flags) {
    if (f !== "--apply" && f !== "--check" && f !== "--json") {
      console.error(USAGE);
      return 2;
    }
  }
  permitCrossTenantReads("grants:binding operator command");

  let boundByApply: number | null = null;
  if (flags.has("--apply")) {
    const before = await prisma.apiAccessGrant.count({ where: { interfaceId: null } });
    await prisma.$executeRawUnsafe(GRANT_BINDING_BACKFILL_SQL);
    const after = await prisma.apiAccessGrant.count({ where: { interfaceId: null } });
    boundByApply = before - after;
  }

  const now = new Date();
  const recent = new Date(now.getTime() - RECENT_DAYS * 86_400_000);
  const liveWhere = {
    interfaceId: null,
    revokedAt: null,
    decision: { notIn: ["REQUESTED" as const, "REJECTED" as const] },
    OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
  };
  const [bound, total, noMatch, ambiguous, live, usedRecently] = await Promise.all([
    prisma.apiAccessGrant.count({ where: { interfaceId: { not: null } } }),
    prisma.apiAccessGrant.count({ where: { interfaceId: null } }),
    prisma.apiAccessGrant.count({ where: { interfaceId: null, unboundReason: "NO_MATCH" } }),
    prisma.apiAccessGrant.count({ where: { interfaceId: null, unboundReason: "AMBIGUOUS" } }),
    prisma.apiAccessGrant.count({ where: liveWhere }),
    prisma.apiAccessGrant.count({ where: { ...liveWhere, unboundLastUsedAt: { gte: recent } } }),
  ]);

  const report: Report = {
    mode: grantBindingMode(),
    bound,
    unbound: { total, noMatch, ambiguous, unchecked: total - noMatch - ambiguous },
    live,
    usedRecently,
    boundByApply,
  };

  if (flags.has("--json")) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`COREEDGE_GRANT_BINDING here: ${report.mode}`);
    if (boundByApply !== null) console.log(`Bound by this run:            ${boundByApply}`);
    console.log(`Bound grants:                 ${bound}`);
    console.log(
      `Unbound grants:               ${total} (matches no interface ${noMatch}, several ${ambiguous}, not yet checked ${report.unbound.unchecked})`,
    );
    console.log(`  still authorising (live):   ${live}`);
    console.log(`  used in the last ${RECENT_DAYS} days:    ${usedRecently}`);
    console.log(
      live === 0
        ? "Strict binding would refuse nothing that is live today."
        : "Strict binding would refuse these live grants. Re-approve each from its interface (the CoreEdge requests board lists them), then revoke the old one.",
    );
  }

  return flags.has("--check") && live > 0 ? 1 : 0;
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
