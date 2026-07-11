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
  getConfiguredSapTenants,
  getSapProduct,
  getSapTenant,
  isSapTddPublicAccessEnabled,
} from "@/lib/sap-public/tdd-connector";
import { probeService } from "@/lib/sap-public/capability-probe";
import {
  hubApiToService,
  hubAvailabilityQualifier,
  resolveHubStatus,
  type HubContentType,
} from "@/lib/sap-public/hub-content";
import { resolveHubItemDependencies } from "@/lib/sap-public/hub-dependencies";
import { ERROR_CODES } from "@/types/api";

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
  const tenant = tenantKey ? getSapTenant(product.envPrefix, tenantKey) : null;
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
  if (tenant && service && request.nextUrl.searchParams.get("probe") !== "0") {
    try {
      const result = await probeService(product.envPrefix, tenant, service);
      probeStatus = result.status;
      ladder = result.ladder ?? null;
      entities = result.entities ?? null;
      metadataFlavor = result.metadataFlavor ?? null;
    } catch {
      probeStatus = null;
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
  const status = resolveHubStatus({ contentType, apiType: item.apiType, externalId: item.externalId }, outcomes);

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
      },
      status,
      availabilityNote: hubAvailabilityQualifier(contentType),
      ladder,
      entities,
      metadataFlavor,
      probeStatus,
      dependencies,
      steps,
      tenant: tenant?.label ?? null,
    },
  });
}
