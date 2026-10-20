/**
 * Rehearse every backout (P0.17, docs/runbooks/coreedge-release.md step 6).
 *
 * Written backout SQL that has never run is a guess. This runs it, on a
 * database built from migration history, the way the runbook says an operator
 * would in an incident, and proves both directions:
 *
 *   1. `migrate deploy`: the database holds every migration.
 *   2. Newest first, each migration under the protocol (every one the cutoff
 *      lacks, or only those from `since` on) is backed out with exactly the
 *      script `pnpm migrations:backout-sql` prints: its backout SQL and the
 *      removal of its `_prisma_migrations` row, in one transaction.
 *   3. The database now matches the migrations that were kept, with zero
 *      drift (`migrate diff --exit-code` against a shadow database). A backout
 *      that forgets an index, a constraint or a column fails here.
 *   4. `migrate deploy` again: the roll-forward re-applies what was backed out.
 *   5. The database matches schema.prisma with zero drift.
 *
 * DESTRUCTIVE TO THE DATABASE IT IS GIVEN: step 2 drops what the migrations
 * created, data included, and step 4 recreates it empty. The CLI
 * (scripts/migration-backout.ts) refuses a non-local host without
 * --allow-remote. Never point it at production.
 */

import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { backoutScript, parseBackout, readLocalMigrations } from "./migration-protocol";
import { redactSecrets } from "./redact";

export interface RehearsalOptions {
  /** schema.prisma; its migrations are the `migrations` directory beside it. */
  readonly schemaPath: string;
  readonly databaseUrl: string;
  readonly shadowDatabaseUrl: string;
  /** Migrations never backed out: those at the protocol cutoff. */
  readonly keep: ReadonlySet<string>;
  /** Back out only migrations named `since` or later. */
  readonly since?: string | null;
  readonly log: (line: string) => void;
  /** The prisma CLI. Defaults to the repository's own. */
  readonly prismaBin?: string;
}

export interface RehearsalResult {
  readonly ok: boolean;
  readonly backedOut: readonly string[];
  /** The step that failed, in words, or null. */
  readonly failure: string | null;
}

interface PrismaRun {
  readonly status: number | null;
  readonly output: string;
}

/**
 * The environment for a prisma CLI command meant for `databaseUrl`, and only
 * that database.
 *
 * schema.prisma declares `directUrl = env("DIRECT_DATABASE_URL")`, and the
 * CLI (`db execute --schema`, `migrate deploy`, `migrate status`) connects to
 * the directUrl when there is one, not to DATABASE_URL. Setting DATABASE_URL
 * alone therefore runs the command on whatever DIRECT_DATABASE_URL holds: the
 * operator's shell from an earlier task, or the checkout's .env (which the
 * CLI loads, and which .env.example points at a local database). Both are set
 * here, explicitly, to the one URL; a variable already in the environment
 * wins over .env, so the file cannot redirect it either.
 */
export function prismaCliEnv(databaseUrl: string): NodeJS.ProcessEnv {
  return { ...process.env, DATABASE_URL: databaseUrl, DIRECT_DATABASE_URL: databaseUrl };
}

function prismaRunner(prismaBin: string | undefined, databaseUrl: string, secrets: readonly string[]) {
  const bin = prismaBin ?? join(process.cwd(), "node_modules", ".bin", "prisma");
  const env = prismaCliEnv(databaseUrl);
  return (args: readonly string[], input?: string): PrismaRun => {
    const r = spawnSync(bin, args, {
      env,
      encoding: "utf8",
      input,
      maxBuffer: 64 * 1024 * 1024,
    });
    return { status: r.status, output: redactSecrets(`${r.stdout ?? ""}${r.stderr ?? ""}${r.error ? String(r.error) : ""}`, secrets) };
  };
}

export interface ApplyBackoutOptions {
  /** schema.prisma; its migrations are the `migrations` directory beside it. */
  readonly schemaPath: string;
  /** The one database to change. */
  readonly databaseUrl: string;
  readonly name: string;
  readonly log: (line: string) => void;
  /** The prisma CLI. Defaults to the repository's own. */
  readonly prismaBin?: string;
}

/**
 * Back one migration out of one database (`pnpm migrations:backout-apply`,
 * docs/runbooks/coreedge-release.md step 6): exactly the script
 * `migrations:backout-sql` prints, run by `prisma db execute` with both
 * DATABASE_URL and DIRECT_DATABASE_URL set to `databaseUrl` (prismaCliEnv).
 * The script is one transaction, so a failure changes nothing.
 */
export function applyBackout(opts: ApplyBackoutOptions): { readonly ok: boolean; readonly failure: string | null } {
  const migrationsDir = join(dirname(opts.schemaPath), "migrations");
  const m = readLocalMigrations(migrationsDir).find((x) => x.name === opts.name);
  if (!m) return { ok: false, failure: `no migration ${opts.name} in ${migrationsDir}` };
  const parsed = parseBackout(m);
  if (!parsed.ok) return { ok: false, failure: `${opts.name}: ${parsed.problem}` };
  const prisma = prismaRunner(opts.prismaBin, opts.databaseUrl, [opts.databaseUrl]);
  const run = prisma(["db", "execute", "--schema", opts.schemaPath, "--stdin"], backoutScript(opts.name, parsed.backout));
  if (run.status !== 0) {
    opts.log(run.output.trim());
    return { ok: false, failure: `the backout of ${opts.name} failed to run; its transaction changed nothing` };
  }
  return { ok: true, failure: null };
}

export function rehearseBackouts(opts: RehearsalOptions): RehearsalResult {
  const migrationsDir = join(dirname(opts.schemaPath), "migrations");
  const prisma = prismaRunner(opts.prismaBin, opts.databaseUrl, [opts.databaseUrl, opts.shadowDatabaseUrl]);
  const fail = (backedOut: string[], step: string, run?: PrismaRun): RehearsalResult => {
    if (run) opts.log(run.output.trim());
    opts.log(`FAIL: ${step}`);
    return { ok: false, backedOut, failure: step };
  };

  const local = readLocalMigrations(migrationsDir);
  const targets = local
    .filter((m) => !opts.keep.has(m.name) && (!opts.since || m.name >= opts.since))
    .reverse();
  if (targets.length === 0) {
    opts.log("Nothing to rehearse: no migration is under the protocol.");
    return { ok: true, backedOut: [], failure: null };
  }

  // Every script first: a migration with no usable backout fails before the
  // database is touched.
  const scripts: { name: string; script: string }[] = [];
  for (const m of targets) {
    const parsed = parseBackout(m);
    if (!parsed.ok) return fail([], `${m.name}: ${parsed.problem}`);
    scripts.push({ name: m.name, script: backoutScript(m.name, parsed.backout) });
  }

  opts.log(`1. migrate deploy (${local.length} migrations)`);
  let run = prisma(["migrate", "deploy", "--schema", opts.schemaPath]);
  if (run.status !== 0) return fail([], "migrate deploy failed before the rehearsal", run);

  const backedOut: string[] = [];
  opts.log(`2. back out ${scripts.length}, newest first`);
  for (const { name, script } of scripts) {
    run = prisma(["db", "execute", "--schema", opts.schemaPath, "--stdin"], script);
    if (run.status !== 0) return fail(backedOut, `the backout of ${name} failed to run`, run);
    backedOut.push(name);
    opts.log(`   backed out ${name}`);
  }

  const kept = mkdtempSync(join(tmpdir(), "backout-rehearsal-"));
  try {
    const backedOutSet = new Set(backedOut);
    for (const m of local) {
      if (backedOutSet.has(m.name)) continue;
      mkdirSync(join(kept, m.name));
      copyFileSync(join(migrationsDir, m.name, "migration.sql"), join(kept, m.name, "migration.sql"));
    }
    const lock = join(migrationsDir, "migration_lock.toml");
    if (existsSync(lock)) copyFileSync(lock, join(kept, "migration_lock.toml"));

    opts.log(`3. the database matches the ${local.length - backedOut.length} migrations kept`);
    run = prisma([
      "migrate", "diff",
      "--from-schema-datasource", opts.schemaPath,
      "--to-migrations", kept,
      "--shadow-database-url", opts.shadowDatabaseUrl,
      "--exit-code",
    ]);
    if (run.status !== 0) {
      return fail(
        backedOut,
        run.status === 2
          ? "after the backouts the database does not match the migrations kept: a backout leaves something behind or removes too much (the diff above reads database -> kept migrations)"
          : "migrate diff failed",
        run,
      );
    }
  } finally {
    rmSync(kept, { recursive: true, force: true });
  }

  opts.log("4. migrate deploy again (the roll-forward)");
  run = prisma(["migrate", "deploy", "--schema", opts.schemaPath]);
  if (run.status !== 0) return fail(backedOut, "the roll-forward did not re-apply the backed-out migrations", run);

  opts.log("5. the database matches schema.prisma");
  run = prisma([
    "migrate", "diff",
    "--from-schema-datasource", opts.schemaPath,
    "--to-schema-datamodel", opts.schemaPath,
    "--exit-code",
  ]);
  if (run.status !== 0) return fail(backedOut, run.status === 2 ? "after the roll-forward the database drifts from schema.prisma" : "migrate diff failed", run);

  opts.log(`OK: ${backedOut.length} backouts ran, left exactly the kept schema, and the roll-forward restored schema.prisma.`);
  return { ok: true, backedOut, failure: null };
}
