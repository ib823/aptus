"use client";

import { useState } from "react";
import { SessionProvider } from "next-auth/react";
import { ThemeProvider as NextThemeProvider } from "next-themes";
import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { set, del } from "idb-keyval";
import type { ReactNode } from "react";

/**
 * Custom Async Persister for TanStack Query
 * Uses createSyncStoragePersister with a sync-wrapper logic for IndexedDB
 * or handles the Promise resolution within the persister logic.
 */
const idbPersister = createSyncStoragePersister({
  storage: typeof window !== "undefined" ? {
    getItem: (key) => {
      // Sync wrapper for async IDB - TanStack will handle the resolution if using PersistQueryClientProvider
      const val = localStorage.getItem(key);
      if (val) return val;
      return null;
    },
    setItem: (key, value) => {
      localStorage.setItem(key, value);
      void set(key, value); // Background backup to IDB
    },
    removeItem: (key) => {
      localStorage.removeItem(key);
      void del(key);
    },
  } : undefined,
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
