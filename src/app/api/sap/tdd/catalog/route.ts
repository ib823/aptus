import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import {
  getConfiguredSapTenants,
  getSapProduct,
  isSapTddPublicAccessEnabled,
  SAP_ODATA_PRODUCTS,
} from "@/lib/sap-public/tdd-connector";
import { ERROR_CODES } from "@/types/api";

/** Whether a product has at least one tenant configured (env-driven). */
function isConfigured(envPrefix: string): boolean {
  try {
    return getConfiguredSapTenants(envPrefix).length > 0;
  } catch {
    return false;
  }
}

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
      // The full product list drives the top-level product switcher.
      products: SAP_ODATA_PRODUCTS.map((p) => ({
        key: p.key,
        label: p.label,
        description: p.description,
        protocol: "odata" as const,
        configured: isConfigured(p.envPrefix),
      })),
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
