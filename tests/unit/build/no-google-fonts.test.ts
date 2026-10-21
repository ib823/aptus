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

  it("the root layout loads Source Serif 4 from the committed files", () => {
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

/**
 * The faces the old `Source_Serif_4({ subsets: ["latin"], weight: ["400",
 * "500", "600"] })` call emitted: Google's css2 response for that request, in
 * Google's order (latin last, so it wins where ranges overlap). Each subset is
 * one variable woff2 declared at all three weights; only latin was preloaded.
 * Ranges and URLs are verbatim from
 * https://fonts.googleapis.com/css2?family=Source+Serif+4:wght@400;500;600&display=swap
 * fetched with next/font's user agent; hashes are of those files.
 */
const GSTATIC = "https://fonts.gstatic.com/s/sourceserif4/v15/vEFF2_tTDB4M7-auWDN0ahZJW3IX2ih5nk3AucvUHf6k";
const GOOGLE_FACES = [
  {
    subset: "cyrillic-ext",
    url: `${GSTATIC}AHr4Y3qwzSEi.woff2`,
    sha256: "4d72739b0e43d64e6b2a086a66f62df1ef90f34d6f109b279c557a64eae5d23d",
    unicodeRange: "U+0460-052F, U+1C80-1C8A, U+20B4, U+2DE0-2DFF, U+A640-A69F, U+FE2E-FE2F",
  },
  {
    subset: "cyrillic",
    url: `${GSTATIC}CXr4Y3qwzSEi.woff2`,
    sha256: "7683b72ed39c9fc64c626ae0ed611e7dc0121af71cde73fd060bd7a4a83c0d7c",
    unicodeRange: "U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116",
  },
  {
    subset: "greek",
    url: `${GSTATIC}Dnr4Y3qwzSEi.woff2`,
    sha256: "303d60869ffd404c141fa90d87ba574cd26ade348dd4659ea4b9caeadf72c183",
    unicodeRange: "U+0370-0377, U+037A-037F, U+0384-038A, U+038C, U+038E-03A1, U+03A3-03FF",
  },
  {
    subset: "vietnamese",
    url: `${GSTATIC}Anr4Y3qwzSEi.woff2`,
    sha256: "752875b4c33f07a3dda7c8f0be846fef059cb0f4e85211b855aa93dd85d45a22",
    unicodeRange:
      "U+0102-0103, U+0110-0111, U+0128-0129, U+0168-0169, U+01A0-01A1, U+01AF-01B0, U+0300-0301, U+0303-0304, U+0308-0309, U+0323, U+0329, U+1EA0-1EF9, U+20AB",
  },
  {
    subset: "latin-ext",
    url: `${GSTATIC}A3r4Y3qwzSEi.woff2`,
    sha256: "231f594ad829d45f905a8a6cdce704f659615e00f1a9db2699320e6e315c1d1f",
    unicodeRange:
      "U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C4, U+2113, U+2C60-2C7F, U+A720-A7FF",
  },
  {
    subset: "latin",
    url: `${GSTATIC}DXr4Y3qwzQ.woff2`,
    sha256: "8e38e3fbd74dea20aabe0831ffef04c9f30bf6fc5b99b7a2649be0dd8c6d859c",
    unicodeRange:
      "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD",
  },
] as const;

const fileFor = (subset: string) => `source-serif-4-${subset}-wght-normal.woff2`;

/** The body of each `localFont({...})` call in the layout, in source order. */
function localFontCalls(layout: string): string[] {
  return layout
    .split("localFont({")
    .slice(1)
    .map((chunk) => chunk.slice(0, chunk.indexOf("\n});")));
}

describe("Source Serif 4 keeps every face the Google loader emitted", () => {
  const layout = readFileSync(path.join(root, "src/app/layout.tsx"), "utf8");
  const calls = localFontCalls(layout);

  it("declares one localFont call per Google subset, in Google's order", () => {
    const files = calls.map((call) => {
      const paths = [...call.matchAll(/source-serif-4\/(source-serif-4-[a-z-]+-wght-normal\.woff2)"/g)].map((m) => m[1]);
      expect(new Set(paths).size, "one file per call").toBe(1);
      return paths[0];
    });
    expect(files).toEqual(GOOGLE_FACES.map((face) => fileFor(face.subset)));
  });

  it.each(GOOGLE_FACES.map((face, i) => [face.subset, face, i] as const))(
    "%s: family, weights, style, display, unicode-range and preload match the old face",
    (_subset, face, i) => {
      const call = calls[i] ?? "";
      const weights = [...call.matchAll(/weight: "(\d+)", style: "normal"/g)].map((m) => m[1]);
      expect(weights).toEqual(["400", "500", "600"]);
      expect(call).toContain('display: "swap"');
      expect(call).toContain('{ prop: "font-family", value: "Source Serif 4" }');
      expect(/prop: "unicode-range",\s*value:\s*"([^"]+)"/.exec(call)?.[1]).toBe(face.unicodeRange);
      const isLatin = face.subset === "latin";
      expect(call).toContain(`preload: ${isLatin}`);
      // One "Source Serif 4 Fallback" and one --font-source-serif, both from latin.
      if (isLatin) {
        expect(call).toContain('adjustFontFallback: "Times New Roman"');
        expect(call).toContain('variable: "--font-source-serif"');
      } else {
        expect(call).toContain("adjustFontFallback: false");
        expect(call).not.toContain("variable:");
      }
    },
  );

  it.each(GOOGLE_FACES.map((face) => [face.subset, face] as const))(
    "%s: the committed woff2 is Google's file, recorded in the README with its URL",
    (_subset, face) => {
      const bytes = readFileSync(path.join(fontDir, fileFor(face.subset)));
      expect(bytes.subarray(0, 4).toString("latin1")).toBe("wOF2");
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(face.sha256);
      const readme = readFileSync(path.join(fontDir, "README.md"), "utf8");
      const row = readme.split("\n").find((line) => line.startsWith(`| \`${fileFor(face.subset)}\``));
      expect(row, `${fileFor(face.subset)} has no row in README.md`).toBeDefined();
      expect(row).toContain(face.url);
      expect(row).toContain(face.sha256);
    },
  );

  it("ships no woff2 beyond the six subsets", () => {
    const woff2 = readdirSync(fontDir).filter((f) => f.endsWith(".woff2")).sort();
    expect(woff2).toEqual(GOOGLE_FACES.map((face) => fileFor(face.subset)).sort());
  });
});
