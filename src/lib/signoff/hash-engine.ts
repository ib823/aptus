/** Hash engine for data integrity verification — pure functions */

import { createHash } from "crypto";

/**
 * Sort object keys recursively for canonical JSON representation.
 */
function sortKeys(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(sortKeys);
  if (typeof value === "object") {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = sortKeys((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}

/**
 * Compute a canonical SHA-256 hash of any data.
 * Keys are sorted recursively to ensure deterministic output
 * regardless of property insertion order.
 */
export function computeCanonicalHash(data: unknown): string {
  const sorted = sortKeys(data);
  const canonical = JSON.stringify(sorted) ?? "undefined";
  return createHash("sha256").update(canonical).digest("hex");
}

/**
 * Verify that data matches an expected hash.
 */
export function verifyHash(data: unknown, expectedHash: string): boolean {
  const computedHash = computeCanonicalHash(data);
  return computedHash === expectedHash;
}
