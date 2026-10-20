/**
 * GET /api/northbound/versions — the consumer changelog, machine-readable.
 *
 * Which dated versions of the northbound API exist, which this deployment
 * serves, which one an unpinned request gets, and when each is deprecated or
 * sunset. The human-readable copy is docs/coreedge/api-changelog.md; both are
 * built from version-policy.ts, and a unit test fails when the document
 * drifts from the registry.
 *
 * NO CREDENTIAL. What versions exist is public, it is what a client needs to
 * read BEFORE it has a working call (an UNSUPPORTED_VERSION refusal points
 * here), and it reads nothing but constants: no database, no SAP, no audit
 * row. The edge still limits it like any other call on this path.
 */

import { newCorrelationId, northboundOk } from "@/lib/northbound/respond";
import {
  defaultVersion,
  MINIMUM_OVERLAP_MONTHS,
  NORTHBOUND_API_VERSIONS,
  supportedVersions,
  UNVERSIONED_BASE_PATH,
  V1_BASE_PATH,
  VERSION_HEADER,
  versionStatus,
} from "@/lib/northbound/version-policy";
import { withNorthboundVersion } from "@/lib/northbound/versioned-route";

export const dynamic = "force-dynamic";

/** Served like every northbound route: versioned, at both base paths. */
export const GET = withNorthboundVersion(listVersions);

async function listVersions() {
  const now = new Date();
  return northboundOk(
    {
      header: VERSION_HEADER,
      defaultVersion: defaultVersion(now)?.version ?? null,
      supportedVersions: supportedVersions(now).map((v) => v.version),
      basePaths: [V1_BASE_PATH, UNVERSIONED_BASE_PATH],
      policy: {
        minimumOverlapMonths: MINIMUM_OVERLAP_MONTHS,
        unpinned: "A request without the header is served the oldest supported version.",
        breakingChanges:
          "Ship only as a new dated version. The version it replaces is served for at least the minimum overlap after the new one is released and after its deprecation is announced, with Deprecation (RFC 9745) and Sunset (RFC 8594) headers on every response it serves.",
      },
      // Newest first, as a changelog reads.
      versions: [...NORTHBOUND_API_VERSIONS].reverse().map((v) => ({
        version: v.version,
        status: versionStatus(v, now),
        releasedOn: v.releasedOn,
        deprecatedOn: v.deprecatedOn,
        sunsetOn: v.sunsetOn,
        summary: v.summary,
        changes: v.changes,
      })),
    },
    newCorrelationId(),
  );
}
