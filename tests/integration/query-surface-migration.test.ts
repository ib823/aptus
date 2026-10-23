// @vitest-environment node
/**
 * The query surface's migration (P1.4, 3.18), against PostgreSQL.
 *
 *   - the columns are there as the spec states them: nullable, but for the
 *     revision, which is NOT NULL with a constant default (a catalogue change,
 *     no table rewrite), and no index on the audit table (P3.5 adds one
 *     CONCURRENTLY);
 *   - backout.sql drops exactly what migration.sql added, and runs: it is
 *     rehearsed inside a transaction that is then rolled back, so the test
 *     database keeps its columns (CI's migration-integrity.yml rehearses the
 *     whole history on a database of its own).
 *
 * Opt-in on TEST_DATABASE_URL.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { PrismaClient } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";

const DIR = join(process.cwd(), "prisma/migrations/20261027000000_query_surface");
const MIGRATION = readFileSync(join(DIR, "migration.sql"), "utf8");
const BACKOUT = readFileSync(join(DIR, "backout.sql"), "utf8");

const INTERFACE_COLUMNS = ["queryPolicy", "queryBasis", "queryPolicyCompiled", "queryPolicyRevision"];
const AUDIT_COLUMNS = [
  "queryKind",
  "queryShape",
  "queryHash",
  "requestedFields",
  "queryPolicyRev",
  "cursorChainId",
  "pageIndex",
  "chainRows",
  "responseBytes",
  "queryRule",
  "queryFlags",
];

const code = (sql: string) => sql.replace(/--.*$/gm, "");
const added = (sql: string, table: string) =>
  [...code(sql).matchAll(new RegExp(`ALTER TABLE "${table}"([^;]*);`, "g"))].flatMap((m) => [...m[1]!.matchAll(/ADD COLUMN "(\w+)"/g)].map((c) => c[1]!));
const dropped = (sql: string, table: string) =>
  [...code(sql).matchAll(new RegExp(`ALTER TABLE "${table}"([^;]*);`, "g"))].flatMap((m) => [...m[1]!.matchAll(/DROP COLUMN "(\w+)"/g)].map((c) => c[1]!));

describe("the migration's text", () => {
  it("adds the four Interface columns and the eleven audit columns, and nothing else", () => {
    expect(added(MIGRATION, "Interface")).toEqual(INTERFACE_COLUMNS);
    expect(added(MIGRATION, "NorthboundAuditEvent")).toEqual(AUDIT_COLUMNS);
    expect(code(MIGRATION)).not.toMatch(/CREATE\s+(UNIQUE\s+)?INDEX|DROP|UPDATE\s|CHECK\s*\(/i);
    expect(MIGRATION).toMatch(/^-- P1\.4 Governed OData query surface/);
  });

  it("is backed out by exactly what it added", () => {
    expect(new Set(dropped(BACKOUT, "Interface"))).toEqual(new Set(INTERFACE_COLUMNS));
    expect(new Set(dropped(BACKOUT, "NorthboundAuditEvent"))).toEqual(new Set(AUDIT_COLUMNS));
  });
});

describe.skipIf(!process.env.TEST_DATABASE_URL)("the migration on PostgreSQL", () => {
  const db = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL ?? "postgresql://unused:unused@localhost:1/unused" });
  afterAll(() => db.$disconnect());

  const columns = (table: string) =>
    db.$queryRaw<{ column_name: string; data_type: string; is_nullable: string; column_default: string | null }[]>`
      SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = ${table}`;

  it("leaves every column nullable but the revision, which defaults to 0", async () => {
    const iface = new Map((await columns("Interface")).map((c) => [c.column_name, c]));
    for (const name of ["queryPolicy", "queryBasis", "queryPolicyCompiled"]) {
      expect(iface.get(name), name).toMatchObject({ data_type: "jsonb", is_nullable: "YES", column_default: null });
    }
    expect(iface.get("queryPolicyRevision")).toMatchObject({ data_type: "integer", is_nullable: "NO", column_default: "0" });
    const audit = new Map((await columns("NorthboundAuditEvent")).map((c) => [c.column_name, c]));
    for (const name of AUDIT_COLUMNS) {
      expect(audit.get(name)?.is_nullable, name).toBe("YES");
      expect(audit.get(name)?.column_default, name).toBeNull();
    }
    expect(audit.get("requestedFields")?.data_type).toBe("jsonb");
    expect(audit.get("pageIndex")?.data_type).toBe("integer");
  });

  it("adds no index on the audit table", async () => {
    const indexes = await db.$queryRaw<{ indexdef: string }[]>`
      SELECT indexdef FROM pg_indexes WHERE schemaname = current_schema() AND tablename = 'NorthboundAuditEvent'`;
    for (const name of AUDIT_COLUMNS) expect(indexes.filter((i) => i.indexdef.includes(`"${name}"`)), name).toEqual([]);
  });

  it("backout.sql runs and removes every column, inside a transaction that is rolled back", async () => {
    class Rollback extends Error {}
    let after: { Interface: string[]; NorthboundAuditEvent: string[] } | null = null;
    await expect(
      db.$transaction(async (tx) => {
        await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '5s'");
        for (const statement of code(BACKOUT).split(";").map((x) => x.trim()).filter(Boolean)) await tx.$executeRawUnsafe(statement);
        const left = async (table: string) =>
          (
            await tx.$queryRaw<{ column_name: string }[]>`
              SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = ${table}`
          ).map((c) => c.column_name);
        after = { Interface: await left("Interface"), NorthboundAuditEvent: await left("NorthboundAuditEvent") };
        throw new Rollback();
      }),
    ).rejects.toBeInstanceOf(Rollback);
    expect(after).not.toBeNull();
    const { Interface: i, NorthboundAuditEvent: a } = after!;
    for (const name of INTERFACE_COLUMNS) expect(i).not.toContain(name);
    for (const name of AUDIT_COLUMNS) expect(a).not.toContain(name);
    // The older columns stay, and the rollback put the new ones back.
    expect(i).toContain("requestSchemaStamp");
    expect(a).toContain("apiVersion");
    expect((await columns("Interface")).map((c) => c.column_name)).toEqual(expect.arrayContaining(INTERFACE_COLUMNS));
  });
});
