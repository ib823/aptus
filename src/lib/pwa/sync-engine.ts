/** Offline sync engine utilities (Phase 27) */

import type { SyncAction, OfflineSyncItem } from "@/types/pwa";

const VALID_ACTIONS: SyncAction[] = ["classify_step", "add_note", "create_gap", "update_scope"];

/**
 * Validate an unknown value as a valid OfflineSyncItem.
 */
export function validateSyncItem(item: unknown): { valid: boolean; error?: string | undefined } {
  if (item === null || item === undefined || typeof item !== "object") {
    return { valid: false, error: "Item must be a non-null object" };
  }

  const obj = item as Record<string, unknown>;

  if (typeof obj.clientId !== "string" || obj.clientId.length === 0) {
    return { valid: false, error: "clientId must be a non-empty string" };
  }

  if (typeof obj.action !== "string" || !VALID_ACTIONS.includes(obj.action as SyncAction)) {
    return { valid: false, error: `action must be one of: ${VALID_ACTIONS.join(", ")}` };
  }

  if (typeof obj.assessmentId !== "string" || obj.assessmentId.length === 0) {
    return { valid: false, error: "assessmentId must be a non-empty string" };
  }

  if (obj.payload === null || obj.payload === undefined || typeof obj.payload !== "object" || Array.isArray(obj.payload)) {
    return { valid: false, error: "payload must be a non-null object" };
  }

  if (typeof obj.queuedAt !== "string" || obj.queuedAt.length === 0) {
    return { valid: false, error: "queuedAt must be a non-empty string" };
  }

  return { valid: true };
}

/**
 * Detect a conflict: returns true if the server version is newer than the client queued time.
 */
export function detectConflict(serverUpdatedAt: Date | null, clientQueuedAt: string): boolean {
  if (!serverUpdatedAt) return false;
  const clientTime = new Date(clientQueuedAt).getTime();
  return serverUpdatedAt.getTime() > clientTime;
}

/**
 * Categorize an array of sync results by status.
 */
export function categorizeSyncResults(
  results: Array<{ clientId: string; status: string }>,
): { synced: string[]; conflicts: string[]; failed: string[] } {
  const synced: string[] = [];
  const conflicts: string[] = [];
  const failed: string[] = [];

  for (const result of results) {
    switch (result.status) {
      case "synced":
        synced.push(result.clientId);
        break;
      case "conflict":
        conflicts.push(result.clientId);
        break;
      default:
        failed.push(result.clientId);
        break;
    }
  }

  return { synced, conflicts, failed };
}

/**
 * Determine whether a sync operation should be retried.
 */
export function shouldRetry(retryCount: number, maxRetries?: number | undefined): boolean {
  const limit = maxRetries ?? 3;
  return retryCount < limit;
}

/** Type guard for OfflineSyncItem */
export function isOfflineSyncItem(item: unknown): item is OfflineSyncItem {
  return validateSyncItem(item).valid;
}
