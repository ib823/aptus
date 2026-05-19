"use client";

import { del, keys } from "idb-keyval";

const LEGACY_QUERY_CACHE_KEY = "REACT_QUERY_OFFLINE_CACHE";
const OFFLINE_SYNC_PREFIX = "sync:";

async function clearLegacyQueryCache(): Promise<void> {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(LEGACY_QUERY_CACHE_KEY);
  }
  await del(LEGACY_QUERY_CACHE_KEY);
}

async function clearApiResponseCaches(): Promise<void> {
  if (typeof window === "undefined" || !("caches" in window)) {
    return;
  }

  const cacheKeys = await caches.keys();
  await Promise.all(
    cacheKeys
      .filter((key) => key.startsWith("aptus-") && key.endsWith("-api"))
      .map((key) => caches.delete(key)),
  );
}

async function clearOfflineSyncQueue(): Promise<void> {
  const allKeys = await keys<string>();
  await Promise.all(
    allKeys
      .filter((key) => typeof key === "string" && key.startsWith(OFFLINE_SYNC_PREFIX))
      .map((key) => del(key)),
  );
}

export async function clearSensitiveClientCaches(): Promise<void> {
  await Promise.all([
    clearLegacyQueryCache(),
    clearApiResponseCaches(),
  ]);
}

export async function clearClientSessionCaches(): Promise<void> {
  await Promise.all([
    clearSensitiveClientCaches(),
    clearOfflineSyncQueue(),
  ]);
}
