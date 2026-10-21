import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import localFont from "next/font/local";
import { TooltipProvider } from "@/components/ui/tooltip";

// Source Serif 4, self-hosted. It used to come from next/font/google, which
// downloads the font from fonts.googleapis.com DURING `next build`; a Google
// hiccup failed CI (E2E Smoke on #308 and #312) and would fail a Vercel
// production build the same way. The committed file is byte-for-byte the woff2
// Google served for that call (variable wght axis, Latin subset), so rendering
// is unchanged. Provenance, version and SHA-256: src/fonts/source-serif-4/
// README.md. tests/unit/build/no-google-fonts.test.ts keeps next/font/google
// from coming back.
//
// The three faces mirror the @font-face rules Google returned for
// weight ["400", "500", "600"]: one variable file declared at each weight.
// (next/font requires literal arguments, hence the repeated path.)
const sourceSerif = localFont({
  src: [
    { path: "../fonts/source-serif-4/source-serif-4-latin-wght-normal.woff2", weight: "400", style: "normal" },
    { path: "../fonts/source-serif-4/source-serif-4-latin-wght-normal.woff2", weight: "500", style: "normal" },
    { path: "../fonts/source-serif-4/source-serif-4-latin-wght-normal.woff2", weight: "600", style: "normal" },
  ],
  variable: "--font-source-serif",
  display: "swap",
  preload: true,
  // The metric-matched fallback next/font/google generated ("Source Serif 4
  // Fallback" over local Times New Roman), so swap-in does not shift layout.
  // next/font/local measures the file itself (size-adjust 118.46%) where the
  // Google loader used precomputed metrics (117.91%); it only shows before
  // the woff2 arrives.
  adjustFontFallback: "Times New Roman",
  declarations: [
    // Keep the real family name rather than next/font/local's default (the
    // variable name): coreedge-tokens.css names "Source Serif 4" directly.
    { prop: "font-family", value: "Source Serif 4" },
    // Google's `latin` unicode-range, verbatim, so the face covers exactly
    // the code points it did before.
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
