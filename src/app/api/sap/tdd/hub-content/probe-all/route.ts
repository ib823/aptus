/**
 * POST /api/sap/tdd/hub-content/probe-all — admin-gated bulk tenant probe.
 *
 * Read-only $metadata probe of EVERY probeable service (isProbeable: API/CDS_VIEW
 * on OData V2/V4) FOR A GIVEN TENANT, with bounded concurrency, then PERSISTS each
 * result by MERGING into SapHubContent.rawMetadataJson.probes[tenantKey] =
 * { http, at, read, write } — no schema migration, tenant-scoped (one tenant's run
 * never touches another's), and never clobbering sibling keys (source/steps).
 *
 * The list + detail read this stored probe first, so the catalogue no longer
 * live-probes on every page load. Idempotent + re-runnable. SapApiReference is
 * never touched.
 */
import { NextResponse, type NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { isAdminError, requireAuthenticated } from "@/lib/auth/admin-guard";
import { isAdminRole } from "@/lib/auth/permissions";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { isStudioBuilder } from "@/lib/studio/rbac";
import { prisma } from "@/lib/db/prisma";
import {
  deriveReadWrite,
  getConfiguredSapTenants,
  getSapProduct,
} from "@/lib/sap-public/tdd-connector";
import { probeService } from "@/lib/sap-public/capability-probe";
import { hubApiToService, httpToRuntimeStatus, isProbeable, mergeStoredProbe, probeStorageKey, type HubContentType } from "@/lib/sap-public/hub-content";
import { hubCatalogueScope } from "@/lib/sap-public/dynamic-catalog";
import { logDecision } from "@/lib/audit/decision-logger";
import type { UserRole } from "@/types/assessment";
import { resolveReadTenant } from "@/lib/sap-public/tenant-for-read";
import { ERROR_CODES } from "@/types/api";

const CONFIRMATION = "PROBE ALL SAP SERVICES";
const CONCURRENCY = 8;

/**
 * ONE FLEET PROBE PER TENANT PER TEN MINUTES.
 *
 * This is not a load target, it is what the button IS: six hundred-odd requests
 * fired at eight-way concurrency into a CLIENT'S SAP system. Before this change
 * only a platform admin could pull that trigger and the confirmation phrase was
 * the whole of the restraint; now a builder can too, against their own tenant,
 * and restraint that depends on nobody double-clicking is not restraint.
 *
 * KEYED BY TENANT, NOT BY USER, for the same reason the lane re-check is: two
 * consultants on one client's system is the case that produces the complaint,
 * and neither of them is acting in bad faith.
 *
 * Ten minutes rather than a minute because a full run takes minutes to finish —
 * a shorter window would let a second run start on top of the first.
 */
const PROBE_ALL_LIMIT = { limit: 1, windowMs: 10 * 60_000 } as const;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAuthenticated();
  if (isAdminError(auth)) return auth;

  let body: { confirmation?: unknown; product?: unknown; tenant?: unknown; includeDeprecated?: unknown };
  try {
    body = (await request.json()) as { confirmation?: unknown; product?: unknown; tenant?: unknown; includeDeprecated?: unknown };
  } catch {
    return NextResponse.json({ error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Invalid JSON body" } }, { status: 400 });
  }
  if (body.confirmation !== CONFIRMATION) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: `Confirmation phrase required: "${CONFIRMATION}"` } },
      { status: 400 },
    );
  }

  const product = getSapProduct(typeof body.product === "string" ? body.product : "s4hana");
  if (!product) {
    return NextResponse.json({ error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Unknown product" } }, { status: 400 });
  }
  // Probe the REQUESTED tenant (default = the first configured). Results are
  // stored under a key that carries the tenant's OWNER — see probeStorageKey;
  // the bare key alone is shared between organizations that happen to name a
  // connection the same, which is a cross-tenant leak rather than a collision.
  const tenantKey =
    (typeof body.tenant === "string" && body.tenant) || getConfiguredSapTenants(product.envPrefix)[0]?.key;
  const resolved = tenantKey
    ? await resolveReadTenant(product.envPrefix, product.key, auth.user.organizationId ?? null, tenantKey)
    : null;
  // Guard on the RESOLUTION, not only on its tenant: the storage key below
  // needs `source`, and narrowing `tenant` alone leaves `resolved` nullable.
  if (!resolved || !tenantKey) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: `No TDD tenant "${String(body.tenant ?? "")}" configured for ${product.label}` } },
      { status: 400 },
    );
  }
  /*
   * THE GATE, AND IT DEPENDS ON WHOSE TENANT THIS IS.
   *
   * This route was `requireAdmin()` outright, which produced a deadlock: only a
   * consultant may author solutions and interfaces (canMutateStudio is builder
   * only, platform_admin deliberately false), and only a platform admin could
   * probe — so no single role could set an organization up end to end.
   *
   * A CONNECTION-BACKED TENANT IS THE CALLER'S OWN, by construction rather than
   * by a check here: `resolveReadTenant` looks a connection key up with
   * `resolveSapConnection(organizationId, product, key)`, so a "connection"
   * source means a row belonging to this user's organization. Probing your own
   * client's system is the builder's job, and refusing it made the product
   * unusable by the only role that can create anything.
   *
   * A DEPLOYMENT TENANT STAYS ADMIN-ONLY. Those come from `{PREFIX}_*` env
   * config, are shared by every organization on the deployment, and their probe
   * results are filed under a bare key that everyone reads. Widening that to
   * any builder would hand one organization's consultant a write into every
   * other organization's view.
   */
  const isAdmin = isAdminRole(auth.user.role ?? "");
  if (resolved.source === "deployment" && !isAdmin) {
    return NextResponse.json(
      {
        error: {
          code: ERROR_CODES.FORBIDDEN,
          message:
            "This is a deployment-wide tenant, shared by every organization here — only a platform admin can probe it.",
        },
      },
      { status: 403 },
    );
  }
  if (!isAdmin && !isStudioBuilder(auth.user.role)) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.FORBIDDEN, message: "Your role can view the catalogue but not probe it." } },
      { status: 403 },
    );
  }

  const tenant = resolved.tenant;
  const targetTenantKey: string = tenantKey; // narrowed; stable inside the worker closure

  /*
   * WHERE THIS RUN'S RESULTS ARE FILED. Derived once, outside the worker, from
   * the same resolution that produced the tenant — so the row written here and
   * the row the catalogue reads back cannot be keyed differently.
   */
  const storageKey = probeStorageKey({
    source: resolved.source,
    organizationId: auth.user.organizationId ?? null,
    product: product.key,
    tenantKey: targetTenantKey,
  });

  /*
   * The limiter fails closed in production (see lib/security/rate-limit), which
   * for this route is the right trade: a refused fleet probe costs a few
   * minutes of freshness on a catalogue page, and the thing being protected is
   * somebody else's production estate.
   */
  const gate = await checkRateLimit(
    // The storage key already names the owner and the tenant, so it is exactly
    // the identity this limit is about.
    `sap:probe-all:${storageKey}`,
    PROBE_ALL_LIMIT,
  );
  if (!gate.allowed) {
    return NextResponse.json(
      {
        error: {
          code: ERROR_CODES.VALIDATION_ERROR,
          message: "A fleet probe for this tenant ran moments ago. Try again shortly.",
        },
      },
      { status: 429, headers: { "Retry-After": String(Math.ceil(gate.resetMs / 1000)) } },
    );
  }

  /*
   * PROBE THE REQUESTED PRODUCT'S OWN CATALOGUE. This queried
   * `appliesToPublic: true` regardless of `?product=`, so "Probe all" on a
   * SuccessFactors or RISE tenant fired the S/4 PUBLIC list at it —
   * manufactured URLs against SF (404 by construction), and the wrong
   * published set against private/on-prem. Non-edition scopes have no
   * dynamically-probeable rows at all (path derivation waits for a live
   * system), and ECC has no list — both refuse honestly instead of storing
   * hundreds of meaningless outcomes under the tenant's key.
   */
  const scope = hubCatalogueScope(product);
  if (scope.kind !== "edition") {
    const message =
      scope.kind === "none"
        ? scope.reason
        : `${product.label} rows have no derivable OData paths to probe — only its curated services are probeable, from the Operations panel.`;
    return NextResponse.json({ error: { code: ERROR_CODES.VALIDATION_ERROR, message } }, { status: 400 });
  }
  // 2608 WS3 — SAP-deprecated services are skipped by default: probing a
  // retirement proves nothing about readiness and its bucket is DEPRECATED
  // regardless of the answer. `includeDeprecated: true` opts in (the result is
  // stored, the bucket does not change).
  const includeDeprecated = body.includeDeprecated === true;
  // Every probeable row (API/CDS_VIEW on OData V2/V4). SOAP / null apiType are
  // NOT probeable — they stay NOT_PROBEABLE and are skipped here.
  const rows = await prisma.sapHubContent.findMany({
    where: {
      ...scope.where,
      contentType: { in: ["API", "CDS_VIEW"] },
      apiType: { in: ["ODATAV2", "ODATAV4"] },
      ...(includeDeprecated ? {} : { NOT: { hubState: "DEPRECATED" } }),
    },
    select: { id: true, externalId: true, contentType: true, apiType: true, title: true, packageId: true, communicationScenarios: true, rawMetadataJson: true },
  });
  // Guard: only genuinely-probeable rows (mirror of hubApiToService non-null).
  const targets = rows.filter((r) => isProbeable({ contentType: r.contentType as HubContentType, apiType: r.apiType }));

  const at = new Date().toISOString();
  let probed = 0;
  const byOutcome: Record<string, number> = { ACTIVATED: 0, NEEDS_SETUP: 0, NOT_FOUND: 0, NOT_CHECKED: 0, PROBE_FAILED: 0 };
  let cursor = 0;

  async function worker(): Promise<void> {
    while (cursor < targets.length) {
      const row = targets[cursor++];
      if (!row) continue;
      const svc = hubApiToService({
        contentType: row.contentType as HubContentType,
        apiType: row.apiType,
        externalId: row.externalId,
        title: row.title,
        packageId: row.packageId,
        communicationScenarios: row.communicationScenarios,
      });
      if (!svc) continue;
      const result = await probeService(product!.envPrefix, tenant!, svc); // read-only $metadata; never throws
      const { read, write } = deriveReadWrite(result.entities ?? []);
      // MERGE under THIS tenant's OWNER-SCOPED key — preserves sibling keys
      // (source/apiId/steps), the legacy singular `probe`, and every other
      // tenant's stored result, including another organization's tenant that
      // happens to carry the same name.
      const merged = mergeStoredProbe(row.rawMetadataJson, storageKey, {
        http: result.status,
        at,
        read,
        write,
      }) as Prisma.InputJsonValue;
      await prisma.sapHubContent.update({ where: { id: row.id }, data: { rawMetadataJson: merged } });
      probed++;
      const bucket = httpToRuntimeStatus(result.status);
      byOutcome[bucket] = (byOutcome[bucket] ?? 0) + 1;
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, targets.length) }, worker));

  try {
    await logDecision({
      assessmentId: null,
      entityType: "sap_hub_probe",
      entityId: "hub-content-probe-all",
      action: "SAP_HUB_PROBED_ALL",
      newValue: { tenantKey, tenant: tenant.label, probed, byOutcome, at },
      actor: auth.user.email ?? "system",
      actorRole: (auth.user.role ?? "system") as UserRole,
    });
  } catch {
    /* audit is best-effort */
  }

  return NextResponse.json({ data: { probed, includeDeprecated, byOutcome, at, tenantKey, tenant: tenant.label } });
}
