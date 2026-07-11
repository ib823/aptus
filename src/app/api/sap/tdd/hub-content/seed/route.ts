/**
 * POST /api/sap/tdd/hub-content/seed — admin-gated rebuild of the API slice of
 * the Capability Catalogue from the REAL, already-populated SapApiReference
 * table (the classifier's API catalogue). Projects each public API reference
 * row into SapHubContent as contentType=API, so the live probe can mark the
 * exposed ones ACTIVATED and the scorecard reads an honest "N activated".
 *
 * Runs IN the deployment runtime (uses the ambient DATABASE_URL — no secret
 * moves). Additive + idempotent (upsert by contentType+externalId). Non-API
 * content types are left untouched — never fabricated; they arrive only from
 * real per-type exports (sap:hub:import).
 */
import { NextResponse, type NextRequest } from "next/server";
import type { Prisma, SapHubContentType } from "@prisma/client";
import { isAdminError, requireAdmin } from "@/lib/auth/admin-guard";
import { prisma } from "@/lib/db/prisma";
import { logDecision } from "@/lib/audit/decision-logger";
import type { UserRole } from "@/types/assessment";
import { ERROR_CODES } from "@/types/api";

const CONFIRMATION = "REBUILD SAP HUB CATALOGUE";
const API: SapHubContentType = "API" as SapHubContentType;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAdmin();
  if (isAdminError(auth)) return auth;

  let body: { confirmation?: unknown };
  try {
    body = (await request.json()) as { confirmation?: unknown };
  } catch {
    return NextResponse.json({ error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Invalid JSON body" } }, { status: 400 });
  }
  if (body.confirmation !== CONFIRMATION) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: `Confirmation phrase required: "${CONFIRMATION}"` } },
      { status: 400 },
    );
  }

  // Source of truth: the real, already-populated public API references.
  const apis = await prisma.sapApiReference.findMany({
    where: { appliesToPublic: true },
    select: {
      apiId: true,
      apiName: true,
      description: true,
      status: true,
      category: true,
      apiType: true,
      communicationScenarios: true,
      scopeItemCodes: true,
      apiHubUrl: true,
    },
  });

  let imported = 0;
  for (const a of apis) {
    const data = {
      title: a.apiName,
      description: a.description ?? "",
      packageId: a.category ?? null,
      appliesToPublic: true,
      appliesToPrivate: false,
      appliesToOnPrem: false,
      status: a.status,
      apiType: a.apiType,
      communicationScenarios: a.communicationScenarios,
      scopeItemCodes: a.scopeItemCodes,
      itemCount: null,
      hubUrl: a.apiHubUrl,
      rawMetadataJson: { source: "SapApiReference", apiId: a.apiId } as Prisma.InputJsonValue,
    };
    await prisma.sapHubContent.upsert({
      where: { contentType_externalId: { contentType: API, externalId: a.apiId } },
      create: { contentType: API, externalId: a.apiId, ...data },
      update: data,
    });
    imported++;
  }

  const total = await prisma.sapHubContent.count();
  const apiTotal = await prisma.sapHubContent.count({ where: { contentType: API } });
  try {
    await logDecision({
      assessmentId: "system",
      entityType: "sap_hub_seed",
      entityId: "hub-content-api-rebuild",
      action: "SAP_HUB_SEED_IMPORTED",
      newValue: { source: "SapApiReference", imported, apiTotal, total },
      actor: auth.user.email ?? "system",
      actorRole: (auth.user.role ?? "system") as UserRole,
    });
  } catch {
    /* audit is best-effort */
  }

  return NextResponse.json({ data: { imported, apiTotal, total, source: "SapApiReference" } });
}
