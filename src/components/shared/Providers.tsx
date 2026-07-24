"use client";

import { useEffect, useState } from "react";
import { SessionProvider } from "next-auth/react";
import { ThemeProvider as NextThemeProvider } from "next-themes";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { clearSensitiveClientCaches } from "@/lib/pwa/client-cache";
import type { ReactNode } from "react";

export function Providers({ children, nonce }: { children: ReactNode; nonce?: string }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5 * 60 * 1000,
            gcTime: 30 * 60 * 1000,
            refetchOnWindowFocus: false,
            retry: 3,
          },
        },
      }),
  );

  useEffect(() => {
    void clearSensitiveClientCaches().catch((err) => {
      console.warn("[client-cache] Failed to clear legacy persisted caches", err);
    });
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <NextThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange {...(nonce ? { nonce } : {})}>
          {children}
        </NextThemeProvider>
      </SessionProvider>
    </QueryClientProvider>
  );
}
