"use client";

import { useState, useEffect } from "react";
import { SessionProvider } from "next-auth/react";
import { ThemeProvider as NextThemeProvider } from "next-themes";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { get, set, del } from "idb-keyval";
import type { ReactNode } from "react";

/**
 * Custom IndexedDB persister for TanStack Query
 */
const idbPersister = createSyncStoragePersister({
  storage: {
    getItem: async (key) => await get(key),
    setItem: async (key, value) => await set(key, value),
    removeItem: async (key) => await del(key),
  } as any,
});

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5 * 60 * 1000,
            gcTime: 1000 * 60 * 60 * 24, // 24 hours
            refetchOnWindowFocus: false,
            retry: 3,
          },
        },
      }),
  );

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{ 
        persister: idbPersister,
        maxAge: 1000 * 60 * 60 * 24, // Persist for 24 hours
      }}
    >
      <SessionProvider>
        <NextThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
          {children}
        </NextThemeProvider>
      </SessionProvider>
    </PersistQueryClientProvider>
  );
}
