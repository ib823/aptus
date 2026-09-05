/**
 * GET /api/ops/catalogue-health — how current is the SAP catalogue this
 * deployment is serving from?
 *
 * BUILT PER FRESHNESS-RESPEC.md, which refused the original org-scoped spec:
 * `SapHubContent` has no organization column and probes are keyed by tenant,
 * so an org-scoped freshness view would return empty for every organization
 * while appearing to work. This endpoint is the respecified version —
 * DEPLOYMENT-SCOPED, once, for everyone, and gated to `platform_admin` alone
 * (via requireAdmin): deployment-wide catalogue provenance is not an
 * operations-of-my-tenant question, and putting it behind the tenant-scoped
 * guard would be the third time this table's scope was confused for a tenant's.
 *
 * EVERY NUMBER IS A REAL COLUMN. Counts, oldest/newest `updatedAt` and the
 * grouped `itemCount` sums come from the table; the latest provenance is read
 * off the newest row's own rawMetadataJson, which the importers stamp; the
 * drift reference is the published-counts constant and the committed
 * hub-artifact-counts drop, each carrying its own harvest provenance. Nothing
 * here is fetched from api.sap.com — refresh stays file-based (ToU).
 */

import { NextResponse } from "next/server";

import { isAdminError, requireAdmin } from "@/lib/auth/admin-guard";
import { prisma } from "@/lib/db/prisma";
import {
  CATALOGUE_STALE_AFTER_DAYS,
  catalogueFreshness,
} from "@/lib/sap-public/catalogue-health";
import {
  HUB_CONTENT_TYPES,
  HUB_CONTENT_TYPE_META,
  S4_PUBLIC_PUBLISHED_COUNTS,
  S4_PUBLIC_PUBLISHED_RELEASE,
  type HubContentType,
} from "@/lib/sap-public/hub-content";
import { deploymentFallbackTenants } from "@/lib/studio/tenants";

import ARTIFACT_COUNTS from "../../../../../sap-references/hub-artifact-counts.json";

export const dynamic = "force-dynamic";

/** The provenance block the committed counts drop carries about itself. */
function artifactCountsProvenance(): Record<string, unknown> | null {
  const p = (ARTIFACT_COUNTS as { _provenance?: unknown })._provenance;
  return p && typeof p === "object" ? (p as Record<string, unknown>) : null;
}

/** Read the import provenance an importer stamped onto a row, if any. */
function rowProvenance(raw: unknown): { source: string | null; importedAt: string | null } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { source: null, importedAt: null };
  }
  const r = raw as Record<string, unknown>;
  return {
    source: typeof r.source === "string" ? r.source : null,
    importedAt: typeof r.importedAt === "string" ? r.importedAt : null,
  };
}

export async function GET(): Promise<NextResponse> {
  const auth = await requireAdmin();
  if (isAdminError(auth)) return auth;

  const now = new Date();

  const [byType, illustrativeByType, lastProbeSweep] = await Promise.all([
    prisma.sapHubContent.groupBy({
      by: ["contentType"],
      _count: { _all: true },
      _min: { updatedAt: true },
      _max: { updatedAt: true },
      _sum: { itemCount: true },
    }),
    prisma.sapHubContent.groupBy({
      by: ["contentType"],
      where: { illustrative: true },
      _count: { _all: true },
    }),
    // When the per-connection probe sweep last ran — the history the respec
    // named as the real prerequisite, delivered by the observability phase.
    prisma.cronRunLog.findFirst({
      where: { job: "connection-probes" },
      orderBy: { startedAt: "desc" },
      select: { startedAt: true, finishedAt: true, ok: true, summaryJson: true },
    }),
  ]);

  const aggregates = new Map(byType.map((g) => [g.contentType as HubContentType, g]));
  const illustrative = new Map(
    illustrativeByType.map((g) => [g.contentType as HubContentType, g._count._all]),
  );

  // The newest row per type carries the latest import's own provenance stamp.
  // Twelve bounded findFirsts, admin-only — clarity beats a raw-SQL window fn.
  const newestRows = await Promise.all(
    HUB_CONTENT_TYPES.map((t) =>
      prisma.sapHubContent.findFirst({
        where: { contentType: t },
        orderBy: { updatedAt: "desc" },
        select: { rawMetadataJson: true },
      }),
    ),
  );

  const types = HUB_CONTENT_TYPES.map((contentType, i) => {
    const agg = aggregates.get(contentType);
    const meta = HUB_CONTENT_TYPE_META[contentType];
    const newestRowAt = agg?._max.updatedAt ?? null;
    const groupedItems = agg?._sum.itemCount ?? 0;
    return {
      contentType,
      label: meta.label,
      kind: meta.kind,
      loadedRows: agg?._count._all ?? 0,
      /**
       * Grouped rows (CDS views per package, the BAdI group) each represent
       * many underlying items; `itemCount` carries how many. Zero for types
       * stored as concrete rows — it is a supplement to `loadedRows`, never
       * a replacement.
       */
      groupedItemSum: groupedItems,
      illustrativeRows: illustrative.get(contentType) ?? 0,
      /** Published Hub figure for S/4 Public — a drift REFERENCE, not data. */
      publishedReference: S4_PUBLIC_PUBLISHED_COUNTS[contentType],
      oldestRowAt: agg?._min.updatedAt?.toISOString() ?? null,
      newestRowAt: newestRowAt?.toISOString() ?? null,
      freshness: catalogueFreshness(newestRowAt, now),
      latestImport: rowProvenance(newestRows[i]?.rawMetadataJson),
    };
  });

  return NextResponse.json({
    data: {
      scope: "deployment",
      stalenessDays: CATALOGUE_STALE_AFTER_DAYS,
      types,
      reference: {
        publishedRelease: S4_PUBLIC_PUBLISHED_RELEASE,
        publishedCountsNote: `Published SAP Business Accelerator Hub figures for S/4HANA Cloud Public Edition at content release ${S4_PUBLIC_PUBLISHED_RELEASE} (anonymous catalogue enumeration + logged-in product page, 2026-09-05). They move with each SAP release — compare within drift, never for equality.`,
        artifactCounts: artifactCountsProvenance(),
      },
      probeCoverage: {
        /**
         * Capability probes are recorded per env-configured tenant key, on the
         * rows themselves. Which tenants those are is deployment configuration,
         * listed here so "probed" always answers "probed against what".
         */
        tenants: deploymentFallbackTenants().map((t) => ({
          key: t.key,
          label: t.label,
          product: t.product,
          environment: t.environment,
        })),
        lastProbeSweep: lastProbeSweep
          ? {
              startedAt: lastProbeSweep.startedAt.toISOString(),
              finishedAt: lastProbeSweep.finishedAt.toISOString(),
              ok: lastProbeSweep.ok,
              summary: lastProbeSweep.summaryJson ?? null,
            }
          : null,
        note: "A customer connection's own health lives in Operations → Connections; per-connection probe history in SapConnectionProbeEvent. This panel is about the shared catalogue, not any tenant's estate.",
      },
      provenance: {
        deploymentWide:
          "The catalogue is one table serving every organization on this deployment. There is no per-organization number here to show — that is why this screen is admin-gated rather than tenant-scoped.",
        floorNotCensus:
          "Every harvest this deployment ships is self-declared a floor: it counts what the anonymous catalogue walk could reach. A row count below the published reference is expected; a count far above it means the reference is a release behind.",
        refreshIsFileBased:
          "Refresh never reaches api.sap.com from this product (Hub ToU). The path is: export from a logged-in Hub session, commit the drop file, deploy, then run the rebuild/import actions — each import stamps its provenance on the rows and audits its own summary.",
        stalenessBasis: `STALE means the newest row write is older than ${CATALOGUE_STALE_AFTER_DAYS} days — one SAP half-yearly release cycle, so a STALE catalogue is at least one release behind by construction.`,
      },
    },
  });
}
