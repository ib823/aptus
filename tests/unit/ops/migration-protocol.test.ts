// @vitest-environment node
/**
 * The migration rules of the CoreEdge release protocol (P0.17,
 * docs/runbooks/coreedge-release.md): an applied migration is never edited,
 * every new one carries backout SQL and is additive, and a database's
 * recorded checksums expose an edit Prisma would silently ignore.
 *
 * The last block runs the rules on this repository's own migrations, the way
 * the CI step does, so `pnpm test` fails on a migration that breaks them.
 */

import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  backedOutMigrations,
  backoutScript,
  checkProtocol,
  compareAppliedChecksums,
  contractReason,
  cutoffMigrations,
  destructiveStatements,
  executableSql,
  gitHasCommit,
  gitMigrationsAt,
  headerBackoutText,
  type LocalMigration,
  parseBackout,
  PROTOCOL_CUTOFF_COMMIT,
  readLocalMigrations,
  sha256Hex,
} from "../../../scripts/lib/migration-protocol";

const ROOT = join(__dirname, "..", "..", "..");

function migration(name: string, sql: string, backoutFile: string | null = null): LocalMigration {
  return { name, sql, checksum: sha256Hex(sql), backoutFile };
}

describe("executableSql: only what PostgreSQL would run", () => {
  it("drops line and block comments and blanks string contents", () => {
    const out = executableSql(`-- we never DROP TABLE here\nUPDATE "A" SET "b" = 'DELETE FROM x; it''s fine' /* DROP COLUMN */;`);
    expect(out).not.toMatch(/DROP|DELETE/);
    expect(out).toContain(`UPDATE "A" SET "b" = ''`);
  });

  it("keeps quoted identifiers, which are code", () => {
    expect(executableSql(`ALTER TABLE "x--y" ADD COLUMN "z" TEXT;`)).toContain(`"x--y"`);
  });
});

describe("destructiveStatements: what the running code cannot survive", () => {
  const rules = (sql: string) => destructiveStatements(sql).map((f) => f.rule);

  it.each([
    [`DROP TABLE "A";`, /drops/],
    [`ALTER TABLE "A" DROP COLUMN "b";`, /drops/],
    [`ALTER TABLE "A" DROP "b";`, /drops/],
    [`ALTER TABLE "A" ALTER COLUMN "b" DROP DEFAULT;`, /drops/],
    [`DROP INDEX "A_b_idx";`, /drops/],
    [`DELETE FROM "A" WHERE true;`, /deletes rows/],
    [`TRUNCATE "A";`, /deletes rows/],
    [`ALTER TABLE "A" RENAME COLUMN "b" TO "c";`, /renames/],
    [`ALTER TABLE "A" ALTER COLUMN "b" SET DATA TYPE INTEGER;`, /type/],
    [`ALTER TABLE "A" ALTER COLUMN "b" TYPE INTEGER USING "b"::int;`, /type/],
    [`ALTER TABLE "A" ALTER COLUMN "b" SET NOT NULL;`, /NOT NULL/],
    [`ALTER TABLE "A" ADD COLUMN "b" TEXT NOT NULL;`, /no DEFAULT/],
    [`ALTER TABLE "A" ADD COLUMN "a" TEXT, ADD COLUMN "b" DECIMAL(10,2) NOT NULL;`, /no DEFAULT/],
  ])("refuses %s", (sql, rule) => {
    expect(rules(sql).some((r) => rule.test(r))).toBe(true);
  });

  it.each([
    `CREATE TABLE "A" ("id" TEXT NOT NULL, CONSTRAINT "A_pkey" PRIMARY KEY ("id"));`,
    `ALTER TABLE "A" ADD COLUMN "b" TEXT;`,
    `ALTER TABLE "A" ADD COLUMN "b" TEXT NOT NULL DEFAULT 'ce_';`,
    `ALTER TABLE "A" ADD COLUMN "a" DECIMAL(10,2) NOT NULL DEFAULT 0, ADD COLUMN "b" TEXT;`,
    `ALTER TABLE "A" ALTER COLUMN "b" DROP NOT NULL;`,
    `CREATE INDEX "A_b_idx" ON "A"("b");`,
    `UPDATE "A" SET "b" = 1 WHERE "b" IS NULL;`,
    `-- Backout: DROP TABLE "A";\nCREATE TABLE "A" ("id" TEXT);`,
    `ALTER TABLE "A" ADD CONSTRAINT "A_b_fkey" FOREIGN KEY ("b") REFERENCES "B"("id") ON DELETE CASCADE;`,
    `ALTER TABLE "A" ADD CONSTRAINT "A_b_check" CHECK ("b" IS NOT NULL) NOT VALID;`,
  ])("allows %s", (sql) => {
    expect(destructiveStatements(sql)).toEqual([]);
  });

  it("reads the reason from a Contract line", () => {
    expect(contractReason(`-- Contract: nothing reads "b" since release 2026-11-01 (#320).\nALTER TABLE "A" DROP COLUMN "b";`)).toBe(
      `nothing reads "b" since release 2026-11-01 (#320).`,
    );
    expect(contractReason(`ALTER TABLE "A" DROP COLUMN "b";`)).toBeNull();
  });
});

describe("the backout section", () => {
  const HEADER = [
    "-- Something about the change.",
    "--",
    `-- Backout: ALTER TABLE "A" DROP CONSTRAINT "A_b_fkey";`,
    `--          DROP INDEX "A_b_idx";`,
    `--          ALTER TABLE "A" DROP COLUMN "b",`,
    `--            DROP COLUMN "c";`,
    "",
    `ALTER TABLE "A" ADD COLUMN "b" TEXT, ADD COLUMN "c" TEXT;`,
  ].join("\n");

  it("runs on over indented comment lines, and stops at the first that is not one", () => {
    expect(headerBackoutText(HEADER)).toBe(
      [`ALTER TABLE "A" DROP CONSTRAINT "A_b_fkey";`, `DROP INDEX "A_b_idx";`, `ALTER TABLE "A" DROP COLUMN "b",`, `DROP COLUMN "c";`].join("\n"),
    );
    expect(headerBackoutText(`-- Backout: DROP TABLE "A";\n-- prose after it\nCREATE TABLE "A" ("id" TEXT);`)).toBe(`DROP TABLE "A";`);
  });

  it("is SQL to run", () => {
    expect(parseBackout(migration("20990101000000_x", HEADER))).toEqual({
      ok: true,
      backout: expect.objectContaining({ kind: "sql", source: "header" }),
    });
  });

  it("is required", () => {
    const r = parseBackout(migration("20990101000000_x", `CREATE TABLE "A" ("id" TEXT);`));
    expect(r).toEqual({ ok: false, problem: expect.stringMatching(/no backout SQL/) });
  });

  it("may be none, but only with a reason", () => {
    expect(parseBackout(migration("20990101000000_x", "-- Backout: none — the backfill only fills columns an earlier migration added\nUPDATE x SET y = 1;"))).toEqual({
      ok: true,
      backout: { kind: "none", reason: "the backfill only fills columns an earlier migration added", source: "header" },
    });
    expect(parseBackout(migration("20990101000000_x", "-- Backout: none\nUPDATE x SET y = 1;"))).toEqual({
      ok: false,
      problem: expect.stringMatching(/without a reason/),
    });
  });

  it("must end its statement, and must leave _prisma_migrations to the tooling", () => {
    expect(parseBackout(migration("20990101000000_x", `-- Backout: DROP TABLE "A"\nCREATE TABLE "A" ("id" TEXT);`))).toEqual({
      ok: false,
      problem: expect.stringMatching(/does not end/),
    });
    expect(
      parseBackout(migration("20990101000000_x", "x", `DROP TABLE "A";\nDELETE FROM "_prisma_migrations" WHERE "migration_name" = 'x';`)),
    ).toEqual({ ok: false, problem: expect.stringMatching(/_prisma_migrations/) });
  });

  it("comes from backout.sql when there is one, which wins over the header (the header of an applied migration can never be corrected)", () => {
    const r = parseBackout(migration("20990101000000_x", HEADER, `-- corrected\nDROP TABLE "Other";\n`));
    expect(r).toEqual({ ok: true, backout: { kind: "sql", sql: `-- corrected\nDROP TABLE "Other";`, source: "file" } });
    expect(parseBackout(migration("20990101000000_x", "x", "-- Backout: none — nothing was created, only rows stamped\n"))).toEqual({
      ok: true,
      backout: { kind: "none", reason: "nothing was created, only rows stamped", source: "file" },
    });
    expect(parseBackout(migration("20990101000000_x", "x", "-- just prose\n"))).toEqual({ ok: false, problem: expect.stringMatching(/has no SQL/) });
  });

  it("is printed with the _prisma_migrations row in one transaction, so a roll-forward re-applies the migration", () => {
    const script = backoutScript("20990101000000_x", { kind: "sql", sql: `DROP TABLE "A";`, source: "header" });
    expect(script.split("\n")).toEqual([
      "-- Back out 20990101000000_x",
      "BEGIN;",
      `DROP TABLE "A";`,
      `DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20990101000000_x';`,
      "COMMIT;",
      "",
    ]);
    expect(() => backoutScript("x'; DROP TABLE y; --", { kind: "sql", sql: "", source: "file" })).toThrow(/not a migration name/);
  });
});

describe("checkProtocol", () => {
  const OLD = migration("20990101000000_old", `CREATE TABLE "Old" ("id" TEXT);`);
  const cutoff = new Map([[OLD.name, OLD.checksum]]);
  const NEW = migration("20990102000000_new", `-- Backout: DROP TABLE "New";\nCREATE TABLE "New" ("id" TEXT);`);

  it("passes an untouched history with a new, additive migration that can be backed out", () => {
    expect(checkProtocol({ local: [OLD, NEW], cutoff, bases: [] })).toEqual({ errors: [], notes: [], governed: [NEW.name] });
  });

  it("refuses an edit to a migration at the cutoff or on main", () => {
    const edited = migration(OLD.name, `${OLD.sql}\n-- a harmless-looking comment`);
    expect(checkProtocol({ local: [edited, NEW], cutoff, bases: [] }).errors).toEqual([
      expect.stringMatching(/^20990101000000_old: migration.sql differs from the protocol cutoff/),
    ]);
    const onMain = { label: "origin/main", migrations: new Map([[NEW.name, NEW.checksum]]) };
    const editedNew = migration(NEW.name, `${NEW.sql}\nCREATE INDEX "i" ON "New"("id");`);
    expect(checkProtocol({ local: [OLD, editedNew], cutoff, bases: [onMain] }).errors).toEqual([
      expect.stringMatching(/^20990102000000_new: migration.sql differs from origin\/main/),
    ]);
  });

  it("refuses removing or renaming one", () => {
    expect(checkProtocol({ local: [NEW], cutoff, bases: [] }).errors).toEqual([expect.stringMatching(/^20990101000000_old: removed or renamed/)]);
  });

  it("allows removing a migration from main only when the register says it was backed out", () => {
    const onMain = { label: "origin/main", migrations: new Map([[OLD.name, OLD.checksum], [NEW.name, NEW.checksum]]) };
    expect(checkProtocol({ local: [OLD], cutoff, bases: [onMain] }).errors).toEqual([expect.stringMatching(/^20990102000000_new: removed or renamed/)]);

    const backedOut = new Map([[NEW.name, "2099-01-03, ops, broke inserts of the old code, #999"]]);
    const r = checkProtocol({ local: [OLD], cutoff, bases: [onMain], backedOut });
    expect(r.errors).toEqual([]);
    expect(r.notes).toEqual([expect.stringMatching(/^20990102000000_new: removed from origin\/main after being backed out \(2099-01-03/)]);

    // Never a migration at the cutoff, and never one whose directory is still here.
    expect(checkProtocol({ local: [], cutoff, bases: [], backedOut: new Map([[OLD.name, "x"]]) }).errors).toEqual(
      expect.arrayContaining([expect.stringMatching(/^20990101000000_old: listed as backed out, but it is at the protocol cutoff/)]),
    );
    expect(checkProtocol({ local: [OLD, NEW], cutoff, bases: [], backedOut }).errors).toEqual([
      expect.stringMatching(/^20990102000000_new: listed as backed out, but its directory is still here/),
    ]);
  });

  it("asks backout SQL only of migrations the cutoff lacks", () => {
    const bare = migration("20990103000000_bare", `CREATE TABLE "Bare" ("id" TEXT);`);
    const r = checkProtocol({ local: [OLD, NEW, bare], cutoff, bases: [] });
    expect(r.errors).toEqual([expect.stringMatching(/^20990103000000_bare: no backout SQL/)]);
  });

  it("refuses a destructive new migration unless it says why it is a safe contract step", () => {
    const drop = `-- Backout: ALTER TABLE "Old" ADD COLUMN "b" TEXT;\nALTER TABLE "Old" DROP COLUMN "b";`;
    expect(checkProtocol({ local: [OLD, migration("20990103000000_drop", drop)], cutoff, bases: [] }).errors).toEqual([
      expect.stringMatching(/not additive[\s\S]*drops an object/),
    ]);
    const contract = migration("20990103000000_drop", `-- Contract: no deployed code reads "b" since #330.\n${drop}`);
    const r = checkProtocol({ local: [OLD, contract], cutoff, bases: [] });
    expect(r.errors).toEqual([]);
    expect(r.notes).toEqual([expect.stringMatching(/contract migration \(no deployed code reads "b" since #330\.\)/)]);
  });

  it("names a migration directory with no migration.sql, and a malformed name", () => {
    const r = checkProtocol({ local: [OLD, migration("20990104000000_empty", ""), migration("Fix", `-- Backout: none — nothing at all here\n`)], cutoff, bases: [] });
    expect(r.errors).toEqual(
      expect.arrayContaining([expect.stringMatching(/20990104000000_empty: has no migration.sql/), expect.stringMatching(/^Fix: not a migration name/)]),
    );
  });
});

describe("compareAppliedChecksums: an edit Prisma would never notice", () => {
  const A = migration("20990101000000_a", "CREATE TABLE a (id int);");
  const B = migration("20990102000000_b", "CREATE TABLE b (id int);");
  const at = new Date("2026-10-20T00:00:00Z");

  it("names an applied migration whose file changed, one this checkout lacks, and what is pending", () => {
    const r = compareAppliedChecksums(
      [
        { migrationName: A.name, checksum: sha256Hex("CREATE TABLE a (id int, x int);"), finishedAt: at, rolledBackAt: null },
        { migrationName: "20990101500000_other_branch", checksum: "x", finishedAt: at, rolledBackAt: null },
      ],
      [A, B],
    );
    expect(r).toEqual({ modified: [A.name], unknown: ["20990101500000_other_branch"], pending: [B.name] });
  });

  it("ignores rows of failed and rolled-back attempts", () => {
    const r = compareAppliedChecksums(
      [
        { migrationName: A.name, checksum: "stale", finishedAt: null, rolledBackAt: null },
        { migrationName: B.name, checksum: "stale", finishedAt: at, rolledBackAt: at },
      ],
      [A, B],
    );
    expect(r).toEqual({ modified: [], unknown: [], pending: [A.name, B.name] });
  });
});

describe("this repository's migrations", () => {
  const local = readLocalMigrations(join(ROOT, "prisma/migrations"));

  it("keep every rule against the protocol cutoff", () => {
    const report = checkProtocol({ local, cutoff: cutoffMigrations(), bases: [], backedOut: backedOutMigrations() });
    expect(report.errors).toEqual([]);
    // The seven migrations Phase 0b added after 520ee318, each with backout SQL.
    expect(report.governed).toEqual(
      expect.arrayContaining([
        "20261021090000_interface_grant_match_changed_at",
        "20261022000000_grant_interface_binding",
        "20261022010000_credential_hygiene",
        "20261022020000_retired_client_tokens",
        "20261023010000_contract_stamps",
        "20261023020000_catalogue_address_verification",
        "20261023030000_developer_journey_events",
      ]),
    );
  });

  it("hold every migration Prisma would see: no directory without a migration.sql", () => {
    expect(local.filter((m) => m.sql.length === 0).map((m) => m.name)).toEqual([]);
  });

  it.skipIf(!gitHasCommit(ROOT, PROTOCOL_CUTOFF_COMMIT))("have a cutoff manifest that is exactly git's view of the cutoff commit", () => {
    expect(Object.fromEntries(cutoffMigrations())).toEqual(Object.fromEntries(gitMigrationsAt(ROOT, PROTOCOL_CUTOFF_COMMIT)));
  });
});
