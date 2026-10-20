/**
 * `ce keys` — rotate, reseal, verify and retire the keys that seal SAP secrets (P0.10).
 *
 *   pnpm keys:verify [--expect-format=legacy|ce2] [--expect-active-master]
 *                                          open every data key and sealed secret; exit 1 on any failure
 *                                          (or on any blob not in the expected format, or any data
 *                                          key not wrapped by the active master key)
 *   pnpm keys:rotate [--apply] [--rekey [--rekey-before=<ISO time>]]
 *                                          re-wrap every org data key under the ACTIVE master key
 *   pnpm keys:reseal [--apply] [--to ce2|legacy]
 *                                          re-encrypt every sealed secret into the target format/key
 *   pnpm keys:retire [--apply]             withdraw data-key versions older than each org's newest
 *
 * DRY RUN BY DEFAULT. rotate, reseal and retire read everything — so the
 * report says exactly what would fail — and write nothing without --apply.
 * They are idempotent and resumable: a re-run finds only what is left. The
 * exception is rotate --rekey, which mints a new version on every run: to
 * resume one, pass the --rekey-before value its report printed.
 *
 * Options: --batch-size=<n> (default 200), --json (machine-readable report),
 * --org=<id>[,<id>…] (repeatable: only these organisations' rows and data
 * keys; default every organisation).
 *
 * Runs against DATABASE_URL with the key settings of the environment it is run
 * in, which must be the deployment's: SAP_CONNECTION_ENCRYPTION_KEY,
 * SAP_CONNECTION_ENCRYPTION_KEYS, SAP_CONNECTION_ENCRYPTION_ACTIVE_KEY,
 * SAP_CONNECTION_KEY_PROVIDER and SAP_CONNECTION_ACCEPT_LEGACY_FORMAT. The runbook is
 * docs/coreedge/SAP-CONNECTION-KEYSTONE-RUNBOOK.md ("Keys: rotate, reseal,
 * verify, restore").
 *
 * Exit codes: 0 clean; 1 a row failed (or verify found one that will not open);
 * 2 the command or configuration is wrong.
 */
import { prisma } from "@/lib/db/prisma";
import {
  resealAll,
  retireDataKeys,
  rotateMasterKey,
  verifyAll,
  type RowFailure,
} from "@/lib/sap-public/keys/maintenance";

const USAGE =
  "usage: tsx scripts/ce-keys.ts <verify|rotate|reseal|retire> [--apply] [--rekey] [--rekey-before=<ISO time>] [--to=ce2|legacy] [--expect-format=ce2|legacy] [--expect-active-master] [--org=<id>[,<id>…]] [--batch-size=<n>] [--json]";

interface Args {
  readonly command: string;
  readonly apply: boolean;
  readonly rekey: boolean;
  readonly rekeyBefore: Date | undefined;
  readonly to: "ce2" | "legacy" | undefined;
  readonly expectFormat: "ce2" | "legacy" | undefined;
  readonly expectActiveMaster: boolean;
  readonly organizationIds: readonly string[] | undefined;
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
  let expectActiveMaster = false;
  let organizationIds: string[] | undefined;
  let to: Args["to"];
  let expectFormat: Args["expectFormat"];
  let rekeyBefore: Date | undefined;
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
    else if (flag === "--expect-active-master") expectActiveMaster = true;
    else if (flag === "--org") {
      const ids = value()
        .split(",")
        .map((id) => id.trim());
      if (ids.some((id) => id.length === 0)) throw new UsageError(`--org needs organisation ids.\n${USAGE}`);
      organizationIds = [...(organizationIds ?? []), ...ids];
    } else if (flag === "--to") {
      const v = value();
      if (v !== "ce2" && v !== "legacy") throw new UsageError(`--to must be ce2 or legacy.\n${USAGE}`);
      to = v;
    } else if (flag === "--expect-format") {
      const v = value();
      if (v !== "ce2" && v !== "legacy") throw new UsageError(`--expect-format must be ce2 or legacy.\n${USAGE}`);
      expectFormat = v;
    } else if (flag === "--rekey-before") {
      const v = value();
      const at = new Date(v);
      if (!/^\d{4}-\d{2}-\d{2}T/.test(v) || Number.isNaN(at.getTime())) {
        throw new UsageError("--rekey-before must be an ISO time, as a previous rotate --rekey report printed it.");
      }
      rekeyBefore = at;
    } else if (flag === "--batch-size") {
      const n = Number(value());
      if (!Number.isInteger(n) || n < 1 || n > 5000) throw new UsageError("--batch-size must be 1-5000.");
      batchSize = n;
    } else throw new UsageError(`Unknown option ${arg}.\n${USAGE}`);
  }
  if (rekey && command !== "rotate") throw new UsageError("--rekey applies to rotate only.");
  if (rekeyBefore && !rekey) throw new UsageError("--rekey-before applies to rotate --rekey only.");
  if (to && command !== "reseal") throw new UsageError("--to applies to reseal only.");
  if (expectFormat && command !== "verify") throw new UsageError("--expect-format applies to verify only.");
  if (expectActiveMaster && command !== "verify") throw new UsageError("--expect-active-master applies to verify only.");
  if (apply && command === "verify") throw new UsageError("verify never writes; drop --apply.");
  return { command, apply, rekey, rekeyBefore, to, expectFormat, expectActiveMaster, organizationIds, batchSize, json };
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
  const batch = {
    ...(args.batchSize === undefined ? {} : { batchSize: args.batchSize }),
    ...(args.organizationIds ? { organizationIds: args.organizationIds } : {}),
  };
  if (args.organizationIds && !args.json) console.log(`Scope: organisations ${args.organizationIds.join(", ")}`);

  if (args.command === "verify") {
    const report = await verifyAll({
      ...batch,
      ...(args.expectFormat ? { expectFormat: args.expectFormat } : {}),
      expectActiveMaster: args.expectActiveMaster,
    });
    if (args.json) console.log(JSON.stringify(report, null, 2));
    else {
      const dk = report.dataKeys;
      console.log(
        `Org data keys: ${dk.total} (unwrapped ${dk.unwrapped}, failed ${dk.failed}, not on the active master key ${dk.notOnActiveMaster}, retired ${dk.retired})`,
      );
      for (const [label, n] of Object.entries(dk.byMasterKey)) console.log(`  wrapped by ${label}: ${n}`);
      for (const [table, c] of Object.entries(report.tables)) {
        const ce2 = Object.entries(c.ce2ByVersion)
          .map(([v, n]) => `v${v}=${n}`)
          .join(" ");
        console.log(
          `${table}: ${c.total} sealed, ${c.opened} opened, ${c.failed} failed — legacy bound ${c.legacyBound}, legacy unbound ${c.legacyUnbound}, ce2 ${ce2 || "0"}`,
        );
        if (c.onOlderDataKey > 0) {
          console.log(
            `  WARN ${c.onOlderDataKey} ce2 blob(s) on a data key older than their organisation's newest — run keys:reseal --apply, then keys:retire --apply.`,
          );
        }
      }
      printFailures(report.failures);
      console.log(report.ok ? "VERIFY OK: every sealed secret opens." : "VERIFY FAILED: see the rows above.");
    }
    return report.ok ? 0 : 1;
  }

  if (args.command === "rotate") {
    const report = await rotateMasterKey({
      apply: args.apply,
      rekey: args.rekey,
      ...(args.rekeyBefore ? { rekeyBefore: args.rekeyBefore } : {}),
      ...batch,
    });
    if (args.json) console.log(JSON.stringify(report, null, 2));
    else {
      console.log(`Rotate to ${report.provider}:${report.keyVersion} — ${mode(report.apply)}`);
      console.log(
        `  scanned ${report.scanned}, already current ${report.current}, re-wrapped ${report.rewrapped}, changed underneath ${report.changedUnderneath}, failed ${report.failed}`,
      );
      if (args.rekey) {
        console.log(
          `  new data keys ${report.rekeyed}, already rekeyed ${report.alreadyRekeyed} — run keys:reseal --apply next`,
        );
        console.log(`  to resume this rekey, re-run with --rekey-before=${report.rekeyBefore}`);
      }
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

  if (args.command === "retire") {
    const report = await retireDataKeys({ apply: args.apply, ...batch });
    if (args.json) console.log(JSON.stringify(report, null, 2));
    else {
      console.log(`Retire older data keys — ${mode(report.apply)}`);
      console.log(
        `  scanned ${report.scanned}, newest kept ${report.newest}, ${report.apply ? "retired" : "would retire"} ${report.retired}, already retired ${report.alreadyRetired}, still in use ${report.stillInUse}, changed underneath ${report.changedUnderneath}`,
      );
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
