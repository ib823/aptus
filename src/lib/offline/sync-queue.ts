"use client";

/** Client-side offline sync queue backed by IndexedDB via idb-keyval */

import { get, set, del, keys } from "idb-keyval";
import type { OfflineSyncItem, SyncAction } from "@/types/pwa";
import { SYNC_QUEUE_MAX } from "@/types/pwa";

const QUEUE_PREFIX = "sync:";

function itemKey(clientId: string): string {
  return `${QUEUE_PREFIX}${clientId}`;
}

export async function enqueue(
  action: SyncAction,
  assessmentId: string,
  payload: Record<string, unknown>,
): Promise<OfflineSyncItem> {
  const clientId = crypto.randomUUID();
  const item: OfflineSyncItem = {
    clientId,
    action,
    assessmentId,
    payload,
    queuedAt: new Date().toISOString(),
  };

  // Enforce queue max
  const allKeys = await getQueueKeys();
  if (allKeys.length >= SYNC_QUEUE_MAX) {
    throw new Error("Offline sync queue is full");
  }

  await set(itemKey(clientId), item);
  return item;
}

export async function dequeue(clientId: string): Promise<void> {
  await del(itemKey(clientId));
}

export async function getAll(): Promise<OfflineSyncItem[]> {
  const allKeys = await getQueueKeys();
  const items: OfflineSyncItem[] = [];

  for (const key of allKeys) {
    const item = await get<OfflineSyncItem>(key);
    if (item) items.push(item);
  }

  // Sort oldest first for FIFO processing
  return items.sort(
    (a, b) => new Date(a.queuedAt).getTime() - new Date(b.queuedAt).getTime(),
  );
}

export async function getPendingCount(): Promise<number> {
  const allKeys = await getQueueKeys();
  return allKeys.length;
}

export async function clear(): Promise<void> {
  const allKeys = await getQueueKeys();
  for (const key of allKeys) {
    await del(key);
  }
}

async function getQueueKeys(): Promise<string[]> {
  const allKeys = await keys<string>();
  return allKeys.filter((k) => typeof k === "string" && k.startsWith(QUEUE_PREFIX));
}
