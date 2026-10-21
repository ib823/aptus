import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import localFont from "next/font/local";
import { TooltipProvider } from "@/components/ui/tooltip";

// Source Serif 4, self-hosted. It used to come from next/font/google, which
// downloads the font from fonts.googleapis.com DURING `next build`; a Google
// hiccup failed CI (E2E Smoke on #308 and #312) and would fail a Vercel
// production build the same way. The committed files are byte-for-byte the
// woff2 files Google served for that call (variable wght axis, one file per
// subset), so rendering is unchanged. Provenance, version and SHA-256:
// src/fonts/source-serif-4/README.md. tests/unit/build/no-google-fonts.test.ts
// keeps next/font/google from coming back and pins every face below.
//
// The Google loader emitted Google's full css2 response for weight
// ["400", "500", "600"]: six subsets x three weights = 18 @font-face rules, all
// family "Source Serif 4", each subset with its own unicode-range, only the
// `latin` files preloaded. The browser fetches a non-latin file only when a
// page draws a character in its range. next/font/local takes one unicode-range
// per call, so each subset is its own call; `declarations` keeps the family
// name "Source Serif 4" (coreedge-tokens.css names it directly) on all of them,
// which merges the six into one family. The calls follow Google's order, with
// latin last: where ranges overlap (U+0301, U+0304, U+0308, U+0329) the face
// declared last wins, so each such code point comes from the same file as
// before. (next/font requires literal arguments, hence the repetition.)
//
// Only the latin call sets the variable, the preload and the metric-matched
// fallback ("Source Serif 4 Fallback" over local Times New Roman, so swap-in
// does not shift layout). next/font/local measures the file itself (size-adjust
// 118.46%) where the Google loader used precomputed metrics (117.91%); it only
// shows before the woff2 arrives. The other five bindings are unused on
// purpose: each call's only job is to emit its @font-face rules.
const _sourceSerifCyrillicExt = localFont({
  src: [
    { path: "../fonts/source-serif-4/source-serif-4-cyrillic-ext-wght-normal.woff2", weight: "400", style: "normal" },
    { path: "../fonts/source-serif-4/source-serif-4-cyrillic-ext-wght-normal.woff2", weight: "500", style: "normal" },
    { path: "../fonts/source-serif-4/source-serif-4-cyrillic-ext-wght-normal.woff2", weight: "600", style: "normal" },
  ],
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  declarations: [
    { prop: "font-family", value: "Source Serif 4" },
    { prop: "unicode-range", value: "U+0460-052F, U+1C80-1C8A, U+20B4, U+2DE0-2DFF, U+A640-A69F, U+FE2E-FE2F" },
  ],
});
const _sourceSerifCyrillic = localFont({
  src: [
    { path: "../fonts/source-serif-4/source-serif-4-cyrillic-wght-normal.woff2", weight: "400", style: "normal" },
    { path: "../fonts/source-serif-4/source-serif-4-cyrillic-wght-normal.woff2", weight: "500", style: "normal" },
    { path: "../fonts/source-serif-4/source-serif-4-cyrillic-wght-normal.woff2", weight: "600", style: "normal" },
  ],
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  declarations: [
    { prop: "font-family", value: "Source Serif 4" },
    { prop: "unicode-range", value: "U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116" },
  ],
});
const _sourceSerifGreek = localFont({
  src: [
    { path: "../fonts/source-serif-4/source-serif-4-greek-wght-normal.woff2", weight: "400", style: "normal" },
    { path: "../fonts/source-serif-4/source-serif-4-greek-wght-normal.woff2", weight: "500", style: "normal" },
    { path: "../fonts/source-serif-4/source-serif-4-greek-wght-normal.woff2", weight: "600", style: "normal" },
  ],
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  declarations: [
    { prop: "font-family", value: "Source Serif 4" },
    {
      prop: "unicode-range",
      value: "U+0370-0377, U+037A-037F, U+0384-038A, U+038C, U+038E-03A1, U+03A3-03FF",
    },
  ],
});
const _sourceSerifVietnamese = localFont({
  src: [
    { path: "../fonts/source-serif-4/source-serif-4-vietnamese-wght-normal.woff2", weight: "400", style: "normal" },
    { path: "../fonts/source-serif-4/source-serif-4-vietnamese-wght-normal.woff2", weight: "500", style: "normal" },
    { path: "../fonts/source-serif-4/source-serif-4-vietnamese-wght-normal.woff2", weight: "600", style: "normal" },
  ],
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  declarations: [
    { prop: "font-family", value: "Source Serif 4" },
    {
      prop: "unicode-range",
      value:
        "U+0102-0103, U+0110-0111, U+0128-0129, U+0168-0169, U+01A0-01A1, U+01AF-01B0, U+0300-0301, U+0303-0304, U+0308-0309, U+0323, U+0329, U+1EA0-1EF9, U+20AB",
    },
  ],
});
const _sourceSerifLatinExt = localFont({
  src: [
    { path: "../fonts/source-serif-4/source-serif-4-latin-ext-wght-normal.woff2", weight: "400", style: "normal" },
    { path: "../fonts/source-serif-4/source-serif-4-latin-ext-wght-normal.woff2", weight: "500", style: "normal" },
    { path: "../fonts/source-serif-4/source-serif-4-latin-ext-wght-normal.woff2", weight: "600", style: "normal" },
  ],
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  declarations: [
    { prop: "font-family", value: "Source Serif 4" },
    {
      prop: "unicode-range",
      value:
        "U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C4, U+2113, U+2C60-2C7F, U+A720-A7FF",
    },
  ],
});
const sourceSerif = localFont({
  src: [
    { path: "../fonts/source-serif-4/source-serif-4-latin-wght-normal.woff2", weight: "400", style: "normal" },
    { path: "../fonts/source-serif-4/source-serif-4-latin-wght-normal.woff2", weight: "500", style: "normal" },
    { path: "../fonts/source-serif-4/source-serif-4-latin-wght-normal.woff2", weight: "600", style: "normal" },
  ],
  variable: "--font-source-serif",
  display: "swap",
  preload: true,
  adjustFontFallback: "Times New Roman",
  declarations: [
    { prop: "font-family", value: "Source Serif 4" },
    {
      prop: "unicode-range",
      value:
        "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD",
    },
  ],
});
import { Toaster } from "@/components/ui/sonner";
import { Providers } from "@/components/shared/Providers";
import { ServiceWorkerProvider } from "@/components/pwa/ServiceWorkerProvider";
import "./globals.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  themeColor: "#f8fafc",
};

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL ?? "https://ab-workbench.vercel.app",
  ),
  title: {
    default: "ABeam Workbench",
    template: "%s — ABeam Workbench",
  },
  description:
    "ABeam's pre-onboarding Fit-to-Standard workbench. Authored Tier 1 decisions, signed and audited, ready to drive Explore.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "ABeam Workbench",
  },
  openGraph: {
    title: "ABeam Workbench",
    description:
      "ABeam's pre-onboarding Fit-to-Standard workbench. Authored Tier 1 decisions, signed and audited, ready to drive Explore.",
    siteName: "ABeam Workbench",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "ABeam Workbench",
    description:
      "ABeam's pre-onboarding Fit-to-Standard workbench. Authored Tier 1 decisions, signed and audited, ready to drive Explore.",
  },
  other: {
    "theme-color": "#f8fafc",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // CSP nonce set by middleware; forwarded to next-themes' inline script.
  const nonce = (await headers()).get("x-nonce");
  return (
    <html lang="en" suppressHydrationWarning className={`${GeistSans.variable} ${GeistMono.variable} ${sourceSerif.variable}`}>
      <head />
      <body className="antialiased" suppressHydrationWarning>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground focus:text-sm focus:font-medium"
        >
          Skip to main content
        </a>
        <Providers {...(nonce ? { nonce } : {})}>
          <ServiceWorkerProvider />
          <TooltipProvider>
            {/* tabIndex={-1} so the skip link's target can actually RECEIVE
                focus. Without it the browser scrolls but leaves focus on the
                link, so the next Tab lands back in the header — the skip did
                nothing for the keyboard user it exists for. */}
            <div id="main-content" tabIndex={-1}>
              {children}
            </div>
          </TooltipProvider>
          <Toaster />
        </Providers>
      </body>
    </html>
  );
}
