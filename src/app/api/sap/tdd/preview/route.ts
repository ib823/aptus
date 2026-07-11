import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import {
  getSapProduct,
  getSapTenant,
  isSapTddPublicAccessEnabled,
  previewSapEntitySet,
} from "@/lib/sap-public/tdd-connector";
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

  if (!isSapTddPublicAccessEnabled(product.envPrefix) && !(await getCurrentUser())) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.UNAUTHORIZED, message: "Not authenticated" } },
      { status: 401 },
    );
  }

  const tenant = getSapTenant(product.envPrefix, request.nextUrl.searchParams.get("tenant") ?? "");
  const service = await resolveHubService(product, request.nextUrl.searchParams.get("service") ?? "");
  const entity = request.nextUrl.searchParams.get("entity") ?? "";
  const limit = Number.parseInt(request.nextUrl.searchParams.get("limit") ?? "10", 10);

  if (!tenant || !service || !entity) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Valid tenant, service, and entity are required" } },
      { status: 400 },
    );
  }

  try {
    const preview = await previewSapEntitySet(product.envPrefix, tenant, service, entity, limit);
    return NextResponse.json({ data: preview });
  } catch (error) {
    return NextResponse.json(
      {
        error: {
          code: ERROR_CODES.INTERNAL_ERROR,
          message: error instanceof Error ? error.message : "SAP preview request failed",
        },
      },
      { status: 502 },
    );
  }
}
