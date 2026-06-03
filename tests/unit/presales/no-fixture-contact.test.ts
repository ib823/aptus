import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
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
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (TEXT_EXT.has(extname(full))) out.push(full);
  }
  return out;
}

describe("D7 — no hardcoded fixture consultant contact in src/", () => {
  const files = walk(SRC);

  it("scans a non-trivial number of source files", () => {
    expect(files.length).toBeGreaterThan(50);
  });

  for (const needle of FORBIDDEN) {
    it(`contains no occurrence of "${needle}"`, () => {
      const hits = files.filter((f) => readFileSync(f, "utf8").includes(needle));
      expect(hits).toEqual([]);
    });
  }
});
