/**
 * `ce keys` — rotate, reseal and verify the keys that seal SAP secrets (P0.10).
 *
 *   pnpm keys:verify                       open every data key and sealed secret; exit 1 on any failure
 *   pnpm keys:rotate [--apply] [--rekey]   re-wrap every org data key under the ACTIVE master key
 *   pnpm keys:reseal [--apply] [--to ce2|legacy]
 *                                          re-encrypt every sealed secret into the target format/key
 *
 * DRY RUN BY DEFAULT. rotate and reseal read and decrypt everything — so the
 * report says exactly what would fail — and write nothing without --apply.
 * Both are idempotent and resumable: a re-run finds only what is left.
 *
 * Options: --batch-size=<n> (default 200), --json (machine-readable report).
 *
 * Runs against DATABASE_URL with the key settings of the environment it is run
 * in, which must be the deployment's: SAP_CONNECTION_ENCRYPTION_KEY,
 * SAP_CONNECTION_ENCRYPTION_KEYS, SAP_CONNECTION_ENCRYPTION_ACTIVE_KEY and
 * SAP_CONNECTION_KEY_PROVIDER. The runbook is
 * docs/coreedge/SAP-CONNECTION-KEYSTONE-RUNBOOK.md ("Keys: rotate, reseal,
 * verify, restore").
 *
 * Exit codes: 0 clean; 1 a row failed (or verify found one that will not open);
 * 2 the command or configuration is wrong.
 */
import { prisma } from "@/lib/db/prisma";
import {
  resealAll,
  rotateMasterKey,
  verifyAll,
  type RowFailure,
} from "@/lib/sap-public/keys/maintenance";

const USAGE =
  "usage: tsx scripts/ce-keys.ts <verify|rotate|reseal> [--apply] [--rekey] [--to=ce2|legacy] [--batch-size=<n>] [--json]";

interface Args {
  readonly command: string;
  readonly apply: boolean;
  readonly rekey: boolean;
  readonly to: "ce2" | "legacy" | undefined;
  readonly batchSize: number | undefined;
  readonly json: boolean;
}

class UsageError extends Error {}

function parseArgs(argv: readonly string[]): Args {
  const [command, ...rest] = argv;
  if (!command) throw new UsageError(USAGE);
  let apply = false;
  let rekey = false;
  let json = false;
  let to: Args["to"];
  let batchSize: number | undefined;
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i]!;
    const [flag, inline] = arg.split("=", 2) as [string, string | undefined];
    const value = (): string => {
      const v = inline ?? rest[++i];
      if (v === undefined) throw new UsageError(`${flag} needs a value.\n${USAGE}`);
      return v;
    };
    if (flag === "--apply") apply = true;
    else if (flag === "--rekey") rekey = true;
    else if (flag === "--json") json = true;
    else if (flag === "--to") {
      const v = value();
      if (v !== "ce2" && v !== "legacy") throw new UsageError(`--to must be ce2 or legacy.\n${USAGE}`);
      to = v;
    } else if (flag === "--batch-size") {
      const n = Number(value());
      if (!Number.isInteger(n) || n < 1 || n > 5000) throw new UsageError("--batch-size must be 1-5000.");
      batchSize = n;
    } else throw new UsageError(`Unknown option ${arg}.\n${USAGE}`);
  }
  if (rekey && command !== "rotate") throw new UsageError("--rekey applies to rotate only.");
  if (to && command !== "reseal") throw new UsageError("--to applies to reseal only.");
  if (apply && command === "verify") throw new UsageError("verify never writes; drop --apply.");
  return { command, apply, rekey, to, batchSize, json };
}

function printFailures(failures: readonly RowFailure[]): void {
  for (const f of failures) {
    console.log(`  FAILED ${f.table} ${f.id} (org ${f.organizationId}): ${f.reason}`);
  }
}

function mode(apply: boolean): string {
  return apply ? "APPLIED" : "DRY RUN — nothing written; re-run with --apply";
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  const batch = args.batchSize === undefined ? {} : { batchSize: args.batchSize };

  if (args.command === "verify") {
    const report = await verifyAll(batch);
    if (args.json) console.log(JSON.stringify(report, null, 2));
    else {
      const dk = report.dataKeys;
      console.log(
        `Org data keys: ${dk.total} (unwrapped ${dk.unwrapped}, failed ${dk.failed}, not on the active master key ${dk.notOnActiveMaster})`,
      );
      for (const [label, n] of Object.entries(dk.byMasterKey)) console.log(`  wrapped by ${label}: ${n}`);
      for (const [table, c] of Object.entries(report.tables)) {
        const ce2 = Object.entries(c.ce2ByVersion)
          .map(([v, n]) => `v${v}=${n}`)
          .join(" ");
        console.log(
          `${table}: ${c.total} sealed, ${c.opened} opened, ${c.failed} failed — legacy bound ${c.legacyBound}, legacy unbound ${c.legacyUnbound}, ce2 ${ce2 || "0"}`,
        );
      }
      printFailures(report.failures);
      console.log(report.ok ? "VERIFY OK: every sealed secret opens." : "VERIFY FAILED: see the rows above.");
    }
    return report.ok ? 0 : 1;
  }

  if (args.command === "rotate") {
    const report = await rotateMasterKey({ apply: args.apply, rekey: args.rekey, ...batch });
    if (args.json) console.log(JSON.stringify(report, null, 2));
    else {
      console.log(`Rotate to ${report.provider}:${report.keyVersion} — ${mode(report.apply)}`);
      console.log(
        `  scanned ${report.scanned}, already current ${report.current}, re-wrapped ${report.rewrapped}, changed underneath ${report.changedUnderneath}, failed ${report.failed}`,
      );
      if (args.rekey) console.log(`  new data keys ${report.rekeyed} — run keys:reseal --apply next`);
      printFailures(report.failures);
    }
    return report.failed === 0 ? 0 : 1;
  }

  if (args.command === "reseal") {
    const report = await resealAll({ apply: args.apply, ...(args.to ? { to: args.to } : {}), ...batch });
    if (args.json) console.log(JSON.stringify(report, null, 2));
    else {
      console.log(`Reseal to ${report.to} — ${mode(report.apply)}`);
      for (const [table, c] of Object.entries(report.tables)) {
        console.log(
          `  ${table}: scanned ${c.scanned}, already current ${c.current}, ${report.apply ? "resealed" : "would reseal"} ${c.resealed}, changed underneath ${c.changedUnderneath}, failed ${c.failed}`,
        );
      }
      printFailures(report.failures);
    }
    return report.failures.length === 0 ? 0 : 1;
  }

  throw new UsageError(`Unknown command "${args.command}".\n${USAGE}`);
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 2;
  })
  .finally(() => prisma.$disconnect());
