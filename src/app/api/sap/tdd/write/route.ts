import { timingSafeEqual } from "crypto";
import { NextResponse, type NextRequest } from "next/server";
import { isAdminError, requireAdmin } from "@/lib/auth/admin-guard";
import {
  createSapEntitySetRecord,
  deploymentOnlyTenantMessage,
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

  // DEPLOYMENT REGISTRY ONLY, never the connection registry. The write ring is
  // a deployment facility (env flag, env secret, env tenants); a stored
  // connection is written through the northbound broker, never from here. See
  // deploymentOnlyTenantMessage for the reasoning, and the scan in
  // tests/unit/studio/tenant-registries.test.ts that pins it.
  const tenantKey = readString(body.tenant);
  const tenant = getSapTenant(product.envPrefix, tenantKey);
  if (!tenant) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: deploymentOnlyTenantMessage(tenantKey) } },
      { status: 400 },
    );
  }

  const service = getSapService(product, readString(body.service));
  const entity = readString(body.entity);

  if (!service || !entity || !isRecord(body.payload)) {
    return NextResponse.json(
      {
        error: {
          code: ERROR_CODES.VALIDATION_ERROR,
          message: "Valid service, entity, and object payload are required",
        },
      },
      { status: 400 },
    );
  }

  try {
    const result = await createSapEntitySetRecord(
      product.envPrefix,
      tenant,
      service,
      entity,
      body.payload,
    );
    return NextResponse.json({ data: result }, { status: result.ok ? 200 : 502 });
  } catch (error) {
    console.error("[sap/tdd/write] request failed:", error);
    return NextResponse.json(
      {
        error: {
          code: ERROR_CODES.INTERNAL_ERROR,
          message: "SAP write-back request failed",
        },
      },
      { status: 502 },
    );
  }
}
