// @vitest-environment node
import { beforeAll, describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, extname } from "node:path";

/**
 * D7 guard — the terminal pages must resolve the real owning consultant from
 * the database, never a hardcoded fixture. This keeps the "Sarah Tan" fixture
 * (and its email/phone) from ever creeping back into the source tree.
 */

const SRC = join(process.cwd(), "src");
const FORBIDDEN = ["Sarah Tan", "sarah.tan@abeam.com", "+60 3 1234 5678"];
const TEXT_EXT = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".css",
  ".md",
  ".json",
]);

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (TEXT_EXT.has(extname(full))) out.push(full);
  }
  return out;
}

describe("D7 — no hardcoded fixture consultant contact in src/", () => {
  let files: string[];
  const hitsByNeedle = new Map(FORBIDDEN.map((needle) => [needle, [] as string[]]));

  beforeAll(() => {
    files = walk(SRC);
    // Read the source tree once; each assertion still names its offending files.
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      for (const [needle, hits] of hitsByNeedle) {
        if (source.includes(needle)) hits.push(file);
      }
    }
  }, 30_000);

  it("scans a non-trivial number of source files", () => {
    expect(files.length).toBeGreaterThan(50);
  });

  for (const needle of FORBIDDEN) {
    it(`contains no occurrence of "${needle}"`, () => {
      expect(hitsByNeedle.get(needle)).toEqual([]);
    });
  }
});
