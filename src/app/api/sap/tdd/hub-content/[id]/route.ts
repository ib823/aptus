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
import { failureReasonFromHttp } from "@/lib/northbound/failure-reason";
import { answeredReadAuditStatus } from "@/lib/sap-public/console-read-failure";
import {
  deriveReadWrite,
  getConfiguredSapTenants,
  getSapProduct,
  isSapTddPublicAccessEnabled,
} from "@/lib/sap-public/tdd-connector";
import { probeService } from "@/lib/sap-public/capability-probe";
import {
  catalogueAddress,
  catalogueAddressFamily,
  hubApiToService,
  hubAvailabilityQualifier,
  isProbeable,
  readStoredProbe,
  resolveHubStatus,
  type HubContentType,
} from "@/lib/sap-public/hub-content";
import {
  addressVerificationScope,
  currentAddressVerification,
  readAddressVerifications,
  recordAddressProbe,
} from "@/lib/sap-public/catalogue-address-verification";
import { resolveHubItemDependencies } from "@/lib/sap-public/hub-dependencies";
import { successorFor } from "@/lib/sap-public/hub-successors";
import { refuseUnlessMayProbeTenant } from "@/lib/sap-public/probe-guard";
import { openConsoleCall } from "@/lib/governed/console";
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
  // The session is validated once, here, and used throughout (P0.19's budget).
  const viewer = await getCurrentUser();
  if (!isSapTddPublicAccessEnabled(product.envPrefix) && !viewer) {
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
  const mayProbe = (await refuseUnlessMayProbeTenant({ appliesSandboxDeveloperCeiling: true, viewer })) === null;
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
  /*
   * P0.8 — THE ROW'S ADDRESS UNDER ITS OWN PRODUCT'S RULES, and a live probe
   * only when that address is the service's own. This built the S/4 path for
   * every row whatever the product, so expanding a SuccessFactors API probed
   * /sap/opu/odata/sap/<id> on a SuccessFactors host (404 by construction) and
   * badged it "Not found"; a `sap-s4-*` wrapper was probed at a malformed
   * address the same way. A SuccessFactors API's address is the shared
   * /odata/v2 root, so its probe would say nothing about that API either.
   */
  const family = catalogueAddressFamily(product);
  const itemRow = { contentType, apiType: item.apiType, externalId: item.externalId };
  const address = catalogueAddress(itemRow, family);
  const service = isProbeable(itemRow, family)
    ? hubApiToService(
        {
          ...itemRow,
          title: item.title,
          packageId: item.packageId,
          communicationScenarios: item.communicationScenarios,
        },
        family,
      )
    : null;
  // Only for a signed-in viewer, as on the list: what answered on a tenant is
  // an observation about that tenant, never shown to a caller we cannot attribute.
  const verificationScope =
    viewer && resolvedTenant && tenantKey && probeKey
      ? addressVerificationScope({
          source: resolvedTenant.source,
          organizationId: viewer?.organizationId ?? null,
          product: product.key,
          tenantKey,
          connectionId: resolvedTenant.connection?.id ?? null,
          baseUrl: resolvedTenant.tenant.baseUrl,
        })
      : null;

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
  if (resolvedTenant && tenant && service && viewer && request.nextUrl.searchParams.get("probe") !== "0") {
    // ON THE GOVERNED PIPELINE (P0.14b, governed/console.ts): the ceilings,
    // the deployment tenant's host check and the console circuit are its
    // steps, each refusal audited by it; the probe runs inside its `callSap`,
    // which writes the row.
    const call = openConsoleCall({
      viewer,
      target: { kind: "odata", product, resolved: resolvedTenant },
      route: "/api/sap/tdd/hub-content/[id]",
      externalId: service.key,
      servicePath: service.path,
    });
    const authorised = await call.authorise();
    const bound = authorised.ok ? await call.bind() : authorised;
    const contained = bound.ok ? await call.contain() : bound;
    // Refused, the detail falls back to the stored probe like any other
    // refusal here (already recorded by the pipeline).
    if (contained.ok) {
      const probed = await call.callSap(() => probeService(product.envPrefix, tenant, service), {
        // Like /entities: the status SAP gave ($metadata read), how many entity
        // sets it declared, and 502 when it never answered (probeService's 0).
        // A credential CoreEdge could not obtain is not SAP's answer at all: a
        // setup problem is recorded as the refusal it is, 403, and only a
        // token endpoint that failed as a 502 (audit A26, A28). SAP's own
        // answer is recorded as /preview records it: its 401/403/404 as
        // themselves, anything else — a 429 included, which recorded as itself
        // raised the 'throttled' incident — as 502 with HTTP_<n>.
        answered: (result) => {
          const answered = !result.credentialError && result.status !== 0;
          const status = result.credentialError
            ? result.credentialError === "refused"
              ? 403
              : 502
            : answered
              ? answeredReadAuditStatus(result.status === 200, result.status)
              : 502;
          return {
            status,
            rowCount: result.exposed ? (result.entitySetCount ?? 0) : null,
            failureReason: answered ? failureReasonFromHttp(result.status) : null,
            sapStatus: answered ? result.status : null,
          };
        },
        // probeService reports rather than throws; a throw is recorded as a 502.
        failed: () => ({ status: 502, rowCount: null, failureReason: null }),
      });
      // Never shown as this service's status when the tenant was not asked:
      // the stored probe below stands instead, as for a probe that threw.
      if (probed.ok && !probed.value.credentialError) {
        const result = probed.value;
        try {
          // A 200 on a V4 address verifies it on this system; a 404 withdraws it.
          await recordAddressProbe(verificationScope, {
            service,
            status: result.status,
            actorUserId: viewer.id,
            method: "detail-probe",
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
    family,
  );

  // P0.8 — whether this V4 address has answered 200 on THIS system (read after
  // the live probe above, so its own 200 counts).
  let verifiedAt: string | null = null;
  if (address?.protocol === "ODATAV4" && verificationScope) {
    const stored = await readAddressVerifications(verificationScope, [item.externalId]);
    verifiedAt =
      currentAddressVerification(stored.get(item.externalId), { path: address.path, scope: verificationScope })?.toISOString() ??
      null;
  }

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
      address: address
        ? { path: address.path, protocol: address.protocol, basis: address.basis, verifiedAt }
        : null,
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
