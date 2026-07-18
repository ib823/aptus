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

/**
 * The ONE sanctioned exception (PR-3). The Export pack must print pure black on
 * white with decisions as label+pattern (brief §3, §11); the warm on-screen
 * token palette is wrong for a mono printer. That palette is declared only in
 * this file, scoped to `.dx-root`, and the export components carry no hex —
 * they use currentColor. See the file's own header, and BUILD-LOG D4.
 */
const PRINT_PALETTE_EXEMPTION = "src/app/(external)/d/export/discovery-export.css";

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
  const all: string[] = [];
  for (const r of ROOTS) walk(join(process.cwd(), r), all);
  const rel = (f: string) => f.replace(process.cwd() + "/", "");
  const files = all.filter((f) => rel(f) !== PRINT_PALETTE_EXEMPTION);

  it("scans a non-empty set of discovery files", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it("the print-palette exemption points at a file that actually exists", () => {
    // An exemption for a path that has moved is an exemption that silently
    // widens: the guard would keep passing while the real file went unscanned.
    expect(all.map(rel)).toContain(PRINT_PALETTE_EXEMPTION);
  });

  it("the exemption is exactly one file", () => {
    expect(all.length - files.length).toBe(1);
  });

  it("the print palette stays inside the export root — nothing else imports it", () => {
    // If another surface imported this stylesheet, black-on-white would leak
    // onto a screen view and the exemption would stop being contained.
    //
    // Matches an actual import, not the filename: a bare substring check also
    // hits FitPatternSwatch.tsx, whose comment names the stylesheet to explain
    // where the palette lives. That is prose, not a leak.
    const IMPORTS_EXPORT_CSS = /(?:^|\n)\s*import\s+["'][^"']*discovery-export\.css["']/;
    const importers = all
      .filter((f) => /\.(tsx|ts)$/.test(f))
      .filter((f) => IMPORTS_EXPORT_CSS.test(readFileSync(f, "utf8")))
      .map(rel);
    expect(importers).toEqual(["src/app/(external)/d/export/page.tsx"]);
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
