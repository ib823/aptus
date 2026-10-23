/**
 * The governing documents name the column a verify writes.
 *
 * Since migration 20261026050000 a verify stamps a write interface in
 * `Interface.requestSchemaStamp` and leaves `Interface.requestSchema` NULL, so
 * that every build before P1.3 (wave 2, c7cfd162) serves `requestSchema: null`
 * after an Instant Rollback. An operator planning a rollback or a backout reads
 * the roadmap's P1.3 status line and the runbook: both must say so, and point
 * at the migration (which has a backout.sql). P1 on wave 2 integration review
 * round 2.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "fs";
import path from "path";

const ROOT = path.resolve(__dirname, "../../..");
const MIGRATION = "20261026050000_interface_request_schema_stamp";

function p13Status(): string {
  const roadmap = readFileSync(path.join(ROOT, "docs/coreedge/CoreEdge-Gap-Study-and-Roadmap.md"), "utf8");
  const start = roadmap.indexOf("**P1.3 ");
  const end = roadmap.indexOf("**P1.4 ", start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  const status = roadmap.slice(start, end).split("\n").find((l) => l.startsWith("- Status:"));
  expect(status).toBeDefined();
  return status!;
}

describe("where a verify stamps a write interface, as the documents say", () => {
  it("the migration that adds the column has a backout", () => {
    expect(existsSync(path.join(ROOT, "prisma/migrations", MIGRATION, "migration.sql"))).toBe(true);
    expect(existsSync(path.join(ROOT, "prisma/migrations", MIGRATION, "backout.sql"))).toBe(true);
  });

  it("the record writes requestSchemaStamp and never the requestSchema column", () => {
    const record = readFileSync(path.join(ROOT, "src/lib/contracts/record.ts"), "utf8");
    expect(record).toMatch(/data:\s*\{\s*requestSchemaStamp:/);
    expect(record).not.toMatch(/data:\s*\{\s*requestSchema:/);
  });

  it("the roadmap's P1.3 status line names requestSchemaStamp, its migration, and that requestSchema stays NULL", () => {
    const status = p13Status();
    expect(status).not.toMatch(/writes a write interface's `requestSchema`/);
    expect(status).toContain("`Interface.requestSchemaStamp`");
    expect(status).toContain("20261026050000");
    expect(status).toContain("backout.sql");
    expect(status).toMatch(/`Interface\.requestSchema` stays NULL/);
  });

  it("the runbook says the same", () => {
    const runbook = readFileSync(path.join(ROOT, "docs/runbooks/coreedge-contract-compiler.md"), "utf8");
    expect(runbook).toContain("**Writes `requestSchemaStamp`**");
    expect(runbook).toContain("**`Interface.requestSchema` itself stays NULL**");
    expect(runbook).toContain(MIGRATION);
  });
});
