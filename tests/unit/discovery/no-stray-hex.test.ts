/**
 * ABeam Workbench — "nothing stray" guard for the Neutral Process Discovery surface.
 *
 * Invariant 5: tokens only. The /d routes and the discovery components must
 * style ONLY through the Tailwind-v4 token system (globals.css). This mirrors
 * tests/unit/affirm/external/no-stray-hex.test.ts and reuses its regex.
 *
 * Note the .dc prototype is literal hex throughout (23 distinct values), so
 * every colour on this surface is a deliberate hex→token mapping rather than a
 * copy-paste. 22 of the 23 map to existing tokens; the 23rd (#DDD9CC, the export
 * print backdrop) is D4 and belongs to PR-3.
 *
 * Alpha uses color-mix against a token — never a new hex, never a raw rgba.
 */

import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

const ROOTS = ["src/app/(external)/d", "src/components/discovery"];

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

describe("no stray hex literals on the discovery surface", () => {
  const files: string[] = [];
  for (const r of ROOTS) walk(join(process.cwd(), r), files);

  it("scans a non-empty set of discovery files", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it("contains no raw hex color literals (token system only)", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line, i) => {
        if (HEX.test(line)) {
          offenders.push(
            `${file.replace(process.cwd() + "/", "")}:${i + 1}  ${line.trim().slice(0, 100)}`,
          );
        }
      });
    }
    expect(offenders, `Stray hex literals found (use tokens instead):\n${offenders.join("\n")}`).toEqual(
      [],
    );
  });

  it("contains no raw rgba() colour literals (alpha goes through color-mix)", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line, i) => {
        if (/\brgba?\(\s*\d/.test(line)) {
          offenders.push(`${file.replace(process.cwd() + "/", "")}:${i + 1}  ${line.trim().slice(0, 100)}`);
        }
      });
    }
    expect(offenders, `Raw rgba() found — use color-mix against a token:\n${offenders.join("\n")}`).toEqual(
      [],
    );
  });
});
