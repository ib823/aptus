"use client";

/** Client-side sync manager — flushes offline queue when online */

import { getAll, dequeue } from "./sync-queue";
import { SYNC_BATCH_SIZE } from "@/types/pwa";
import type { OfflineSyncItem } from "@/types/pwa";

export interface SyncFlushResult {
  synced: number;
  conflicts: number;
  failed: number;
}

export async function flushSyncQueue(): Promise<SyncFlushResult> {
  const items = await getAll();
  if (items.length === 0) return { synced: 0, conflicts: 0, failed: 0 };

  const result: SyncFlushResult = { synced: 0, conflicts: 0, failed: 0 };

  // Process in batches
  for (let i = 0; i < items.length; i += SYNC_BATCH_SIZE) {
    const batch = items.slice(i, i + SYNC_BATCH_SIZE);
    await processBatch(batch, result);
  }

  return result;
}

async function processBatch(
  batch: OfflineSyncItem[],
  result: SyncFlushResult,
): Promise<void> {
  try {
    const response = await fetch("/api/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: batch }),
    });

    if (!response.ok) {
      result.failed += batch.length;
      return;
    }

    const data = await response.json();
    const results = data.data?.results as
      | Array<{ clientId: string; status: string }>
      | undefined;

    if (!results) {
      result.failed += batch.length;
      return;
    }

    for (const itemResult of results) {
      if (itemResult.status === "synced") {
        await dequeue(itemResult.clientId);
        result.synced++;
      } else if (itemResult.status === "conflict") {
        result.conflicts++;
      } else {
        result.failed++;
      }
    }
  } catch {
    result.failed += batch.length;
  }
}

/** Start auto-sync listener. Returns cleanup function. */
export function startAutoSync(): () => void {
  const handler = () => {
    flushSyncQueue().catch(() => {
      // Silently ignore — will retry on next online event
    });
  };

  window.addEventListener("online", handler);

  // Also flush on initial load if online
  if (navigator.onLine) {
    handler();
  }

  return () => {
    window.removeEventListener("online", handler);
  };
}
