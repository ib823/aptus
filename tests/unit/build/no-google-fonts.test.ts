// @vitest-environment node
/**
 * WHY THIS EXISTS: `next/font/google` downloads font CSS and files from
 * fonts.googleapis.com / fonts.gstatic.com DURING `next build`. When Google
 * hiccups the build dies before any test runs ("An error occurred in
 * next/font ... Cannot read properties of null (reading '1')" in
 * @next/font/dist/google/loader.js) — that failed CI's E2E Smoke on #308 and
 * #312, and Vercel production builds use the same loader. Source Serif 4 is
 * therefore self-hosted (src/fonts/source-serif-4, loaded with
 * next/font/local). This test fails if anything imports next/font/google (or
 * the old @next/font/google) again, and checks the committed font files still
 * match the SHA-256 recorded in their README.
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const self = path.join(root, "tests/unit/build/no-google-fonts.test.ts");
const fontDir = path.join(root, "src/fonts/source-serif-4");

const CODE = /\.(?:[cm]?[jt]sx?)$/;
// Dot-directories (.git, .next, .claude worktrees, ...) are skipped too.
const SKIP_DIRS = new Set([
  "node_modules",
  "docs",
  "sap-references",
  "coverage",
  "test-results",
  "playwright-report",
  "playwright-visual-report",
  "playwright-visual-app-report",
]);

/** A module specifier naming the Google font loader, in any import form. */
const GOOGLE_FONT_SPECIFIER = /["'`](?:@next\/font|next\/font)\/google(?:\/[^"'`]*)?["'`]/;

function codeFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) codeFiles(full, out);
    else if (entry.isFile() && CODE.test(entry.name) && full !== self) out.push(full);
  }
  return out;
}

describe("fonts never load from Google at build time", () => {
  it("the detector recognises every way of pulling in the Google loader", () => {
    for (const line of [
      'import { Inter } from "next/font/google";',
      "import { Inter } from 'next/font/google/target.css';",
      'const { Inter } = require("@next/font/google");',
      "await import(`next/font/google`);",
    ]) {
      expect(line).toMatch(GOOGLE_FONT_SPECIFIER);
    }
    expect('import localFont from "next/font/local";').not.toMatch(GOOGLE_FONT_SPECIFIER);
    expect("// It used to come from next/font/google, which").not.toMatch(GOOGLE_FONT_SPECIFIER);
  });

  it("no source file imports next/font/google", () => {
    const files = codeFiles(root);
    // Guard against a scan that silently found nothing.
    expect(files).toContain(path.join(root, "src/app/layout.tsx"));
    const offenders = files
      .filter((file) => GOOGLE_FONT_SPECIFIER.test(readFileSync(file, "utf8")))
      .map((file) => path.relative(root, file));
    expect(offenders, "self-host the font with next/font/local instead").toEqual([]);
  });

  it("the root layout loads Source Serif 4 from the committed file", () => {
    const layout = readFileSync(path.join(root, "src/app/layout.tsx"), "utf8");
    expect(layout).toMatch(/from "next\/font\/local"/);
    expect(layout).toContain("../fonts/source-serif-4/source-serif-4-latin-wght-normal.woff2");
    expect(layout).toContain('variable: "--font-source-serif"');
  });

  it("every committed font file matches the SHA-256 in its README, beside the OFL", () => {
    const files = readdirSync(fontDir);
    expect(files).toContain("OFL.txt");
    const readme = readFileSync(path.join(fontDir, "README.md"), "utf8");
    const checked = files.filter((f) => f.endsWith(".woff2") || f === "OFL.txt");
    expect(checked.some((f) => f.endsWith(".woff2"))).toBe(true);
    for (const file of checked) {
      const sha = createHash("sha256").update(readFileSync(path.join(fontDir, file))).digest("hex");
      const row = readme.split("\n").find((line) => line.includes(`\`${file}\``) && line.startsWith("|"));
      expect(row, `${file} has no row in README.md`).toBeDefined();
      expect(row, `${file} SHA-256 differs from README.md`).toContain(sha);
    }
  });
});
