/**
 * Organization type — ONE vocabulary, and a parser that can fail.
 *
 * THE STATE THIS REPLACES. There were two spellings of the same idea and two
 * columns holding them:
 *
 *   · `Organization.type`    — no default, written as "PARTNER" by signup,
 *                              "partner" by the test-login path, "client" by
 *                              `ensureOrganization`
 *   · `Organization.orgType` — defaults to "client", validated by a zod enum on
 *                              PATCH /api/organizations/[orgId]
 *
 * Different screens read different columns. The admin organization list badges
 * `type`; the organization settings page prints `orgType`. Nothing keeps them
 * equal, so one organization can legitimately display as two different types
 * depending on which screen you are on.
 *
 * AND IT IS NOT COSMETIC. `admin/organizations/[orgId]` passes `organization.type`
 * into a prop named `orgType`, which reaches `getRolesForOrgType` and decides
 * WHICH ROLES MAY BE INVITED OR ASSIGNED. The less-governed of the two columns
 * is the one governing role assignment.
 *
 * WHY THE OLD PARSER COULD NOT CATCH ANY OF THIS. It ended
 * `return upper as CanonicalOrgType` — a cast, not a check. Every one of the
 * four values in use today happens to survive it, so it works; anything else —
 * a new org type, a stray space, a value copied from the other column's
 * vocabulary — becomes a canonical type that does not exist. `getRolesForOrgType`
 * then filters against it, matches nothing, and returns []. The invite dialog
 * renders with no roles at all, which reads as "this organization cannot have
 * users" rather than "we did not recognise this organization type".
 *
 * So the parser returns null now and the callers say which of the two happened.
 * Failing closed is right; failing closed silently is what this file is for.
 *
 * CANONICAL IS LOWERCASE. It matches `OrgType` in types/assessment, the
 * `orgType` column default, and the zod enum the update API already validates
 * against — three things that already agreed. `DIRECT_CLIENT` survives only as
 * the role-metadata spelling, mapped explicitly rather than derived by casing.
 */

import type { OrgType } from "@/types/assessment";

/** The stored vocabulary. Canonical everywhere except role metadata. */
export const ORG_TYPES: readonly OrgType[] = ["platform", "partner", "client"] as const;

/** The role-metadata vocabulary. Kept because `ROLE_METADATA` is keyed on it. */
export type CanonicalOrgType = "PLATFORM" | "PARTNER" | "DIRECT_CLIENT";

/**
 * Every spelling observed in the database or written by a code path, mapped to
 * the canonical value.
 *
 * Listed rather than computed by uppercasing, because the mapping is not a case
 * transform: "client" is "DIRECT_CLIENT" on the other side. A table makes the
 * exceptions visible; a transform hides them until one stops holding.
 */
const ALIASES: Record<string, OrgType> = {
  platform: "platform",
  partner: "partner",
  client: "client",
  direct_client: "client",
};

/**
 * Parse a stored value into the canonical vocabulary. Null when unrecognised.
 *
 * Trims and lowercases first, so trailing whitespace out of a CSV import or a
 * hand-edited row does not read as a new organization type.
 */
export function parseOrgType(raw: string | null | undefined): OrgType | null {
  if (!raw) return null;
  return ALIASES[raw.trim().toLowerCase()] ?? null;
}

const TO_CANONICAL: Record<OrgType, CanonicalOrgType> = {
  platform: "PLATFORM",
  partner: "PARTNER",
  client: "DIRECT_CLIENT",
};

/**
 * The role-metadata spelling for a stored value. Null when unrecognised.
 *
 * Callers MUST handle the null. It means "this organization's type is not one
 * the platform knows", which is a different thing from "this organization type
 * has no roles" — and only the caller can say which of those the user should be
 * told.
 */
export function normalizeOrgType(raw: string | null | undefined): CanonicalOrgType | null {
  const parsed = parseOrgType(raw);
  return parsed ? TO_CANONICAL[parsed] : null;
}

/** Human-readable labels, keyed on the role-metadata spelling. */
export const ORG_TYPE_LABELS: Record<CanonicalOrgType, string> = {
  PLATFORM: "Platform",
  PARTNER: "Partner",
  DIRECT_CLIENT: "Direct Client",
};

/** Badge color classes for org types. */
export const ORG_TYPE_COLORS: Record<CanonicalOrgType, string> = {
  PLATFORM: "bg-purple-100 text-purple-800",
  PARTNER: "bg-blue-100 text-blue-800",
  DIRECT_CLIENT: "bg-green-100 text-green-800",
};

/**
 * Label for a raw stored value.
 *
 * An unrecognised value is shown VERBATIM rather than mapped to a plausible
 * label. Someone looking at an organization whose type the platform does not
 * understand needs to see the actual string to fix it.
 */
export function getOrgTypeLabel(raw: string | null | undefined): string {
  const canonical = normalizeOrgType(raw);
  return canonical ? ORG_TYPE_LABELS[canonical] : (raw?.trim() || "Unknown");
}

/** Badge color for a raw stored value; neutral when unrecognised. */
export function getOrgTypeColor(raw: string | null | undefined): string {
  const canonical = normalizeOrgType(raw);
  return canonical ? ORG_TYPE_COLORS[canonical] : "bg-slate-50 text-slate-500";
}
