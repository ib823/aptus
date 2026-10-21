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

import { DB_BUDGET } from "@/lib/governed/db-budget";

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

  it("does not file an Ariba call under the stored connection's statements", () => {
    const rows = budgetSection().filter((l) => l.trimStart().startsWith("|"));
    const ariba = rows.filter((r) => /Ariba/.test(r));
    expect(ariba).toHaveLength(1);
    expect(ariba[0]).toMatch(/no connection and no organization row/);
  });
});
