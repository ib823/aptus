/**
 * POST /api/sap/tdd/hub-content/probe-all — admin-gated bulk tenant probe.
 *
 * Read-only $metadata probe of EVERY probeable service (isProbeable: API/CDS_VIEW
 * on OData V2/V4), with bounded concurrency, then PERSISTS each result by MERGING
 * into SapHubContent.rawMetadataJson.probe = { http, at, read, write } — no schema
 * migration, and never clobbering the other rawMetadataJson keys (source/steps).
 *
 * The list + detail read this stored probe first, so the catalogue no longer
 * live-probes on every page load. Idempotent + re-runnable. SapApiReference is
 * never touched.
 */
import { NextResponse, type NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { isAdminError, requireAdmin } from "@/lib/auth/admin-guard";
import { prisma } from "@/lib/db/prisma";
import {
  deriveReadWrite,
  getConfiguredSapTenants,
  getSapProduct,
  getSapTenant,
} from "@/lib/sap-public/tdd-connector";
import { probeService } from "@/lib/sap-public/capability-probe";
import { hubApiToService, httpToRuntimeStatus, isProbeable, type HubContentType } from "@/lib/sap-public/hub-content";
import { logDecision } from "@/lib/audit/decision-logger";
import type { UserRole } from "@/types/assessment";
import { ERROR_CODES } from "@/types/api";

const CONFIRMATION = "PROBE ALL SAP SERVICES";
const CONCURRENCY = 8;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAdmin();
  if (isAdminError(auth)) return auth;

  let body: { confirmation?: unknown; product?: unknown };
  try {
    body = (await request.json()) as { confirmation?: unknown; product?: unknown };
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
  const tenantKey = getConfiguredSapTenants(product.envPrefix)[0]?.key;
  const tenant = tenantKey ? getSapTenant(product.envPrefix, tenantKey) : null;
  if (!tenant) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: `No TDD tenant configured for ${product.label}` } },
      { status: 400 },
    );
  }

  // Every probeable row (API/CDS_VIEW on OData V2/V4). SOAP / null apiType are
  // NOT probeable — they stay NOT_PROBEABLE and are skipped here.
  const rows = await prisma.sapHubContent.findMany({
    where: { appliesToPublic: true, contentType: { in: ["API", "CDS_VIEW"] }, apiType: { in: ["ODATAV2", "ODATAV4"] } },
    select: { id: true, externalId: true, contentType: true, apiType: true, title: true, packageId: true, communicationScenarios: true, rawMetadataJson: true },
  });
  // Guard: only genuinely-probeable rows (mirror of hubApiToService non-null).
  const targets = rows.filter((r) => isProbeable({ contentType: r.contentType as HubContentType, apiType: r.apiType }));

  const at = new Date().toISOString();
  let probed = 0;
  const byOutcome: Record<string, number> = { ACTIVATED: 0, NEEDS_SETUP: 0, NOT_FOUND: 0, NOT_CHECKED: 0 };
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
      // MERGE — preserve every existing rawMetadataJson key (source/apiId/steps…).
      const existing = (row.rawMetadataJson && typeof row.rawMetadataJson === "object" && !Array.isArray(row.rawMetadataJson))
        ? (row.rawMetadataJson as Record<string, unknown>)
        : {};
      const merged = { ...existing, probe: { http: result.status, at, read, write } } as Prisma.InputJsonValue;
      await prisma.sapHubContent.update({ where: { id: row.id }, data: { rawMetadataJson: merged } });
      probed++;
      const bucket = httpToRuntimeStatus(result.status);
      byOutcome[bucket] = (byOutcome[bucket] ?? 0) + 1;
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, targets.length) }, worker));

  try {
    await logDecision({
      assessmentId: "system",
      entityType: "sap_hub_probe",
      entityId: "hub-content-probe-all",
      action: "SAP_HUB_PROBED_ALL",
      newValue: { tenant: tenant.label, probed, byOutcome, at },
      actor: auth.user.email ?? "system",
      actorRole: (auth.user.role ?? "system") as UserRole,
    });
  } catch {
    /* audit is best-effort */
  }

  return NextResponse.json({ data: { probed, byOutcome, at, tenant: tenant.label } });
}
