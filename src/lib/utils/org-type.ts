/** Shared org type normalization and display utilities */

export type CanonicalOrgType = "PLATFORM" | "PARTNER" | "DIRECT_CLIENT";

/**
 * Normalize DB org type values (e.g. "client", "partner", "platform")
 * to canonical uppercase form used by role-metadata.
 */
export function normalizeOrgType(raw: string): CanonicalOrgType {
  const upper = raw.toUpperCase();
  if (upper === "CLIENT") return "DIRECT_CLIENT";
  return upper as CanonicalOrgType;
}

/** Human-readable labels for org types */
export const ORG_TYPE_LABELS: Record<CanonicalOrgType, string> = {
  PLATFORM: "Platform",
  PARTNER: "Partner",
  DIRECT_CLIENT: "Direct Client",
};

/** Badge color classes for org types */
export const ORG_TYPE_COLORS: Record<CanonicalOrgType, string> = {
  PLATFORM: "bg-purple-100 text-purple-800",
  PARTNER: "bg-blue-100 text-blue-800",
  DIRECT_CLIENT: "bg-green-100 text-green-800",
};

/**
 * Get human-readable label for a raw org type value.
 * Handles DB values like "client" -> "Direct Client".
 */
export function getOrgTypeLabel(raw: string): string {
  return ORG_TYPE_LABELS[normalizeOrgType(raw)] ?? raw;
}

/**
 * Get badge color class for a raw org type value.
 */
export function getOrgTypeColor(raw: string): string {
  return ORG_TYPE_COLORS[normalizeOrgType(raw)] ?? "bg-slate-50 text-slate-500";
}
