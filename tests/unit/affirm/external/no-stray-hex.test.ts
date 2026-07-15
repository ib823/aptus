/**
 * ABeam Workbench — "nothing stray" guard for the Affirm external surface.
 *
 * The executive journey (/a/*) and its components must style ONLY through the
 * Tailwind-v4 token system (globals.css). This test recursively scans the
 * external route tree and the external affirm components for raw hex color
 * literals (#rgb / #rrggbb / #rrggbbaa). There must be zero — every color
 * resolves to a token. globals.css itself is the one place hexes are declared,
 * and it is deliberately NOT scanned.
 */

import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

const ROOTS = [
  "src/app/(external)/a",
  "src/components/affirm/external",
  "src/components/affirm/cards",
];

// #fff, #ffffff, #ffffffff — a hex color literal.
const HEX = /#[0-9a-fA-F]{3,8}\b/;

function walk(dir: string, out: string[]): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx|ts|css)$/.test(name)) out.push(p);
  }
}

describe("no stray hex literals on the Affirm external surface", () => {
  const files: string[] = [];
  for (const r of ROOTS) walk(join(process.cwd(), r), files);

  it("scans a non-empty set of external files", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it("contains no raw hex color literals (token system only)", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line, i) => {
        if (HEX.test(line)) {
          offenders.push(`${file.replace(process.cwd() + "/", "")}:${i + 1}  ${line.trim().slice(0, 100)}`);
        }
      });
    }
    expect(offenders, `Stray hex literals found (use tokens instead):\n${offenders.join("\n")}`).toEqual([]);
  });
});
