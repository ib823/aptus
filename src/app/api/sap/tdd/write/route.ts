import { timingSafeEqual } from "crypto";
import { NextResponse, type NextRequest } from "next/server";
import { isAdminError, requireAdmin } from "@/lib/auth/admin-guard";
import {
  createSapEntitySetRecord,
  getSapService,
  getSapTddWriteSecretRequired,
  getSapTenant,
  isSapTddWriteEnabled,
} from "@/lib/sap-public/tdd-connector";
import { ERROR_CODES } from "@/types/api";

const CONFIRMATION_PHRASE = "WRITE TO SAP TDD";

interface SapWriteRequestBody {
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
 * Fail-closed: if S4_TDD_WRITE_SECRET is unset, the endpoint must reject.
 * Prior behaviour returned true on missing secret, allowing unauthenticated
 * writes when the operator forgot to configure the secret.
 */
function validateWriteSecret(writeSecret: unknown): boolean {
  const requiredSecret = process.env.S4_TDD_WRITE_SECRET;
  if (!requiredSecret) return false;
  if (typeof writeSecret !== "string") return false;

  const a = Buffer.from(writeSecret);
  const b = Buffer.from(requiredSecret);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    data: {
      enabled: isSapTddWriteEnabled(),
      confirmationPhrase: CONFIRMATION_PHRASE,
      writeSecretRequired: getSapTddWriteSecretRequired(),
    },
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!isSapTddWriteEnabled()) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.FORBIDDEN, message: "SAP TDD write-back is disabled" } },
      { status: 403 },
    );
  }

  // Authenticate + require admin role even when a write secret is present.
  // Defence in depth: secret is the second factor, not the only factor.
  const auth = await requireAdmin();
  if (isAdminError(auth)) return auth;

  let body: SapWriteRequestBody;
  try {
    body = (await request.json()) as SapWriteRequestBody;
  } catch {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Invalid JSON body" } },
      { status: 400 },
    );
  }

  if (body.confirmation !== CONFIRMATION_PHRASE) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Confirmation phrase is required" } },
      { status: 400 },
    );
  }

  if (!validateWriteSecret(body.writeSecret)) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.FORBIDDEN, message: "Invalid SAP write secret" } },
      { status: 403 },
    );
  }

  const tenant = getSapTenant(readString(body.tenant));
  const service = getSapService(readString(body.service));
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

  try {
    const result = await createSapEntitySetRecord(tenant, service, entity, body.payload);
    return NextResponse.json({ data: result }, { status: result.ok ? 200 : 502 });
  } catch (error) {
    return NextResponse.json(
      {
        error: {
          code: ERROR_CODES.INTERNAL_ERROR,
          message: error instanceof Error ? error.message : "SAP write-back request failed",
        },
      },
      { status: 502 },
    );
  }
}
