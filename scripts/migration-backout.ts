/**
 * Backout SQL for the CoreEdge release protocol (P0.17,
 * docs/runbooks/coreedge-release.md, step 6).
 *
 *   pnpm migrations:backout-sql <migration_name>
 *       Print the script that backs one migration out: its backout SQL and the
 *       removal of its _prisma_migrations row, in one transaction. Reads
 *       nothing but the repository and connects to nothing. Pipe it into
 *       `pnpm exec prisma db execute --schema prisma/schema.prisma --stdin`
 *       with DATABASE_URL set to the database to change.
 *
 *   pnpm migrations:rehearse-backout [--since <migration_name>] [--allow-remote]
 *       Run every backout under the protocol (or those from --since on) on
 *       REHEARSAL_DATABASE_URL, newest first; prove the result matches the
 *       migrations kept (zero drift, using SHADOW_DATABASE_URL); re-apply them
 *       with migrate deploy and prove the result matches schema.prisma. CI runs
 *       it on the history-built database in migration-integrity.yml.
 *
 *       DESTRUCTIVE to REHEARSAL_DATABASE_URL's database: what the migrations
 *       created is dropped, data included, and recreated empty. A host other
 *       than localhost, 127.0.0.1, ::1 or "postgres" (the CI service) is
 *       refused unless --allow-remote is given, which is for the preview
 *       database only. Never production.
 *
 * Exit codes: 0 done; 1 a backout is missing, failed or left drift; 2 the
 * command is wrong.
 */

import {
  BACKOUT_FILE,
  backoutScript,
  cutoffMigrations,
  MIGRATION_NAME_RE,
  MIGRATIONS_DIR,
  parseBackout,
  readLocalMigrations,
} from "./lib/migration-protocol";
import { rehearseBackouts } from "./lib/migration-rehearsal";

const USAGE = [
  "usage: tsx scripts/migration-backout.ts sql <migration_name>",
  "       tsx scripts/migration-backout.ts rehearse [--since <migration_name>] [--allow-remote]",
].join("\n");

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]", "postgres"]);

/** host/database of a Postgres URL, for messages: never the user or password. */
function describeUrl(raw: string): { host: string; label: string } | null {
  try {
    const u = new URL(raw);
    return { host: u.hostname, label: `${u.hostname}${u.port ? `:${u.port}` : ""}${u.pathname}` };
  } catch {
    return null;
  }
}

function printSql(name: string | undefined): number {
  if (!name || !MIGRATION_NAME_RE.test(name)) {
    console.error(USAGE);
    return 2;
  }
  const m = readLocalMigrations(MIGRATIONS_DIR).find((x) => x.name === name);
  if (!m) {
    console.error(`error: no migration ${name} in ${MIGRATIONS_DIR}`);
    return 2;
  }
  const parsed = parseBackout(m);
  if (!parsed.ok) {
    console.error(`error: ${name}: ${parsed.problem}`);
    console.error(`Write it first: a ${BACKOUT_FILE} beside the migration (never an edit to migration.sql).`);
    return 1;
  }
  process.stdout.write(backoutScript(name, parsed.backout));
  return 0;
}

function rehearse(argv: readonly string[]): number {
  let since: string | null = null;
  let allowRemote = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--since") {
      const v = argv[++i];
      if (!v || !MIGRATION_NAME_RE.test(v)) {
        console.error(USAGE);
        return 2;
      }
      since = v;
    } else if (a === "--allow-remote") allowRemote = true;
    else {
      console.error(USAGE);
      return 2;
    }
  }

  const url = process.env.REHEARSAL_DATABASE_URL;
  const shadow = process.env.SHADOW_DATABASE_URL;
  if (!url || !shadow) {
    console.error("error: set REHEARSAL_DATABASE_URL (the database to rehearse on; it is changed) and SHADOW_DATABASE_URL (an empty scratch database).");
    return 2;
  }
  const target = describeUrl(url);
  const shadowTarget = describeUrl(shadow);
  if (!target || !shadowTarget) {
    console.error("error: REHEARSAL_DATABASE_URL and SHADOW_DATABASE_URL must be postgresql:// URLs.");
    return 2;
  }
  if (target.label === shadowTarget.label) {
    console.error("error: the shadow database must not be the rehearsal database.");
    return 2;
  }
  if (!LOCAL_HOSTS.has(target.host) && !allowRemote) {
    console.error(`error: ${target.host} is not a local database. The rehearsal drops what the migrations created; pass --allow-remote only for the preview database, never production.`);
    return 2;
  }

  // Migrations at the protocol cutoff are never backed out: they have no
  // backout SQL to run, and production has held them since before P0.17.
  const keep = new Set(cutoffMigrations().keys());

  console.log(`Backout rehearsal on ${target.label} (shadow ${shadowTarget.label})${since ? `, from ${since}` : ""}`);
  const result = rehearseBackouts({
    schemaPath: "prisma/schema.prisma",
    databaseUrl: url,
    shadowDatabaseUrl: shadow,
    keep,
    since,
    log: (line) => console.log(line),
  });
  return result.ok ? 0 : 1;
}

function main(argv: readonly string[]): number {
  const [command, ...rest] = argv;
  if (command === "sql") return rest.length === 1 ? printSql(rest[0]) : (console.error(USAGE), 2);
  if (command === "rehearse") return rehearse(rest);
  console.error(USAGE);
  return 2;
}

process.exit(main(process.argv.slice(2)));
