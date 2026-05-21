import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Source_Serif_4 } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";

const sourceSerif = Source_Serif_4({
  subsets: ["latin"],
  variable: "--font-source-serif",
  display: "swap",
  weight: ["400", "500", "600"],
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
    process.env.NEXT_PUBLIC_APP_URL ?? "https://aptus-sandy.vercel.app",
  ),
  title: {
    default: "Aptus",
    template: "%s — Aptus",
  },
  description: "SAP best practices process validation portal",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Aptus",
  },
  openGraph: {
    title: "Aptus",
    description: "SAP best practices process validation portal",
    siteName: "Aptus",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "Aptus",
    description: "SAP best practices process validation portal",
  },
  other: {
    "theme-color": "#f8fafc",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
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
        <Providers>
          <ServiceWorkerProvider />
          <TooltipProvider>
            <div id="main-content">{children}</div>
          </TooltipProvider>
          <Toaster />
        </Providers>
      </body>
    </html>
  );
}
