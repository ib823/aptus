# Source Serif 4 (self-hosted)

The display serif behind `font-serif` / `--font-source-serif`. Loaded with
`next/font/local` in `src/app/layout.tsx`, so `next build` never reaches
Google Fonts. Never switch it back to `next/font/google`:
`tests/unit/build/no-google-fonts.test.ts` fails if that import reappears.

| File | What it is | SHA-256 |
| --- | --- | --- |
| `source-serif-4-latin-wght-normal.woff2` | Source Serif 4 roman, variable `wght` 200–900, Latin subset (50,952 bytes) | `8e38e3fbd74dea20aabe0831ffef04c9f30bf6fc5b99b7a2649be0dd8c6d859c` |
| `OFL.txt` | SIL Open Font License 1.1, the licence the font ships under | `5f94c3fd3a23131a417ab5a0c8452de57e70c3cfb9f604d88241f7065ebf9fd9` |

## Source

- **Font file:** Google Fonts' own woff2, the exact file `next/font/google`
  downloaded for the previous `Source_Serif_4({ subsets: ["latin"], weight:
  ["400", "500", "600"] })` call. Requested from
  `https://fonts.googleapis.com/css2?family=Source+Serif+4:wght@400;500;600&display=swap`
  with next/font's own Chrome user agent; Google answered with this one
  variable file for all three weights:
  `https://fonts.gstatic.com/s/sourceserif4/v15/vEFF2_tTDB4M7-auWDN0ahZJW3IX2ih5nk3AucvUHf6kDXr4Y3qwzQ.woff2`
  (Google Fonts API family version `v15`). Its SHA-256 equals the file the last
  Google-loader build emitted (`.next/static/media/597b6a5d799c44de-s.p.woff2`),
  so the bytes the browser renders are unchanged.
- **Font version:** `Version 4.004;hotconv 1.0.116;makeotfexe 2.5.65601`
  (name table), PostScript name `SourceSerif4-Regular`. Upstream project:
  [adobe-fonts/source-serif](https://github.com/adobe-fonts/source-serif).
  Google's file carries only the `wght` axis (no `opsz`), exactly as before.
- **Licence:** `OFL.txt` is Google Fonts' licence file for this family,
  `https://raw.githubusercontent.com/google/fonts/main/ofl/sourceserif4/OFL.txt`.
- Retrieved 2026-10-21.

## Coverage

Latin subset only, declared with Google's `latin` `unicode-range` verbatim. The
Google loader also emitted (but never preloaded) Latin Extended, Cyrillic,
Cyrillic Extended, Greek and Vietnamese faces; characters only those covered
now render in the metric-matched fallback ("Source Serif 4 Fallback" over
Times New Roman), then Georgia. If a heading ever needs them, add that
subset's woff2 from the same CSS response, record it here, and declare it in
`layout.tsx`.

## Updating

Fetch the CSS URL above with a modern-Chrome user agent, download the `latin`
file it lists, replace the woff2 here, and update the table (`sha256sum`). The
unit test checks every file in this folder against the table.
