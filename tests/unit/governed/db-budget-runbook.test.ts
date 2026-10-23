/**
 * The database budget's runbook table says what db-budget.ts says, and renders
 * as one table (P0.14b review round 4).
 *
 * Round 3 added the console's rows after a blank line, which in Markdown ends
 * the table: they had no header or delimiter row and rendered as a paragraph
 * of pipes, exactly where an operator sizing a pool looks for the figure.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { CONSOLE_ROUTE_STATEMENTS, DB_BUDGET, NORTHBOUND_DISCOVERY_STATEMENTS, NORTHBOUND_SCHEMA_STATEMENTS } from "@/lib/governed/db-budget";

const RUNBOOK = readFileSync(path.join(process.cwd(), "docs/runbooks/coreedge-db-budget.md"), "utf8");

/** The lines of the `## The budget` section, up to the next heading. */
function budgetSection(): string[] {
  const lines = RUNBOOK.split("\n");
  const start = lines.findIndex((l) => l.trim() === "## The budget");
  expect(start).toBeGreaterThanOrEqual(0);
  const end = lines.findIndex((l, i) => i > start && /^#{1,2} /.test(l));
  return lines.slice(start + 1, end === -1 ? undefined : end);
}

describe("the db budget runbook's table", () => {
  it("renders as tables: every run of rows starts with a header and a delimiter row", () => {
    const blocks: string[][] = [];
    let current: string[] | null = null;
    for (const line of budgetSection()) {
      if (line.trimStart().startsWith("|")) (current ??= blocks[blocks.push([]) - 1]!).push(line);
      else current = null;
    }
    expect(blocks.length).toBeGreaterThan(0);
    for (const block of blocks) {
      expect(block[1] ?? "", `rows cut off from a table, with no header: "${block[0]!.slice(0, 60)}…"`).toMatch(/^\|(\s*:?-{3,}:?\s*\|)+\s*$/);
    }
    // The budget table is the first, and carries every call.
    expect(blocks[0]!.length).toBeGreaterThan(6);
  });

  it("states each budget as db-budget.ts does", () => {
    const rows = budgetSection().filter((l) => l.trimStart().startsWith("|"));
    const budgetOf = (pattern: RegExp) => {
      const row = rows.find((r) => pattern.test(r));
      expect(row, String(pattern)).toBeDefined();
      return Number(/\*\*(\d+)\*\*/.exec(row!)?.[1]);
    };
    expect(budgetOf(/^\| Read \(served/)).toBe(DB_BUDGET.read);
    expect(budgetOf(/^\| Write/)).toBe(DB_BUDGET.write);
    expect(budgetOf(/^\| Workbench console read/)).toBe(DB_BUDGET.consoleRead);
  });

  /*
   * P0.14b review round 6: the console read's row named the capability probe,
   * the catalogue probes and Probe all, measured at 4, while the capability
   * probe sends 6 and Probe all 6 plus one per service. The read's row names
   * only the routes held to 4, and the others' figures are db-budget.ts's.
   */
  it("files under the console read's 4 only the routes that do nothing but the read", () => {
    const rows = budgetSection().filter((l) => l.trimStart().startsWith("|"));
    const consoleRow = rows.find((r) => /^\| Workbench console read/.test(r));
    expect(consoleRow).toBeDefined();
    expect(consoleRow).not.toMatch(/capabilit|catalogue|Probe all/i);
  });

  it("states each other console route's statements as db-budget.ts does", () => {
    const rows = budgetSection().filter((l) => l.trimStart().startsWith("|"));
    const figuresOf = (pattern: RegExp) => {
      const row = rows.find((r) => pattern.test(r));
      expect(row, String(pattern)).toBeDefined();
      return [...row!.matchAll(/\*\*(\d+)\*\*/g)].map((m) => Number(m[1]));
    };
    expect(figuresOf(/^\| Entity list with its probe fan-out/)).toEqual([CONSOLE_ROUTE_STATEMENTS.entityListWithProbe]);
    expect(figuresOf(/^\| Capability probe/)).toEqual([CONSOLE_ROUTE_STATEMENTS.capabilityProbe]);
    expect(figuresOf(/^\| Catalogue detail with a live probe/)).toEqual([CONSOLE_ROUTE_STATEMENTS.catalogueDetailProbe]);
    expect(figuresOf(/^\| Probe all/)).toEqual([CONSOLE_ROUTE_STATEMENTS.probeAllFixed, CONSOLE_ROUTE_STATEMENTS.probeAllPerService]);
  });

  it("states GET /schema's statements as db-budget.ts does (P1.3 on P0.19)", () => {
    const rows = budgetSection().filter((l) => l.trimStart().startsWith("|"));
    const figuresOf = (pattern: RegExp) => {
      const row = rows.find((r) => pattern.test(r));
      expect(row, String(pattern)).toBeDefined();
      return [...row!.matchAll(/\*\*(\d+)\*\*/g)].map((m) => Number(m[1]));
    };
    expect(figuresOf(/^\| A contract a verify recorded/)).toEqual([NORTHBOUND_SCHEMA_STATEMENTS.compiled]);
    expect(figuresOf(/^\| An interface with no contract recorded yet/)).toEqual([NORTHBOUND_SCHEMA_STATEMENTS.none]);
  });

  it("states discovery's statements as db-budget.ts does", () => {
    const rows = budgetSection().filter((l) => l.trimStart().startsWith("|"));
    const figuresOf = (pattern: RegExp) => {
      const row = rows.find((r) => pattern.test(r));
      expect(row, String(pattern)).toBeDefined();
      return [...row!.matchAll(/\*\*(\d+)\*\*/g)].map((m) => Number(m[1]));
    };
    expect(figuresOf(/^\| Discovery, warm/)).toEqual([NORTHBOUND_DISCOVERY_STATEMENTS.warm]);
    expect(figuresOf(/^\| Discovery, key last stamped/)).toEqual([NORTHBOUND_DISCOVERY_STATEMENTS.stamped]);
    expect(figuresOf(/^\| Discovery, nothing granted/)).toEqual([NORTHBOUND_DISCOVERY_STATEMENTS.nothingGranted]);
  });

  it("does not file an Ariba call under the stored connection's statements", () => {
    const rows = budgetSection().filter((l) => l.trimStart().startsWith("|"));
    const ariba = rows.filter((r) => /Ariba/.test(r));
    expect(ariba).toHaveLength(1);
    expect(ariba[0]).toMatch(/no connection and no organization row/);
  });
});
