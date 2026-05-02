import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import {
  getConfiguredSapTenants,
  isSapTddPublicAccessEnabled,
  SAP_TDD_SERVICES,
} from "@/lib/sap-public/tdd-connector";
import { ERROR_CODES } from "@/types/api";

export async function GET(): Promise<NextResponse> {
  if (!isSapTddPublicAccessEnabled() && !(await getCurrentUser())) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.UNAUTHORIZED, message: "Not authenticated" } },
      { status: 401 },
    );
  }

  return NextResponse.json({
    data: {
      tenants: getConfiguredSapTenants().map((tenant) => ({
        key: tenant.key,
        label: tenant.label,
        baseHost: new URL(tenant.baseUrl).host,
      })),
      services: SAP_TDD_SERVICES,
    },
  });
}
