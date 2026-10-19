/**
 * Phase 3 — GET /api/sap/tdd/hub-content/[id]  (item detail).
 *
 * One catalogue item with its Phase-2 capability ladder + per-entity C/R/U/D
 * (from a single live $metadata probe when probeable) and its Phase-3
 * dependencies + honest debug hint. Guarded like the other SAP read routes.
 */
import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import {
  deriveReadWrite,
  getConfiguredSapTenants,
  getSapProduct,
  isSapTddPublicAccessEnabled,
} from "@/lib/sap-public/tdd-connector";
import { probeService } from "@/lib/sap-public/capability-probe";
import {
  hubApiToService,
  hubAvailabilityQualifier,
  readStoredProbe,
  resolveHubStatus,
  type HubContentType,
} from "@/lib/sap-public/hub-content";
import { resolveHubItemDependencies } from "@/lib/sap-public/hub-dependencies";
import { successorFor } from "@/lib/sap-public/hub-successors";
import { refuseUnlessMayProbeTenant } from "@/lib/sap-public/probe-guard";
import {
  decideConsoleRead,
  DEPLOYMENT_AUDIT_SCOPE,
  newCorrelationId,
  recordConsoleRead,
} from "@/lib/sap-public/console-read-guard";
import { probeStorageKey } from "@/lib/sap-public/hub-content";
import { readTenantRefusalResponse, resolveReadTenant } from "@/lib/sap-public/tenant-for-read";
import { ERROR_CODES } from "@/types/api";

// A read endpoint whose result depends on a live per-tenant probe — never cache.
export const dynamic = "force-dynamic";
export const revalidate = 0;
const NO_STORE = { "Cache-Control": "no-store" } as const;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const product = getSapProduct(request.nextUrl.searchParams.get("product"));
  if (!product) {
    return NextResponse.json({ error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Unknown product" } }, { status: 400 });
  }
  if (!isSapTddPublicAccessEnabled(product.envPrefix) && !(await getCurrentUser())) {
    return NextResponse.json({ error: { code: ERROR_CODES.UNAUTHORIZED, message: "Not authenticated" } }, { status: 401 });
  }

  const item = await prisma.sapHubContent.findUnique({ where: { id } });
  if (!item) {
    return NextResponse.json({ error: { code: ERROR_CODES.NOT_FOUND, message: "Item not found" } }, { status: 404 });
  }
  const contentType = item.contentType as HubContentType;

  // Single-item live probe (only when probeable + a tenant is configured).
  const tenantKey = request.nextUrl.searchParams.get("tenant") ?? getConfiguredSapTenants(product.envPrefix)[0]?.key;
  // The caller's organization, so a DECLARED CONNECTION key resolves here too
  // — the tenant switcher offers connection keys and this route used to accept
  // only deployment ones.
  const viewer = await getCurrentUser();
  /*
   * THE LIVE PROBE IS GATED LIKE EVERY OTHER LIVE READ. This route accepted
   * "catalogue may be browsed" (PUBLIC_ACCESS) as permission to open a
   * connection to the tenant and issue a real $metadata request — the exact
   * pattern probe-guard.ts records being found and closed twice on its
   * siblings (/entities, /preview, /operations, /capabilities). Browsing the
   * stored row stays open to whoever may browse; CAUSING a new read of a
   * customer's system is limited to Studio roles, and everyone else falls
   * through to the stored probe below, which is what the list renders from.
   */
  const mayProbe = (await refuseUnlessMayProbeTenant()) === null;
  /*
   * RESOLVED WHETHER OR NOT A LIVE PROBE IS ALLOWED, because the STORED read
   * below runs either way and has to be filed under the right owner. This is a
   * lookup of the viewer's own connection row — no SAP call — so it grants
   * nothing that `mayProbe` withholds; the live probe below still waits on it.
   */
  const resolvedTenant = tenantKey
    ? await resolveReadTenant(product.envPrefix, product.key, viewer?.organizationId ?? null, tenantKey)
    : null;
  // Refused for the same reason as the list: the stored read below would
  // otherwise come from a slot that is not this organization's.
  if (resolvedTenant && "refused" in resolvedTenant) {
    return readTenantRefusalResponse(resolvedTenant, tenantKey ?? "");
  }
  const tenant = mayProbe ? (resolvedTenant?.tenant ?? null) : null;
  const probeKey =
    resolvedTenant && tenantKey
      ? probeStorageKey({
          source: resolvedTenant.source,
          organizationId: viewer?.organizationId ?? null,
          product: product.key,
          tenantKey,
        })
      : null;
  const service = hubApiToService({
    contentType,
    apiType: item.apiType,
    externalId: item.externalId,
    title: item.title,
    packageId: item.packageId,
    communicationScenarios: item.communicationScenarios,
  });

  let probeStatus: number | null = null;
  let ladder: string | null = null;
  let entities: unknown = null;
  let metadataFlavor: string | null = null;
  let capability: { read: boolean; write: boolean } | null = null;
  /*
   * THE CONSOLE CEILING AND THE CONSOLE ROW, AS /entities HAS THEM (audit A24).
   * The role gate above decides WHO may cause a live read; it never decided
   * WHICH landscape. Expanding a row in the catalogue sent a live $metadata
   * request to whatever connection `?tenant=` resolved — an organization's PROD
   * system included, though /entities refuses the same organization 403
   * NO_APPROVED_GRANT there — and left no NorthboundAuditEvent row.
   *
   * A REFUSAL FALLS BACK, IT DOES NOT FAIL. The detail already falls through to
   * the stored probe for a viewer who may not probe, and for `?probe=0`; a
   * landscape this organization is not cleared to read is the same case. The
   * refused read is still recorded.
   *
   * `viewer` is implied by `tenant` (a tenant is only kept when the probe guard
   * found a session); naming it narrows the type for the row's actor.
   */
  if (tenant && service && viewer && request.nextUrl.searchParams.get("probe") !== "0") {
    const correlationId = newCorrelationId();
    const conn = resolvedTenant?.connection ?? null;
    const auditEnvironment = conn?.environment ?? `deployment:${tenant.key}`;
    const audit = (status: number, rowCount: number | null, extra: { durationMs?: number } = {}) =>
      recordConsoleRead({
        organizationId: viewer.organizationId ?? DEPLOYMENT_AUDIT_SCOPE,
        actorUserId: viewer.id,
        externalId: service.key,
        environment: auditEnvironment,
        status,
        rowCount,
        correlationId,
        connectionId: conn?.id ?? null,
        connectionEnvironment: conn?.environment ?? null,
        ...extra,
      });
    let allowed = true;
    if (conn && viewer.organizationId) {
      const decision = await decideConsoleRead({
        organizationId: viewer.organizationId,
        environment: conn.environment,
      });
      if (!decision.allowed) {
        await audit(403, null);
        allowed = false;
      }
    }
    if (allowed) {
      const startedAt = Date.now();
      try {
        const result = await probeService(product.envPrefix, tenant, service);
        // Like /entities: the status SAP gave ($metadata read), how many entity
        // sets it declared, and 502 when it never answered (probeService's 0).
        await audit(result.status === 0 ? 502 : result.status, result.exposed ? (result.entitySetCount ?? 0) : null, {
          durationMs: Date.now() - startedAt,
        });
        probeStatus = result.status;
        ladder = result.ladder ?? null;
        entities = result.entities ?? null;
        metadataFlavor = result.metadataFlavor ?? null;
        // Same shared derivation as the list — the collapsed chip must match this.
        if (result.entities && result.entities.length > 0) capability = deriveReadWrite(result.entities);
      } catch {
        probeStatus = null;
      }
    }
  }
  /*
   * FALL BACK TO THE STORED PROBE the list itself renders from. With ?probe=0
   * (or a live probe that failed) this route reported "status unknown" for a
   * row whose Probe-all result sat in rawMetadataJson — so the detail said
   * "not probed" under a list badge that said ACTIVATED.
   *
   * SAME SCOPING AS THE LIST, and that claim is now true. This comment used to
   * end "never another tenant's data" while the key was the bare tenant name —
   * which two organizations may share, since SapConnection is unique per
   * organization and these rows are global. `probeStorageKey` carries the owner.
   */
  if (probeStatus == null && probeKey) {
    const stored = readStoredProbe(
      item.rawMetadataJson,
      probeKey,
      getConfiguredSapTenants(product.envPrefix)[0]?.key,
    );
    if (stored && typeof stored.http === "number") {
      probeStatus = stored.http;
      if (typeof stored.read === "boolean") {
        capability = { read: stored.read, write: stored.write === true };
      }
    }
  }

  const dependencies = await resolveHubItemDependencies(
    prisma,
    { contentType, scopeItemCodes: item.scopeItemCodes, communicationScenarios: item.communicationScenarios },
    probeStatus,
  );

  // Feed the SAME outcome-driven resolver the list uses — the live probe's HTTP
  // code (200/403/404) is authoritative here, so detail and list can't disagree.
  const outcomes = new Map<string, number>();
  if (probeStatus != null) outcomes.set(item.externalId, probeStatus);
  const status = resolveHubStatus(
    { contentType, apiType: item.apiType, externalId: item.externalId, hubState: item.hubState },
    outcomes,
  );

  // Blueprint steps, if the export carried any (PROCESS_BLUEPRINT / SCENARIO).
  const raw = item.rawMetadataJson as { steps?: unknown } | null;
  const steps = Array.isArray(raw?.steps)
    ? raw.steps
        .map((s) => (typeof s === "string" ? { name: s } : { name: String((s as { name?: unknown })?.name ?? "") }))
        .filter((s) => s.name.length > 0)
    : [];

  return NextResponse.json({
    data: {
      item: {
        id: item.id,
        contentType,
        externalId: item.externalId,
        title: item.title,
        description: item.description,
        packageId: item.packageId,
        apiType: item.apiType,
        communicationScenarios: item.communicationScenarios,
        scopeItemCodes: item.scopeItemCodes,
        itemCount: item.itemCount,
        hubUrl: item.hubUrl,
        hubState: item.hubState,
        hubVersion: item.hubVersion,
        successorExternalId: item.successorExternalId ?? successorFor(item.externalId),
      },
      status,
      availabilityNote: hubAvailabilityQualifier(contentType),
      ladder,
      entities,
      capability,
      metadataFlavor,
      probeStatus,
      dependencies,
      steps,
      tenant: tenant?.label ?? null,
    },
  }, { headers: NO_STORE });
}
