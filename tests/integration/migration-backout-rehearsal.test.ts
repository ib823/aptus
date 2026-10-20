// @vitest-environment node
/**
 * The backout rehearsal (P0.17, docs/runbooks/coreedge-release.md step 6),
 * against real PostgreSQL and the real prisma CLI, on a small fixture
 * history: one migration at the "cutoff", one with a header backout and one
 * with a backout.sql file.
 *
 * It must pass a correct pair of backouts, and fail, saying which step, when a
 * backout leaves something behind or does not run. CI runs the same function
 * on this repository's whole history (migration-integrity.yml).
 *
 * Opt-in on TEST_DATABASE_URL. Creates two throwaway databases on that server
 * and drops them after; the test database itself is never touched.
 */

import { randomBytes } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { rehearseBackouts } from "../../scripts/lib/migration-rehearsal";

const TEST_URL = process.env.TEST_DATABASE_URL;
const SUFFIX = randomBytes(4).toString("hex");
const DB = `rehearsal_${SUFFIX}`;
const SHADOW = `rehearsal_shadow_${SUFFIX}`;
const urlFor = (db: string) => {
  const u = new URL(TEST_URL ?? "postgresql://unused:unused@localhost:1/unused");
  u.pathname = `/${db}`;
  return u.toString();
};

const SCHEMA = `datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Thing {
  id    String  @id
  label String?

  @@index([label])
}

model Other {
  id String @id
}
`;

const BASE = `-- The cutoff's migration: no backout needed.
CREATE TABLE "Thing" (
    "id" TEXT NOT NULL,

    CONSTRAINT "Thing_pkey" PRIMARY KEY ("id")
);
`;

const ADD_LABEL = `-- Thing.label, indexed.
--
-- Backout: DROP INDEX "Thing_label_idx";
--          ALTER TABLE "Thing" DROP COLUMN "label";

ALTER TABLE "Thing" ADD COLUMN "label" TEXT;
CREATE INDEX "Thing_label_idx" ON "Thing"("label");
`;

const OTHER = `CREATE TABLE "Other" (
    "id" TEXT NOT NULL,

    CONSTRAINT "Other_pkey" PRIMARY KEY ("id")
);
`;

let fixture = "";
let admin: PrismaClient;
const logs: string[] = [];

function writeFixture(over: { otherBackout?: string; labelSql?: string } = {}) {
  rmSync(join(fixture, "migrations"), { recursive: true, force: true });
  const put = (name: string, sql: string, backout?: string) => {
    mkdirSync(join(fixture, "migrations", name), { recursive: true });
    writeFileSync(join(fixture, "migrations", name, "migration.sql"), sql);
    if (backout !== undefined) writeFileSync(join(fixture, "migrations", name, "backout.sql"), backout);
  };
  put("20990101000000_base", BASE);
  put("20990102000000_add_label", over.labelSql ?? ADD_LABEL);
  put("20990103000000_other", OTHER, over.otherBackout ?? `-- Backout for 20990103000000_other.\nDROP TABLE "Other";\n`);
  writeFileSync(join(fixture, "migrations", "migration_lock.toml"), 'provider = "postgresql"\n');
}

async function freshDatabases() {
  for (const db of [DB, SHADOW]) {
    await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${db}" WITH (FORCE)`);
    await admin.$executeRawUnsafe(`CREATE DATABASE "${db}"`);
  }
}

const rehearse = (since: string | null = null) =>
  rehearseBackouts({
    schemaPath: join(fixture, "schema.prisma"),
    databaseUrl: urlFor(DB),
    shadowDatabaseUrl: urlFor(SHADOW),
    keep: new Set(["20990101000000_base"]),
    since,
    log: (l) => logs.push(l),
  });

async function applied(): Promise<string[]> {
  const c = new PrismaClient({ datasourceUrl: urlFor(DB) });
  try {
    const [table] = await c.$queryRawUnsafe<{ t: string | null }[]>(`SELECT to_regclass('"_prisma_migrations"')::text AS t`);
    if (!table?.t) return [];
    const rows = await c.$queryRawUnsafe<{ migration_name: string }[]>(
      `SELECT "migration_name" FROM "_prisma_migrations" WHERE "finished_at" IS NOT NULL AND "rolled_back_at" IS NULL ORDER BY 1`,
    );
    return rows.map((r) => r.migration_name);
  } finally {
    await c.$disconnect();
  }
}

describe.skipIf(!TEST_URL)("rehearsing every backout on a history-built database (P0.17)", () => {
  beforeAll(async () => {
    admin = new PrismaClient({ datasourceUrl: TEST_URL ?? "" });
    fixture = mkdtempSync(join(tmpdir(), "rehearsal-fixture-"));
    writeFileSync(join(fixture, "schema.prisma"), SCHEMA);
  });

  beforeEach(async () => {
    logs.length = 0;
    await freshDatabases();
  });

  afterAll(async () => {
    for (const db of [DB, SHADOW]) await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${db}" WITH (FORCE)`);
    await admin.$disconnect();
    rmSync(fixture, { recursive: true, force: true });
  });

  it("backs out newest first, matches the kept history, then rolls forward to schema.prisma", async () => {
    writeFixture();
    const r = rehearse();
    expect(r, logs.join("\n")).toEqual({
      ok: true,
      backedOut: ["20990103000000_other", "20990102000000_add_label"],
      failure: null,
    });
    // The roll-forward re-applied both: the rows the backout removed are back.
    expect(await applied()).toEqual(["20990101000000_base", "20990102000000_add_label", "20990103000000_other"]);
  }, 120_000);

  it("fails when a backout leaves something behind, and says so", async () => {
    // Drops the index but forgets the column.
    writeFixture({
      labelSql: ADD_LABEL.replace(`--          ALTER TABLE "Thing" DROP COLUMN "label";\n`, ""),
    });
    const r = rehearse();
    expect(r.ok).toBe(false);
    expect(r.failure).toMatch(/does not match the migrations kept/);
    expect(logs.join("\n")).toMatch(/Removed column `label`|label/);
  }, 120_000);

  it("fails when a backout does not run, before touching anything older, and leaves that migration applied", async () => {
    writeFixture({ otherBackout: `DROP TABLE "NoSuchTable";\n` });
    const r = rehearse();
    expect(r).toMatchObject({ ok: false, backedOut: [], failure: "the backout of 20990103000000_other failed to run" });
    // One transaction: the failed backout removed neither the table nor its row.
    expect(await applied()).toEqual(["20990101000000_base", "20990102000000_add_label", "20990103000000_other"]);
  }, 120_000);

  it("backs out only a release's own migrations with since", async () => {
    writeFixture();
    const r = rehearse("20990103000000_other");
    expect(r, logs.join("\n")).toMatchObject({ ok: true, backedOut: ["20990103000000_other"] });
  }, 120_000);

  it("refuses a migration with no backout before touching the database", async () => {
    writeFixture({ labelSql: ADD_LABEL.replace(/-- Backout:[\s\S]*?"label";\n/, "") });
    const r = rehearse();
    expect(r).toMatchObject({ ok: false, backedOut: [], failure: expect.stringMatching(/^20990102000000_add_label: no backout SQL/) });
    expect(await applied()).toEqual([]);
  }, 120_000);
});
