import { timingSafeEqual } from "crypto";
import { NextResponse, type NextRequest } from "next/server";
import {
  beginPlatformAudit,
  completePlatformAudit,
  outcomeForSapCreate,
  outcomeForThrown,
  platformAuditUnavailable,
  type PlatformAuditHandle,
} from "@/lib/audit/platform-audit";
import { isAdminError, requireAdmin } from "@/lib/auth/admin-guard";
import {
  createSapEntitySetRecord,
  getSapProduct,
  getSapService,
  getSapTddWriteSecret,
  getSapTddWriteSecretRequired,
  getSapTenant,
  isSapTddWriteEnabled,
} from "@/lib/sap-public/tdd-connector";
import { ERROR_CODES } from "@/types/api";

const CONFIRMATION_PHRASE = "WRITE TO SAP TDD";

interface SapWriteRequestBody {
  product?: unknown;
  tenant?: unknown;
  service?: unknown;
  entity?: unknown;
  payload?: unknown;
  confirmation?: unknown;
  writeSecret?: unknown;
}

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * Fail-closed: if the product's WRITE_SECRET is unset, the endpoint must
 * reject. Never allow a write when the operator forgot to configure it.
 */
function validateWriteSecret(envPrefix: string, writeSecret: unknown): boolean {
  const requiredSecret = getSapTddWriteSecret(envPrefix);
  if (!requiredSecret) return false;
  if (typeof writeSecret !== "string") return false;

  const a = Buffer.from(writeSecret);
  const b = Buffer.from(requiredSecret);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const product = getSapProduct(request.nextUrl.searchParams.get("product"));
  if (!product) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Unknown product" } },
      { status: 400 },
    );
  }
  // The confirmation phrase is UX friction, not a secret — the client holds it as
  // a constant. This unguarded GET returns only capability flags, nothing sensitive.
  return NextResponse.json({
    data: {
      enabled: isSapTddWriteEnabled(product.envPrefix),
      writeSecretRequired: getSapTddWriteSecretRequired(product.envPrefix),
    },
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: SapWriteRequestBody;
  try {
    body = (await request.json()) as SapWriteRequestBody;
  } catch {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Invalid JSON body" } },
      { status: 400 },
    );
  }

  const product = getSapProduct(readString(body.product));
  if (!product) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Unknown product" } },
      { status: 400 },
    );
  }

  if (!isSapTddWriteEnabled(product.envPrefix)) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.FORBIDDEN, message: "SAP TDD write-back is disabled" } },
      { status: 403 },
    );
  }

  // Authenticate + require admin role even when a write secret is present.
  // Defence in depth: secret is the second factor, not the only factor.
  const auth = await requireAdmin();
  if (isAdminError(auth)) return auth;

  if (body.confirmation !== CONFIRMATION_PHRASE) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Confirmation phrase is required" } },
      { status: 400 },
    );
  }

  if (!validateWriteSecret(product.envPrefix, body.writeSecret)) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.FORBIDDEN, message: "Invalid SAP write secret" } },
      { status: 403 },
    );
  }

  const tenant = getSapTenant(product.envPrefix, readString(body.tenant));
  const service = getSapService(product, readString(body.service));
  const entity = readString(body.entity);

  if (!tenant || !service || !entity || !isRecord(body.payload)) {
    return NextResponse.json(
      {
        error: {
          code: ERROR_CODES.VALIDATION_ERROR,
          message: "Valid tenant, service, entity, and object payload are required",
        },
      },
      { status: 400 },
    );
  }

  /*
   * THE AUDIT ROW, BEFORE SAP IS CALLED (P0.7). Every guard above has passed
   * and the target is resolved, so this is the last line before a live system
   * changes. If the row cannot be written, nothing is sent: 503, and SAP is
   * untouched. The person is named on the row, and the correlation id comes
   * back on the response so they can find it.
   */
  let audit: PlatformAuditHandle;
  try {
    audit = await beginPlatformAudit({
      action: "SAP_WORKBENCH_WRITE",
      actor: {
        id: auth.user.id,
        email: auth.user.email,
        role: auth.user.role,
        organizationId: auth.user.organizationId,
      },
      target: {
        product: product.key,
        tenantKey: tenant.key,
        tenantLabel: tenant.label,
        serviceKey: service.key,
        servicePath: service.path,
        entitySet: entity,
      },
      payload: body.payload,
    });
  } catch {
    return platformAuditUnavailable();
  }
  const headers = { "x-correlation-id": audit.correlationId };

  const startedAt = Date.now();
  try {
    const result = await createSapEntitySetRecord(
      product.envPrefix,
      tenant,
      service,
      entity,
      body.payload,
    );
    await completePlatformAudit(audit, { ...outcomeForSapCreate(result), durationMs: Date.now() - startedAt });
    return NextResponse.json({ data: result }, { status: result.ok ? 200 : 502, headers });
  } catch (error) {
    console.error("[sap/tdd/write] request failed:", error);
    await completePlatformAudit(audit, { ...outcomeForThrown(error), durationMs: Date.now() - startedAt });
    return NextResponse.json(
      {
        error: {
          code: ERROR_CODES.INTERNAL_ERROR,
          message: "SAP write-back request failed",
        },
      },
      { status: 502, headers },
    );
  }
}
