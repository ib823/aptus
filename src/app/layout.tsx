import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { Providers } from "@/components/shared/Providers";
import { ServiceWorkerProvider } from "@/components/pwa/ServiceWorkerProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "aptus",
  description: "SAP S/4HANA Cloud best practices process validation portal",
  manifest: "/manifest.json",
  themeColor: "#09090b",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Aptus",
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
        <Providers>
          <ServiceWorkerProvider />
          <TooltipProvider>{children}</TooltipProvider>
          <Toaster />
        </Providers>
      </body>
    </html>
  );
}
