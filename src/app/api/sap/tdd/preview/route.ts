import { NextResponse, type NextRequest } from "next/server";
import {
  getSapProduct,
  previewSapEntitySet,
} from "@/lib/sap-public/tdd-connector";
import { refuseUnlessMayProbeTenant } from "@/lib/sap-public/probe-guard";
import { resolveReadTenant, unknownTenantMessage } from "@/lib/sap-public/tenant-for-read";
import { getCurrentUser } from "@/lib/auth/session";
import { resolveHubService } from "@/lib/sap-public/resolve-hub-service";
import { ERROR_CODES } from "@/types/api";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const product = getSapProduct(request.nextUrl.searchParams.get("product"));
  if (!product) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Unknown product" } },
      { status: 400 },
    );
  }

  // A preview is a LIVE READ of a customer tenant, not a catalogue lookup, so
  // the gate is a role and not merely a session. See refuseUnlessMayProbeTenant.
  const refusal = await refuseUnlessMayProbeTenant();
  if (refusal) return refusal;

  const tenantKey = request.nextUrl.searchParams.get("tenant") ?? "";
  const viewer = await getCurrentUser();
  const resolved = await resolveReadTenant(
    product.envPrefix,
    product.key,
    viewer?.organizationId ?? null,
    tenantKey,
  );
  const tenant = resolved?.tenant ?? null;
  const service = await resolveHubService(product, request.nextUrl.searchParams.get("service") ?? "");
  const entity = request.nextUrl.searchParams.get("entity") ?? "";
  const limit = Number.parseInt(request.nextUrl.searchParams.get("limit") ?? "10", 10);

  if (!tenant || !service || !entity) {
    return NextResponse.json(
      {
        error: {
          code: ERROR_CODES.VALIDATION_ERROR,
          message: tenant
            ? "A valid service and entity are required"
            : unknownTenantMessage(tenantKey),
        },
      },
      { status: 400 },
    );
  }

  try {
    const preview = await previewSapEntitySet(product.envPrefix, tenant, service, entity, limit);
    return NextResponse.json({ data: preview });
  } catch (error) {
    // Do not reflect the raw connector error to the client — it can carry SAP
    // tenant labels, upstream HTTP status, and topology detail useful for recon.
    // Log server-side; return a generic message.
    console.error("[sap/tdd/preview] request failed:", error);
    return NextResponse.json(
      {
        error: {
          code: ERROR_CODES.INTERNAL_ERROR,
          message: "SAP preview request failed",
        },
      },
      { status: 502 },
    );
  }
}
