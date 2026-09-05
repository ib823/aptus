/**
 * SAP content release — which SAP Best Practices drop the app grounds on.
 *
 * 2608 WS0 (docs/2608/BUILD-LOG.md). The release is selected by the
 * SAP_CONTENT_RELEASE env var and DEFAULTS TO 2602 until WS7 flips it; 2608
 * becomes selectable the moment its files are landed (sap-references/2608/).
 * Reading it here, in one place, is what lets every SAP-grounded page show
 * the same footer label and every loader stamp the same releaseId.
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
  /** True when the env var selected the release; false when the default applied. */
  fromEnv: boolean;
};

export function isSapContentReleaseCode(value: unknown): value is SapContentReleaseCode {
  return typeof value === "string" && (SAP_CONTENT_RELEASES as readonly string[]).includes(value);
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
    fromEnv,
  };
}

export function getSapContentRelease(): SapContentRelease {
  return resolveSapContentRelease();
}
