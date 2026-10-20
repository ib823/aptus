/**
 * Backout SQL for the CoreEdge release protocol (P0.17,
 * docs/runbooks/coreedge-release.md, step 6).
 *
 *   pnpm migrations:backout-sql <migration_name>
 *       Print the script that backs one migration out: its backout SQL and the
 *       removal of its _prisma_migrations row, in one transaction. Reads
 *       nothing but the repository and connects to nothing: read it, then
 *       apply it with migrations:backout-apply.
 *
 *   pnpm migrations:backout-apply <migration_name> [--confirm <database>]
 *       Run that script on BACKOUT_DATABASE_URL's database, and only there.
 *       Prints the host and database it is about to change (never the user
 *       or password) and asks for the database name to be typed back, or
 *       takes it as --confirm. It sets DATABASE_URL and DIRECT_DATABASE_URL
 *       both to that one URL for the prisma CLI: schema.prisma has a
 *       directUrl, which the CLI connects to instead of DATABASE_URL, so a
 *       bare `DATABASE_URL=... prisma db execute --schema prisma/schema.prisma`
 *       runs on whatever DIRECT_DATABASE_URL holds (the shell, or .env).
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

import { createInterface } from "node:readline";

import {
  BACKOUT_FILE,
  backoutScript,
  cutoffMigrations,
  MIGRATION_NAME_RE,
  MIGRATIONS_DIR,
  parseBackout,
  readLocalMigrations,
} from "./lib/migration-protocol";
import { applyBackout, rehearseBackouts } from "./lib/migration-rehearsal";
import { redactSecrets } from "./lib/redact";

const USAGE = [
  "usage: tsx scripts/migration-backout.ts sql <migration_name>",
  "       tsx scripts/migration-backout.ts apply <migration_name> [--confirm <database>]",
  "       tsx scripts/migration-backout.ts rehearse [--since <migration_name>] [--allow-remote]",
].join("\n");

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]", "postgres"]);

/** host/database of a Postgres URL, for messages: never the user or password. */
function describeUrl(raw: string): { host: string; database: string; label: string } | null {
  try {
    const u = new URL(raw);
    return {
      host: u.hostname,
      database: decodeURIComponent(u.pathname.replace(/^\//, "")),
      label: `${u.hostname}${u.port ? `:${u.port}` : ""}${u.pathname}`,
    };
  } catch {
    return null;
  }
}

async function ask(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  return new Promise((resolve) => {
    rl.question(question, (a) => {
      rl.close();
      resolve(a.trim());
    });
  });
}

async function apply(argv: readonly string[]): Promise<number> {
  const [name, ...rest] = argv;
  let confirm: string | null = null;
  for (let i = 0; i < rest.length; i++) {
    const v = rest[i + 1];
    if (rest[i] === "--confirm" && v) {
      confirm = v;
      i++;
    } else {
      console.error(USAGE);
      return 2;
    }
  }
  if (!name || !MIGRATION_NAME_RE.test(name)) {
    console.error(USAGE);
    return 2;
  }
  const url = process.env.BACKOUT_DATABASE_URL;
  const target = url ? describeUrl(url) : null;
  if (!url || !target || !target.database) {
    console.error("error: set BACKOUT_DATABASE_URL to the direct (unpooled) postgresql:// URL of the one database to change.");
    return 2;
  }

  console.error(`Backing out ${name} from ${target.label}`);
  if (confirm === null) {
    if (!process.stdin.isTTY) {
      console.error(`error: not a terminal; pass --confirm ${target.database} to confirm the database.`);
      return 2;
    }
    confirm = await ask(`Type the database name (${target.database}) to go on: `);
  }
  if (confirm !== target.database) {
    console.error(`error: "${confirm}" is not ${target.database}; nothing was changed.`);
    return 2;
  }

  const result = applyBackout({
    schemaPath: "prisma/schema.prisma",
    databaseUrl: url,
    name,
    log: (line) => console.error(line),
  });
  if (!result.ok) {
    console.error(`FAIL: ${result.failure}`);
    return 1;
  }
  console.log(`OK: ${name} backed out of ${target.label}, and its _prisma_migrations row removed.`);
  return 0;
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

async function main(argv: readonly string[]): Promise<number> {
  const [command, ...rest] = argv;
  if (command === "sql") return rest.length === 1 ? printSql(rest[0]) : (console.error(USAGE), 2);
  if (command === "apply") return apply(rest);
  if (command === "rehearse") return rehearse(rest);
  console.error(USAGE);
  return 2;
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (err: unknown) => {
    const urls = [process.env.BACKOUT_DATABASE_URL, process.env.REHEARSAL_DATABASE_URL, process.env.SHADOW_DATABASE_URL];
    console.error(redactSecrets(err instanceof Error ? (err.stack ?? err.message) : String(err), urls));
    process.exit(2);
  },
);
