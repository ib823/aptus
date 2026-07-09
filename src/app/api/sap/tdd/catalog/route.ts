import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import {
  getConfiguredSapTenants,
  getSapProduct,
  isSapTddPublicAccessEnabled,
} from "@/lib/sap-public/tdd-connector";
import { listProductSummaries } from "@/lib/sap-public/products";
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

  return NextResponse.json({
    data: {
      // The full product list (OData + Ariba) drives the product switcher.
      products: listProductSummaries(),
      product: { key: product.key, label: product.label, description: product.description },
      tenants: getConfiguredSapTenants(product.envPrefix).map((tenant) => ({
        key: tenant.key,
        label: tenant.label,
        baseHost: new URL(tenant.baseUrl).host,
      })),
      services: product.services,
    },
  });
}
