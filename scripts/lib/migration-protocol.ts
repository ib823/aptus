/**
 * The migration half of the CoreEdge release protocol (P0.17,
 * docs/runbooks/coreedge-release.md).
 *
 * Four rules, each a function here so a test can hold it:
 *
 *   1. A migration already on `main` is never modified, renamed or removed
 *      (`checkProtocol`, against every base given and the protocol cutoff).
 *      `prisma migrate deploy` never re-runs a migration it has applied and
 *      does not even warn when the file has changed since (it compares
 *      nothing on deploy), so an edit reaches a fresh database and never
 *      production: the two silently disagree. The fix for a wrong migration is
 *      a new migration.
 *   2. Every migration added after the cutoff carries written backout SQL:
 *      a `-- Backout:` section in its header, or a `backout.sql` file beside
 *      it (`parseBackout`). The file wins when both exist, because a header in
 *      an applied migration can never be corrected (rule 1) and the file can.
 *      Prisma reads only `migration.sql` from a migration directory, so the
 *      file changes nothing that is applied.
 *   3. Every migration added after the cutoff is additive (expand), so the
 *      code still running during and after the deploy, and the code a Vercel
 *      rollback brings back, keep working (`destructiveStatements`). A
 *      contract migration that genuinely has to drop or rename something says
 *      why in a `-- Contract:` line, which turns the refusal into a note.
 *   4. A database that applied a migration holds the checksum of the file it
 *      applied (`_prisma_migrations.checksum`, SHA-256 of the file's bytes).
 *      `compareAppliedChecksums` names every applied migration whose file has
 *      changed since: the check to run against a preview database before
 *      promoting, because a preview applies a branch's migrations long before
 *      `main` has them.
 *
 * The backout SQL is not just prose: `rehearseBackouts` (in
 * migration-rehearsal.ts) runs every one on a database built from history,
 * proves the result matches the cutoff's schema, then re-applies the
 * migrations and proves it matches schema.prisma. CI runs it in
 * migration-integrity.yml.
 */

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import backedOutRegister from "../../prisma/backed-out-migrations.json";

import cutoffManifest from "./migration-cutoff.json";

/**
 * The commit after which every new migration must carry backout SQL: main at
 * the Phase 0a deploy (#308), the last production release before the
 * protocol existed. Migrations it already holds keep whatever they say.
 */
export const PROTOCOL_CUTOFF_COMMIT = "520ee318e12e36f6a240b887cb6caa22139a9197";

export const MIGRATIONS_DIR = "prisma/migrations";
export const BACKOUT_FILE = "backout.sql";

/** `prisma migrate dev` names: a 14-digit UTC timestamp, then snake_case. */
export const MIGRATION_NAME_RE = /^\d{14}_[a-z0-9_]+$/;

export interface LocalMigration {
  readonly name: string;
  /** migration.sql, exactly as on disk. */
  readonly sql: string;
  /** SHA-256 hex of migration.sql's bytes: what Prisma stores as `checksum`. */
  readonly checksum: string;
  /** backout.sql beside it, or null. */
  readonly backoutFile: string | null;
}

export function sha256Hex(bytes: Buffer | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * Every migration directory under `dir`, sorted the way Prisma applies them.
 * A directory with no migration.sql is returned with `sql: ""` so the check
 * can name it, rather than being skipped (Prisma would fail on it).
 */
export function readLocalMigrations(dir: string): LocalMigration[] {
  return readdirSync(dir)
    .filter((name) => statSync(join(dir, name)).isDirectory())
    .sort()
    .map((name) => {
      const sqlPath = join(dir, name, "migration.sql");
      const bytes = existsSync(sqlPath) ? readFileSync(sqlPath) : Buffer.alloc(0);
      const backoutPath = join(dir, name, BACKOUT_FILE);
      return {
        name,
        sql: bytes.toString("utf8"),
        checksum: sha256Hex(bytes),
        backoutFile: existsSync(backoutPath) ? readFileSync(backoutPath, "utf8") : null,
      };
    });
}

// ---------------------------------------------------------------------------
// SQL scanning
// ---------------------------------------------------------------------------

/**
 * The executable SQL only: comments removed and the contents of string
 * literals blanked, so prose in a comment ("we never DROP anything") or a
 * value ('DELETE FROM') is never read as a statement. Quoted identifiers and
 * dollar-quoted bodies are kept: they are code.
 */
export function executableSql(sql: string): string {
  let out = "";
  let i = 0;
  while (i < sql.length) {
    const c = sql[i]!;
    const next = sql[i + 1];
    if (c === "-" && next === "-") {
      const end = sql.indexOf("\n", i);
      i = end === -1 ? sql.length : end;
      continue;
    }
    if (c === "/" && next === "*") {
      const end = sql.indexOf("*/", i + 2);
      i = end === -1 ? sql.length : end + 2;
      out += " ";
      continue;
    }
    if (c === "'") {
      // '' inside a literal is an escaped quote.
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === "'" && sql[j + 1] === "'") j += 2;
        else if (sql[j] === "'") break;
        else j++;
      }
      out += "''";
      i = j + 1;
      continue;
    }
    if (c === '"') {
      const end = sql.indexOf('"', i + 1);
      const stop = end === -1 ? sql.length : end + 1;
      out += sql.slice(i, stop);
      i = stop;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

/** Top-level statements of executable SQL, trimmed, empties dropped. */
export function statements(executable: string): string[] {
  return executable
    .split(";")
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter((s) => s.length > 0);
}

export interface DestructiveFinding {
  readonly rule: string;
  /** The statement, collapsed to one line and cut to a readable length. */
  readonly statement: string;
}

/**
 * The ALTER TABLE in a statement, from where it starts to the statement's
 * end, or null. It is not always at the start: the repository's hand-written
 * migrations guard a change in a DO block (`DO $$ BEGIN ALTER TABLE ...;
 * EXCEPTION WHEN duplicate_column THEN NULL; END $$;`) or behind
 * `IF NOT EXISTS (...) THEN ALTER TABLE ...`, and `statements` splits only on
 * ";", so the words before it belong to the block. Cutting there also keeps a
 * DROP or DEFAULT in an IF's condition out of the rules.
 */
function alterTable(stmt: string): string | null {
  const m = /\bALTER\s+TABLE\b/i.exec(stmt);
  return m ? stmt.slice(m.index) : null;
}

/**
 * What the code running during a deploy, or brought back by a rollback,
 * cannot survive. Each rule is a reason in words, because the person reading
 * a red CI line needs the why, not the regex.
 */
const DESTRUCTIVE_RULES: readonly { readonly rule: string; readonly test: (stmt: string) => boolean }[] = [
  {
    rule: "drops an object the running code may still use",
    test: (s) =>
      /\bDROP\s+(TABLE|COLUMN|CONSTRAINT|INDEX|SCHEMA|TYPE|VIEW|MATERIALIZED\s+VIEW|SEQUENCE|DATABASE|FUNCTION|TRIGGER|EXTENSION)\b/i.test(s) ||
      // ALTER TABLE ... DROP "col" (COLUMN is optional) or DROP DEFAULT. Only
      // DROP NOT NULL relaxes a rule and is left alone.
      /\bDROP\b(?!\s+NOT\s+NULL\b)/i.test(alterTable(s) ?? ""),
  },
  { rule: "deletes rows", test: (s) => /\bTRUNCATE\b/i.test(s) || /\bDELETE\s+FROM\b/i.test(s) },
  { rule: "renames an object the running code refers to by name", test: (s) => /\bRENAME\b/i.test(s) },
  {
    rule: "changes a column's type under the running code",
    test: (s) => /\bALTER\s+COLUMN\s+("[^"]+"|\w+)\s+(SET\s+DATA\s+)?TYPE\b/i.test(s),
  },
  {
    rule: "makes an existing column NOT NULL, which the running code's writes may not satisfy",
    test: (s) => /\bSET\s+NOT\s+NULL\b/i.test(s),
  },
  {
    rule: "adds a NOT NULL column with no DEFAULT, which the running code's inserts omit",
    test: (s) => {
      const alter = alterTable(s);
      if (alter === null) return false;
      // One clause per ADD COLUMN; a type such as DECIMAL(10,2) keeps its comma.
      const clauses = alter.split(/,\s*(?=(?:ADD|DROP|ALTER|RENAME)\b)/i);
      return clauses.some(
        (c) =>
          /\bADD\s+(?!CONSTRAINT\b)(?:COLUMN\s+)?/i.test(c) && /\bNOT\s+NULL\b/i.test(c) && !/\bDEFAULT\b/i.test(c),
      );
    },
  },
  {
    // EXECUTE '...' or EXECUTE format(...) runs SQL held in a string, which
    // executableSql blanks and which is often assembled with || or format(),
    // so no rule above can read it. A trigger's EXECUTE FUNCTION/PROCEDURE is
    // not dynamic SQL.
    rule: "runs dynamic SQL (EXECUTE) this check cannot read: write the statement out, or say why it is safe in a Contract line",
    test: (s) => /\bEXECUTE\b(?!\s+(?:FUNCTION|PROCEDURE)\b)/i.test(s),
  },
];

export function destructiveStatements(sql: string): DestructiveFinding[] {
  const findings: DestructiveFinding[] = [];
  for (const stmt of statements(executableSql(sql))) {
    for (const { rule, test } of DESTRUCTIVE_RULES) {
      if (test(stmt)) findings.push({ rule, statement: stmt.length > 160 ? `${stmt.slice(0, 157)}...` : stmt });
    }
  }
  return findings;
}

/** The reason in a `-- Contract: <why>` header line, or null. */
export function contractReason(sql: string): string | null {
  const m = /^--\s*Contract:\s*(\S.*)$/m.exec(sql);
  return m ? m[1]!.trim() : null;
}

// ---------------------------------------------------------------------------
// Backout
// ---------------------------------------------------------------------------

export type Backout =
  | { readonly kind: "sql"; readonly sql: string; readonly source: "file" | "header" }
  | { readonly kind: "none"; readonly reason: string; readonly source: "file" | "header" };

export type BackoutResult = { readonly ok: true; readonly backout: Backout } | { readonly ok: false; readonly problem: string };

/**
 * The text of a `-- Backout:` header section, or null when there is none.
 *
 * The section is the `-- Backout:` line and every comment line after it that
 * is indented further than prose (two or more spaces after `--`), which is how
 * the existing migrations write a statement that runs on:
 *
 *   -- Backout: ALTER TABLE "A" DROP CONSTRAINT "A_b_fkey";
 *   --          DROP INDEX "A_b_idx";
 *
 * It ends at the first line that is not such a continuation.
 */
export function headerBackoutText(sql: string): string | null {
  const lines = sql.split(/\r?\n/);
  const start = lines.findIndex((l) => /^--\s*Backout:/.test(l));
  if (start === -1) return null;
  const parts = [lines[start]!.replace(/^--\s*Backout:\s*/, "")];
  for (let i = start + 1; i < lines.length; i++) {
    const m = /^--\s{2,}(\S.*)$/.exec(lines[i]!);
    if (!m) break;
    parts.push(m[1]!);
  }
  return parts.join("\n").trim();
}

/** "none", then the reason: `none — the backfill only fills columns it added`. */
const NONE_RE = /^none\b[\s:.,;(—–-]*([\s\S]*)$/i;

function fromText(text: string, source: "file" | "header"): BackoutResult {
  const where = source === "file" ? BACKOUT_FILE : "the -- Backout: section";
  const body = text.trim();
  // "none" needs a reason, so "nothing to undo" is a decision someone wrote down.
  const none = NONE_RE.exec(body);
  if (none) {
    const reason = none[1]!.replace(/\)\s*$/, "").replace(/\s+/g, " ").trim();
    if (reason.length < 10) return { ok: false, problem: `${where} says "none" without a reason (write why nothing needs undoing)` };
    return { ok: true, backout: { kind: "none", reason, source } };
  }
  const executable = executableSql(body).trim();
  if (executable.length === 0) {
    // A file of comments only, such as "-- Backout: none — why".
    const header = source === "file" ? headerBackoutText(body) : null;
    if (header !== null) return fromText(header, source);
    return { ok: false, problem: `${where} has no SQL` };
  }
  if (!executable.endsWith(";")) return { ok: false, problem: `${where} does not end its last statement with ";"` };
  if (/_prisma_migrations/i.test(executable)) {
    return {
      ok: false,
      problem: `${where} touches _prisma_migrations; leave that to the tooling (pnpm migrations:backout-sql adds it)`,
    };
  }
  return { ok: true, backout: { kind: "sql", sql: text.trim(), source } };
}

/** The migration's backout: its backout.sql when present, else its header section. */
export function parseBackout(m: Pick<LocalMigration, "sql" | "backoutFile">): BackoutResult {
  if (m.backoutFile !== null) return fromText(m.backoutFile, "file");
  const header = headerBackoutText(m.sql);
  if (header === null) {
    return {
      ok: false,
      problem: `no backout SQL: add a "-- Backout:" section to its header (new migrations) or a ${BACKOUT_FILE} beside it (one already applied somewhere)`,
    };
  }
  return fromText(header, "header");
}

/**
 * The script that backs one migration out of a database: its backout SQL,
 * then its `_prisma_migrations` row, in one transaction.
 *
 * Deleting the row is what lets the migration be applied again by a later
 * `migrate deploy` (a roll-forward). Left in place, Prisma believes the
 * migration is still applied and never re-creates what the backout removed:
 * the roll-forward then deploys code against a schema missing its columns.
 * (`prisma migrate resolve --rolled-back` refuses a migration that did not
 * fail, so it cannot do this.)
 */
export function backoutScript(name: string, backout: Backout): string {
  if (!MIGRATION_NAME_RE.test(name)) throw new Error(`not a migration name: ${name}`);
  const body =
    backout.kind === "sql"
      ? backout.sql
      : `-- ${name}: nothing to undo in the schema (${backout.reason})`;
  return [
    `-- Back out ${name}`,
    "BEGIN;",
    body,
    `DELETE FROM "_prisma_migrations" WHERE "migration_name" = '${name}';`,
    "COMMIT;",
    "",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// The protocol check
// ---------------------------------------------------------------------------

export interface ProtocolBase {
  /** A label for messages: the ref as given, or "the protocol cutoff". */
  readonly label: string;
  /** migration name -> SHA-256 of its migration.sql at that ref. */
  readonly migrations: ReadonlyMap<string, string>;
}

export interface ProtocolReport {
  readonly errors: readonly string[];
  readonly notes: readonly string[];
  /** The migrations the backout and additive rules apply to, oldest first. */
  readonly governed: readonly string[];
}

export function checkProtocol(input: {
  readonly local: readonly LocalMigration[];
  /** Checksum of every migration at PROTOCOL_CUTOFF_COMMIT (cutoffMigrations()). */
  readonly cutoff: ReadonlyMap<string, string>;
  /** Other refs whose migrations must be unchanged: origin/main, the push's parent. */
  readonly bases: readonly ProtocolBase[];
  /**
   * Migrations backed out of production and removed from main on purpose
   * (backedOutMigrations(): prisma/backed-out-migrations.json), name -> the
   * record of why. The one removal rule 1 allows.
   */
  readonly backedOut?: ReadonlyMap<string, string>;
}): ProtocolReport {
  const errors: string[] = [];
  const notes: string[] = [];
  const byName = new Map(input.local.map((m) => [m.name, m]));
  const backedOut = input.backedOut ?? new Map<string, string>();

  for (const m of input.local) {
    if (!MIGRATION_NAME_RE.test(m.name)) errors.push(`${m.name}: not a migration name (expected <14-digit UTC timestamp>_<snake_case>)`);
    if (m.sql.length === 0) errors.push(`${m.name}: has no migration.sql (Prisma fails on an empty migration directory)`);
  }
  for (const name of backedOut.keys()) {
    if (input.cutoff.has(name)) errors.push(`${name}: listed as backed out, but it is at the protocol cutoff, which has no backout`);
    else if (byName.has(name))
      errors.push(`${name}: listed as backed out, but its directory is still here, so the next deploy re-applies it. Remove one or the other.`);
  }

  // Rule 1: nothing already applied elsewhere is touched.
  for (const base of [{ label: "the protocol cutoff", migrations: input.cutoff }, ...input.bases]) {
    const isCutoff = base.migrations === input.cutoff;
    for (const [name, checksum] of base.migrations) {
      const now = byName.get(name);
      if (!now && !isCutoff && backedOut.has(name)) {
        notes.push(`${name}: removed from ${base.label} after being backed out (${backedOut.get(name)})`);
      } else if (!now) {
        errors.push(`${name}: removed or renamed, but it is on ${base.label}. A database that applied it keeps it; add a new migration instead.`);
      } else if (now.checksum !== checksum) {
        errors.push(
          `${name}: migration.sql differs from ${base.label}. Prisma never re-runs an applied migration, so this edit would reach new databases and never production. Restore it and put the change in a new migration.`,
        );
      }
    }
  }

  // Rules 2 and 3: every migration the cutoff did not have.
  const governed = input.local.filter((m) => !input.cutoff.has(m.name));
  for (const m of governed) {
    const backout = parseBackout(m);
    if (!backout.ok) errors.push(`${m.name}: ${backout.problem}`);
    else if (backout.backout.kind === "none") notes.push(`${m.name}: backout "none" (${backout.backout.reason})`);

    const destructive = destructiveStatements(m.sql);
    if (destructive.length > 0) {
      const reason = contractReason(m.sql);
      const lines = destructive.map((d) => `    - ${d.rule}: ${d.statement}`).join("\n");
      if (reason) notes.push(`${m.name}: contract migration (${reason}):\n${lines}`);
      else
        errors.push(
          `${m.name}: not additive. Expand first; drop or rename in a later release once no deployed code reads it, with a "-- Contract: <why it is safe now>" line:\n${lines}`,
        );
    }
  }

  return { errors, notes, governed: governed.map((m) => m.name) };
}

// ---------------------------------------------------------------------------
// What a database applied
// ---------------------------------------------------------------------------

export interface AppliedMigration {
  readonly migrationName: string;
  readonly checksum: string;
  readonly finishedAt: Date | null;
  readonly rolledBackAt: Date | null;
}

export interface AppliedComparison {
  /** Applied, and the file has changed since. */
  readonly modified: readonly string[];
  /** Applied, and no such directory exists here (removed, renamed, or from another branch). */
  readonly unknown: readonly string[];
  /** In the directory, not applied yet: what the next deploy will run. */
  readonly pending: readonly string[];
}

export function compareAppliedChecksums(
  applied: readonly AppliedMigration[],
  local: readonly LocalMigration[],
): AppliedComparison {
  const byName = new Map(local.map((m) => [m.name, m]));
  const live = applied.filter((a) => a.finishedAt !== null && a.rolledBackAt === null);
  const appliedNames = new Set(live.map((a) => a.migrationName));
  const modified: string[] = [];
  const unknown: string[] = [];
  for (const a of live) {
    const m = byName.get(a.migrationName);
    if (!m) unknown.push(a.migrationName);
    else if (m.checksum !== a.checksum) modified.push(a.migrationName);
  }
  const pending = local.filter((m) => !appliedNames.has(m.name)).map((m) => m.name);
  return { modified: modified.sort(), unknown: unknown.sort(), pending };
}

// ---------------------------------------------------------------------------
// git
// ---------------------------------------------------------------------------

function git(cwd: string, args: readonly string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
}

/** True when `ref` names a commit this clone has. */
export function gitHasCommit(cwd: string, ref: string): boolean {
  try {
    git(cwd, ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]);
    return true;
  } catch {
    return false;
  }
}

/**
 * migration name -> SHA-256 of its migration.sql at `ref`, from the blob's
 * exact bytes. Throws when the clone lacks the commit.
 */
export function gitMigrationsAt(cwd: string, ref: string): Map<string, string> {
  if (!gitHasCommit(cwd, ref)) {
    throw new Error(`${ref} is not a commit in this clone (in CI, check out with fetch-depth: 0)`);
  }
  const files = git(cwd, ["ls-tree", "-r", "--name-only", ref, "--", `${MIGRATIONS_DIR}/`])
    .split("\n")
    .filter((p) => /^prisma\/migrations\/[^/]+\/migration\.sql$/.test(p));
  const out = new Map<string, string>();
  for (const path of files) {
    const name = path.split("/")[2]!;
    const bytes = execFileSync("git", ["show", `${ref}:${path}`], {
      cwd,
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
    out.set(name, sha256Hex(bytes));
  }
  return out;
}

/**
 * The migrations at the protocol cutoff and their checksums, from the
 * committed manifest (migration-cutoff.json). Committed rather than read from
 * git so the rule holds in a shallow clone, in a unit test and on a machine
 * without the history; a test checks the manifest against git whenever the
 * clone has the commit.
 */
export function cutoffMigrations(): Map<string, string> {
  if (cutoffManifest.commit !== PROTOCOL_CUTOFF_COMMIT) throw new Error("migration-cutoff.json is for another commit");
  return new Map(Object.entries(cutoffManifest.migrations));
}

/**
 * The register of migrations backed out of production and then removed from
 * main (prisma/backed-out-migrations.json): name -> when, by whom and why.
 * Written by the person who ran the backout, in the pull request that removes
 * the directory (docs/runbooks/coreedge-release.md, step 6). A fixed version
 * comes back under a NEW name, never this one: a database that applied the
 * old file and was not backed out would otherwise never run the new one.
 */
export function backedOutMigrations(): Map<string, string> {
  return new Map(Object.entries(backedOutRegister.migrations as Record<string, string>));
}
