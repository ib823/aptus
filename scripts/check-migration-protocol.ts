/**
 * `pnpm migrations:check` — the migration rules of the CoreEdge release
 * protocol (P0.17, docs/runbooks/coreedge-release.md). A CI gate in
 * migration-integrity.yml, and the check to run before promoting.
 *
 *   pnpm migrations:check                  the working tree against the protocol
 *                                          cutoff (520ee318) and origin/main
 *   pnpm migrations:check --base <ref>     also hold the migrations at <ref>
 *                                          unchanged (repeatable; an all-zero
 *                                          SHA, a push's "no parent", is skipped)
 *   pnpm migrations:check --database       also compare with what DATABASE_URL's
 *                                          database has applied (read-only): run
 *                                          it with the PREVIEW database's URL
 *                                          before promoting
 *   --json                                 machine-readable report
 *
 * What fails (scripts/lib/migration-protocol.ts):
 *   - a migration on main, or at the cutoff, modified, renamed or removed;
 *   - a migration added after the cutoff with no backout SQL;
 *   - a migration added after the cutoff that is not additive, unless it
 *     carries a "-- Contract: <why>" line;
 *   - with --database: a migration that database applied whose file has
 *     changed since (Prisma would never re-run it, silently).
 *
 * Exit codes: 0 all rules hold; 1 a rule is broken; 2 the command is wrong or
 * git or the database could not be read.
 */

import { PrismaClient } from "@prisma/client";

import {
  type AppliedComparison,
  type AppliedMigration,
  checkProtocol,
  compareAppliedChecksums,
  backedOutMigrations,
  cutoffMigrations,
  gitHasCommit,
  gitMigrationsAt,
  MIGRATIONS_DIR,
  PROTOCOL_CUTOFF_COMMIT,
  type ProtocolBase,
  readLocalMigrations,
} from "./lib/migration-protocol";
import { redactSecrets } from "./lib/redact";

const USAGE = "usage: tsx scripts/check-migration-protocol.ts [--base <ref>]... [--database] [--json]";

interface Args {
  readonly bases: readonly string[];
  readonly database: boolean;
  readonly json: boolean;
}

function parseArgs(argv: readonly string[]): Args | null {
  const bases: string[] = [];
  let database = false;
  let json = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--base") {
      const ref = argv[++i];
      if (!ref || ref.startsWith("--")) return null;
      bases.push(ref);
    } else if (a === "--database") database = true;
    else if (a === "--json") json = true;
    else return null;
  }
  return { bases, database, json };
}

async function appliedMigrations(url: string): Promise<AppliedMigration[]> {
  const prisma = new PrismaClient({ datasourceUrl: url });
  try {
    const rows = await prisma.$queryRaw<
      { migration_name: string; checksum: string; finished_at: Date | null; rolled_back_at: Date | null }[]
    >`SELECT "migration_name", "checksum", "finished_at", "rolled_back_at" FROM "_prisma_migrations"`;
    return rows.map((r) => ({
      migrationName: r.migration_name,
      checksum: r.checksum,
      finishedAt: r.finished_at,
      rolledBackAt: r.rolled_back_at,
    }));
  } finally {
    await prisma.$disconnect();
  }
}

async function main(argv: readonly string[]): Promise<number> {
  const args = parseArgs(argv);
  if (!args) {
    console.error(USAGE);
    return 2;
  }
  const cwd = process.cwd();

  // The cutoff comes from the committed manifest, so it holds in a shallow clone.
  const cutoff = cutoffMigrations();
  const bases: ProtocolBase[] = [];
  const skipped: string[] = [];
  try {
    const refs = args.bases.length > 0 ? args.bases : ["origin/main"];
    for (const ref of refs) {
      if (/^0+$/.test(ref)) {
        skipped.push(`${ref} (no parent commit)`);
        continue;
      }
      if (args.bases.length === 0 && !gitHasCommit(cwd, ref)) {
        // The default is best-effort locally; CI names its base explicitly.
        skipped.push(`${ref} (not in this clone)`);
        continue;
      }
      bases.push({ label: ref, migrations: gitMigrationsAt(cwd, ref) });
    }
  } catch (err) {
    console.error(`error: ${err instanceof Error ? err.message : String(err)}`);
    return 2;
  }

  const local = readLocalMigrations(MIGRATIONS_DIR);
  const report = checkProtocol({ local, cutoff, bases, backedOut: backedOutMigrations() });

  let applied: AppliedComparison | null = null;
  if (args.database) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      console.error("error: --database needs DATABASE_URL (the preview database's direct URL).");
      return 2;
    }
    try {
      applied = compareAppliedChecksums(await appliedMigrations(url), local);
    } catch (err) {
      console.error(`error: could not read _prisma_migrations: ${redactSecrets(err instanceof Error ? err.message : String(err), [url])}`);
      return 2;
    }
  }

  const errors = [
    ...report.errors,
    ...(applied?.modified ?? []).map(
      (name) =>
        `${name}: this database applied a different migration.sql than the one here (checksum differs). Prisma will never re-run it, so this database and a fresh one now disagree. Restore the file as applied and put the change in a new migration; then rebuild this database from history.`,
    ),
  ];
  const notes = [
    ...report.notes,
    ...(applied?.unknown ?? []).map(
      (name) => `${name}: applied on this database but not in this checkout (another branch's preview, or removed); Prisma ignores it on deploy`,
    ),
  ];

  if (args.json) {
    console.log(JSON.stringify({ ok: errors.length === 0, cutoff: PROTOCOL_CUTOFF_COMMIT, bases: bases.map((b) => b.label), skipped, governed: report.governed, errors, notes, pending: applied?.pending ?? null }, null, 2));
    return errors.length === 0 ? 0 : 1;
  }

  console.log(`Migration protocol (docs/runbooks/coreedge-release.md), ${local.length} migrations`);
  console.log(`  unchanged against: the protocol cutoff ${PROTOCOL_CUTOFF_COMMIT.slice(0, 8)}${bases.map((b) => `, ${b.label}`).join("")}`);
  for (const s of skipped) console.log(`  skipped base: ${s}`);
  console.log(`  under the protocol (backout SQL, additive): ${report.governed.length}`);
  if (applied) console.log(`  this database: ${applied.pending.length} pending (${applied.pending.join(", ") || "none"})`);
  for (const n of notes) console.log(`note: ${n}`);
  for (const e of errors) console.error(`::error::${e}`);
  if (errors.length > 0) {
    console.error(`FAIL: ${errors.length} rule${errors.length === 1 ? "" : "s"} broken.`);
    return 1;
  }
  console.log("OK: no applied migration changed; every new migration is additive and carries backout SQL.");
  return 0;
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (err: unknown) => {
    console.error(redactSecrets(err instanceof Error ? (err.stack ?? err.message) : String(err), [process.env.DATABASE_URL]));
    process.exit(2);
  },
);
