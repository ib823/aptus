# Source Serif 4 (self-hosted)

The display serif behind `font-serif` / `--font-source-serif`. Loaded with
`next/font/local` in `src/app/layout.tsx`, so `next build` never reaches
Google Fonts. Never switch it back to `next/font/google`:
`tests/unit/build/no-google-fonts.test.ts` fails if that import reappears.

Six woff2 files, one per Google Fonts subset. Each is Source Serif 4 roman,
variable `wght` 200–900, cut to that subset's code points.

| File | Subset | Source URL | SHA-256 |
| --- | --- | --- | --- |
| `source-serif-4-latin-wght-normal.woff2` | `latin` (50,952 bytes, preloaded) | `https://fonts.gstatic.com/s/sourceserif4/v15/vEFF2_tTDB4M7-auWDN0ahZJW3IX2ih5nk3AucvUHf6kDXr4Y3qwzQ.woff2` | `8e38e3fbd74dea20aabe0831ffef04c9f30bf6fc5b99b7a2649be0dd8c6d859c` |
| `source-serif-4-latin-ext-wght-normal.woff2` | `latin-ext` (42,040 bytes) | `https://fonts.gstatic.com/s/sourceserif4/v15/vEFF2_tTDB4M7-auWDN0ahZJW3IX2ih5nk3AucvUHf6kA3r4Y3qwzSEi.woff2` | `231f594ad829d45f905a8a6cdce704f659615e00f1a9db2699320e6e315c1d1f` |
| `source-serif-4-vietnamese-wght-normal.woff2` | `vietnamese` (13,400 bytes) | `https://fonts.gstatic.com/s/sourceserif4/v15/vEFF2_tTDB4M7-auWDN0ahZJW3IX2ih5nk3AucvUHf6kAnr4Y3qwzSEi.woff2` | `752875b4c33f07a3dda7c8f0be846fef059cb0f4e85211b855aa93dd85d45a22` |
| `source-serif-4-greek-wght-normal.woff2` | `greek` (20,164 bytes) | `https://fonts.gstatic.com/s/sourceserif4/v15/vEFF2_tTDB4M7-auWDN0ahZJW3IX2ih5nk3AucvUHf6kDnr4Y3qwzSEi.woff2` | `303d60869ffd404c141fa90d87ba574cd26ade348dd4659ea4b9caeadf72c183` |
| `source-serif-4-cyrillic-wght-normal.woff2` | `cyrillic` (36,628 bytes) | `https://fonts.gstatic.com/s/sourceserif4/v15/vEFF2_tTDB4M7-auWDN0ahZJW3IX2ih5nk3AucvUHf6kCXr4Y3qwzSEi.woff2` | `7683b72ed39c9fc64c626ae0ed611e7dc0121af71cde73fd060bd7a4a83c0d7c` |
| `source-serif-4-cyrillic-ext-wght-normal.woff2` | `cyrillic-ext` (18,036 bytes) | `https://fonts.gstatic.com/s/sourceserif4/v15/vEFF2_tTDB4M7-auWDN0ahZJW3IX2ih5nk3AucvUHf6kAHr4Y3qwzSEi.woff2` | `4d72739b0e43d64e6b2a086a66f62df1ef90f34d6f109b279c557a64eae5d23d` |
| `OFL.txt` | SIL Open Font License 1.1, the licence the font ships under | `https://raw.githubusercontent.com/google/fonts/main/ofl/sourceserif4/OFL.txt` | `5f94c3fd3a23131a417ab5a0c8452de57e70c3cfb9f604d88241f7065ebf9fd9` |

All rows retrieved 2026-10-21.

## Source

- **Font files:** Google Fonts' own woff2 files, the exact files
  `next/font/google` downloaded for the previous `Source_Serif_4({ subsets:
  ["latin"], weight: ["400", "500", "600"] })` call. Requested from
  `https://fonts.googleapis.com/css2?family=Source+Serif+4:wght@400;500;600&display=swap`
  with next/font's own user agent (`Mozilla/5.0 (Macintosh; Intel Mac OS X
  10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/104.0.0.0
  Safari/537.36`); Google answered with 18 `@font-face` rules, six subsets ×
  three weights, one variable file per subset shared by all three weights
  (Google Fonts API family version `v15`). Each file's SHA-256 equals the file
  the last Google-loader build emitted into `.next/static/media/`, so the bytes
  the browser renders are unchanged.
- **Font version:** `Version 4.004;hotconv 1.0.116;makeotfexe 2.5.65601`
  (name table), PostScript name `SourceSerif4-Regular`. Upstream project:
  [adobe-fonts/source-serif](https://github.com/adobe-fonts/source-serif).
  Google's files carry only the `wght` axis (no `opsz`), exactly as before.
- **Licence:** `OFL.txt` is Google Fonts' licence file for this family.

## Coverage

The same 18 faces the Google loader emitted: family `Source Serif 4`, weights
400, 500 and 600, style normal, `font-display: swap`, each subset declared with
Google's `unicode-range` verbatim (`layout.tsx`, pinned by the unit test).
Only `latin` is preloaded, as before; the browser downloads another subset's
file only when a page draws a character in its range (Ł ő ā ș, Tiếng Việt,
Cyrillic, Greek). The faces are declared in Google's order with `latin` last,
so where ranges overlap (U+0301, U+0304, U+0308, U+0329) the same file wins as
before.

## Updating

Fetch the CSS URL above with the user agent above, download every file it
lists (one per subset), replace the woff2 files here, and update the table
(`sha256sum`) and the ranges in `layout.tsx` if Google changed them. The unit
test checks every file in this folder against the table, and the table and
`layout.tsx` against each other.
