/**
 * SAP content release — which SAP Best Practices drop the app grounds on.
 *
 * 2608 WS0/WS7 (docs/2608/BUILD-LOG.md). The release is selected by the
 * SAP_CONTENT_RELEASE env var and DEFAULTS TO APP_CONFIG.sapVersion, which
 * WS7 moved from 2602 to 2608. 2602 remains selectable by env for an
 * engagement that has not moved, and an assessment pinned to a catalogue
 * version keeps that version whatever the flag says (AD-3).
 * Reading it here, in one place, is what lets every SAP-grounded page show
 * the same footer label and every loader stamp the same releaseId.
 *
 * THE DEFAULT IS ONLY SAFE WHERE THE CONTENT IS LANDED. A release with no
 * rows scopes every catalogue read to nothing rather than falling back — an
 * empty scope picker, not a 2602 one. scripts/assert-content-release-landed.ts
 * runs in `vercel-build` so that misconfiguration fails the deploy instead of
 * reaching a user.
 *
 * Runtime-safe: no fs, no Prisma. File locations per release live in
 * scripts/lib/sap-content-sources.ts (Node-only).
 */

import { APP_CONFIG } from "@/constants/config";

export const SAP_CONTENT_RELEASES = ["2602", "2608"] as const;
export type SapContentReleaseCode = (typeof SAP_CONTENT_RELEASES)[number];

/** The localisation every landed drop is cut for. */
export const SAP_CONTENT_LOCALISATION = "MY" as const;

export const SAP_CONTENT_RELEASE_ENV = "SAP_CONTENT_RELEASE";

export type SapContentRelease = {
  release: SapContentReleaseCode;
  localisation: typeof SAP_CONTENT_LOCALISATION;
  /** "SAP content release 2608 · MY" — the footer string, verbatim. */
  label: string;
  /** "SAP Cloud ERP (SAP S/4HANA Cloud Public Edition) · content release 2608" — first-mention product label. */
  productLabel: string;
  /** True when the env var selected the release; false when the default applied. */
  fromEnv: boolean;
};

export function isSapContentReleaseCode(value: unknown): value is SapContentReleaseCode {
  return typeof value === "string" && (SAP_CONTENT_RELEASES as readonly string[]).includes(value);
}

/** SAP's marketing name and the technical/contractual name it still carries in catalogue rows. */
export const SAP_PRODUCT_MARKETING_NAME = "SAP Cloud ERP";
export const SAP_PRODUCT_TECHNICAL_NAME = "SAP S/4HANA Cloud Public Edition";

/**
 * "SAP Cloud ERP (SAP S/4HANA Cloud Public Edition) · content release 2608" —
 * the first-mention product label (CCC PR-4.4 / WS7.2). Technical names in
 * catalogue rows are never rewritten.
 */
export function formatSapProductReleaseLabel(release: string): string {
  return `${SAP_PRODUCT_MARKETING_NAME} (${SAP_PRODUCT_TECHNICAL_NAME}) · content release ${release}`;
}

export function formatSapContentReleaseLabel(release: string, localisation: string = SAP_CONTENT_LOCALISATION): string {
  return `SAP content release ${release} · ${localisation}`;
}

/**
 * Resolve the active release. An unknown value in the env var is NOT silently
 * accepted — the default (2602) applies and the caller can see `fromEnv: false`.
 */
export type EnvLike = Record<string, string | undefined>;

export function resolveSapContentRelease(env: EnvLike = process.env): SapContentRelease {
  const raw = env[SAP_CONTENT_RELEASE_ENV]?.trim();
  const fromEnv = isSapContentReleaseCode(raw);
  const release: SapContentReleaseCode = fromEnv ? raw : APP_CONFIG.sapVersion;
  return {
    release,
    localisation: SAP_CONTENT_LOCALISATION,
    label: formatSapContentReleaseLabel(release),
    productLabel: formatSapProductReleaseLabel(release),
    fromEnv,
  };
}

export function getSapContentRelease(): SapContentRelease {
  return resolveSapContentRelease();
}
