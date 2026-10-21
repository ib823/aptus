// @vitest-environment node
/**
 * P0.19: nothing in the application needs a database SESSION.
 *
 * Production reaches Postgres through a transaction-mode pooler
 * (docs/runbooks/coreedge-db-budget.md, "The pooler"): each transaction, or
 * each statement outside one, may run on a different server connection. A
 * feature that lives on the session — a session advisory lock, a `SET`,
 * `LISTEN`, a cursor or temporary table kept between statements, a named
 * prepared statement — silently stops working there, or works on one
 * connection and not the next.
 *
 * So this scans the application's code for them and fails on any. A
 * transaction-scoped lock (`pg_advisory_xact_lock`, `FOR UPDATE` inside a
 * `$transaction`) and `SET LOCAL` inside one are fine: the pooler keeps a
 * transaction on one connection. Migrations are exempt: they run on the
 * direct connection (`directUrl`).
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return files(full);
    return /\.(ts|tsx|mjs|js)$/.test(name) ? [full] : [];
  });
}

/** Comments out, so a sentence about a lock is not mistaken for one. */
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1 ");

const SESSION_FEATURES: readonly [string, RegExp][] = [
  ["a session advisory lock", /\bpg_(?:try_)?advisory_lock(?:_shared)?\s*\(/i],
  ["a session setting", /\bSET\s+(?!LOCAL\b)(?:SESSION\s+)?(?:search_path|statement_timeout|lock_timeout|idle_in_transaction_session_timeout|application_name|role|time\s+zone)\b/i],
  ["set_config outside a transaction", /\bset_config\s*\([^)]*,\s*false\s*\)/i],
  ["LISTEN / NOTIFY", /\b(?:LISTEN|UNLISTEN)\s+\w|\bpg_notify\s*\(|\bNOTIFY\s+\w+\s*[,;'`]/],
  ["a named prepared statement", /\bPREPARE\s+\w+\s+(?:\(|AS\b)/i],
  ["a cursor", /\bDECLARE\s+\w+\s+(?:BINARY\s+)?(?:INSENSITIVE\s+)?(?:NO\s+)?(?:SCROLL\s+)?CURSOR\b/i],
  ["a temporary table", /\bCREATE\s+(?:LOCAL\s+|GLOBAL\s+)?TEMP(?:ORARY)?\s+TABLE\b/i],
];

describe("the application needs no database session (transaction-mode pooler)", () => {
  const sources = files(path.join(ROOT, "src")).map((file) => ({ file: path.relative(ROOT, file), text: code(readFileSync(file, "utf8")) }));

  it("scans the application's code", () => {
    expect(sources.length).toBeGreaterThan(500);
  });

  it.each(SESSION_FEATURES)("uses no %s", (_what, pattern) => {
    expect(sources.filter((s) => pattern.test(s.text)).map((s) => s.file)).toEqual([]);
  });

  it("would catch one (the patterns are not vacuous)", () => {
    const planted = [
      "await prisma.$queryRaw`SELECT pg_try_advisory_lock(42)`",
      "await prisma.$executeRawUnsafe('SET statement_timeout = 5000')",
      "SELECT set_config('app.org', $1, false)",
      "await prisma.$executeRaw`LISTEN invalidations`",
      "PREPARE fetch_key AS SELECT 1",
      "DECLARE c CURSOR FOR SELECT 1",
      "CREATE TEMP TABLE scratch (id int)",
    ];
    SESSION_FEATURES.forEach(([what, pattern], i) => expect(pattern.test(planted[i]!), what).toBe(true));
    // ...and leaves the transaction-scoped forms alone.
    expect(SESSION_FEATURES.some(([, p]) => p.test("SELECT pg_try_advisory_xact_lock(42)"))).toBe(false);
    expect(SESSION_FEATURES.some(([, p]) => p.test("SET LOCAL statement_timeout = 5000"))).toBe(false);
  });
});
