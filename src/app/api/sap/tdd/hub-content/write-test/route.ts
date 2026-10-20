/**
 * Phase 2 — POST /api/sap/tdd/hub-content/write-test  (OPT-IN, fail-closed).
 *
 * Confirms a service is truly Writable via create-then-delete, ONLY behind the
 * full write guard + a dedicated write-test ring. Never auto-run; test tenant /
 * test-data ring only. Read the guard contract in capability-write-test.ts.
 *
 * AUDITED BEFORE SAP IS CALLED (P0.7). Once the guard has passed and the target
 * is resolved, a PlatformAuditEvent naming the person is written before the
 * $metadata check and the create; if it cannot be written, nothing is sent
 * (503). It replaces the best-effort `logDecision` that was written after the
 * fact and swallowed on failure. See lib/audit/platform-audit.ts.
 */
import { timingSafeEqual } from "crypto";
import { NextResponse, type NextRequest } from "next/server";
import { isAdminError, requireAdmin } from "@/lib/auth/admin-guard";
import {
  getSapProduct,
  getSapService,
  getSapTddWriteSecret,
  getSapTenant,
  inspectSapServiceMetadata,
  isSapTddWriteEnabled,
} from "@/lib/sap-public/tdd-connector";
import {
  WRITE_TEST_CONFIRMATION,
  assertWriteTestAllowed,
  runCapabilityWriteTest,
} from "@/lib/sap-public/capability-write-test";
import {
  beginPlatformAudit,
  completePlatformAudit,
  outcomeForThrown,
  outcomeForWriteTest,
  platformAuditUnavailable,
  type PlatformAuditHandle,
} from "@/lib/audit/platform-audit";
import { ERROR_CODES } from "@/types/api";

function readString(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}
function isRecord(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}
function validateWriteSecret(prefix: string, writeSecret: unknown): boolean {
  const required = getSapTddWriteSecret(prefix);
  if (!required || typeof writeSecret !== "string") return false;
  const a = Buffer.from(writeSecret);
  const b = Buffer.from(required);
  return a.length === b.length && timingSafeEqual(a, b);
}
function ringAllowlist(prefix: string): string[] {
  return (process.env[`${prefix}_WRITE_TEST_ENTITYSETS`] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

interface Body {
  product?: unknown;
  tenant?: unknown;
  service?: unknown;
  entity?: unknown;
  payload?: unknown;
  confirmation?: unknown;
  writeSecret?: unknown;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Invalid JSON body" } }, { status: 400 });
  }

  const product = getSapProduct(readString(body.product));
  if (!product) {
    return NextResponse.json({ error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Unknown product" } }, { status: 400 });
  }
  const prefix = product.envPrefix;
  const entity = readString(body.entity);

  // Admin is evaluated but folded into the single fail-closed guard below.
  const auth = await requireAdmin();
  const isAdmin = !isAdminError(auth);
  // requireAdmin already distinguishes "no session" (401) from "not an admin"
  // (403); the boolean above threw that away. Recover it rather than asking the
  // session layer a second time.
  const authenticated = !isAdminError(auth) || auth.status !== 401;

  const decision = assertWriteTestAllowed({
    writeEnabled: isSapTddWriteEnabled(prefix),
    authenticated,
    isAdmin,
    confirmation: readString(body.confirmation) === WRITE_TEST_CONFIRMATION ? WRITE_TEST_CONFIRMATION : "",
    writeSecretValid: validateWriteSecret(prefix, body.writeSecret),
    ringEnabled: process.env[`${prefix}_WRITE_TEST_ENABLED`] === "true",
    entitySetAllowed: entity.length > 0 && ringAllowlist(prefix).includes(entity),
  });
  if (!decision.ok) {
    const code = decision.status === 400 ? ERROR_CODES.VALIDATION_ERROR : decision.status === 401 ? ERROR_CODES.UNAUTHORIZED : ERROR_CODES.FORBIDDEN;
    return NextResponse.json({ error: { code, message: decision.message } }, { status: decision.status });
  }
  // Unreachable once the guard has passed (it requires isAdmin); it narrows
  // `auth` to the signed-in admin the audit row must name.
  if (isAdminError(auth)) return auth;

  const tenant = getSapTenant(prefix, readString(body.tenant));
  const service = getSapService(product, readString(body.service));
  if (!tenant || !service || !isRecord(body.payload)) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Valid tenant, service, and object payload are required" } },
      { status: 400 },
    );
  }

  // The audit row comes first: before the $metadata read and before the
  // create. A refusal by the metadata gate below is then recorded as BLOCKED
  // rather than leaving no trace of an attempt that reached a live tenant.
  let audit: PlatformAuditHandle;
  try {
    audit = await beginPlatformAudit({
      action: "SAP_WORKBENCH_WRITE_TEST",
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

  // Metadata gate: only create-then-delete where the set is BOTH creatable and
  // deletable, so nothing is left behind. Never write without this confirmation.
  let cap;
  try {
    const meta = await inspectSapServiceMetadata(prefix, tenant, service);
    cap = meta.entityCapabilities.find((e) => e.name === entity);
  } catch (err) {
    await completePlatformAudit(audit, { outcome: "BLOCKED", reason: "METADATA_PROBE_FAILED" });
    return NextResponse.json(
      { error: { code: ERROR_CODES.INTERNAL_ERROR, message: err instanceof Error ? err.message : "metadata probe failed" } },
      { status: 502, headers },
    );
  }
  if (!cap || cap.creatable !== true || cap.deletable !== true) {
    await completePlatformAudit(audit, { outcome: "BLOCKED", reason: "NOT_CREATABLE_AND_DELETABLE" });
    return NextResponse.json(
      { error: { code: ERROR_CODES.FORBIDDEN, message: "Entity set is not confirmed creatable AND deletable in $metadata — write-test refused" } },
      { status: 403, headers },
    );
  }

  const startedAt = Date.now();
  try {
    const result = await runCapabilityWriteTest(prefix, tenant, service, entity, body.payload);
    await completePlatformAudit(audit, { ...outcomeForWriteTest(result), durationMs: Date.now() - startedAt });
    return NextResponse.json({ data: result }, { status: result.created && result.deleted ? 200 : 502, headers });
  } catch (err) {
    await completePlatformAudit(audit, { ...outcomeForThrown(err), durationMs: Date.now() - startedAt });
    return NextResponse.json(
      { error: { code: ERROR_CODES.INTERNAL_ERROR, message: err instanceof Error ? err.message : "write-test failed" } },
      { status: 502, headers },
    );
  }
}
