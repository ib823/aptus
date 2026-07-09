import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import {
  getSapProduct,
  getSapService,
  getSapTenant,
  inspectSapService,
  isSapTddPublicAccessEnabled,
  probeSapEntitySets,
} from "@/lib/sap-public/tdd-connector";
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
  const service = getSapService(product, request.nextUrl.searchParams.get("service") ?? "");
  const probe = request.nextUrl.searchParams.get("probe") === "1";

  if (!tenant || !service) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Valid tenant and service are required" } },
      { status: 400 },
    );
  }

  try {
    const { entitySets } = await inspectSapService(product.envPrefix, tenant, service);
    const probes = probe
      ? await probeSapEntitySets(
          product.envPrefix,
          tenant,
          service,
          entitySets.map((entitySet) => entitySet.name),
        )
      : [];
    return NextResponse.json({ data: { entitySets, probes } });
  } catch (error) {
    return NextResponse.json(
      {
        error: {
          code: ERROR_CODES.INTERNAL_ERROR,
          message: error instanceof Error ? error.message : "SAP metadata request failed",
        },
      },
      { status: 502 },
    );
  }
}
