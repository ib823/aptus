import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { Providers } from "@/components/shared/Providers";
import { ServiceWorkerProvider } from "@/components/pwa/ServiceWorkerProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "ABeam",
    template: "%s — ABeam",
  },
  description: "SAP best practices process validation portal",
  manifest: "/manifest.json",
  icons: {
    apple: "/icons/icon-192x192.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "ABeam",
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
    <html lang="en" suppressHydrationWarning className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="antialiased">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground focus:text-sm focus:font-medium"
        >
          Skip to main content
        </a>
        <Providers>
          <ServiceWorkerProvider />
          <TooltipProvider>
            <main id="main-content">{children}</main>
          </TooltipProvider>
          <Toaster />
        </Providers>
      </body>
    </html>
  );
}
