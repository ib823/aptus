import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import {
  callAribaEndpoint,
  isAribaConfigured,
  isAribaPublicAccessEnabled,
} from "@/lib/sap-public/ariba-connector";
import { ERROR_CODES } from "@/types/api";

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!isAribaPublicAccessEnabled() && !(await getCurrentUser())) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.UNAUTHORIZED, message: "Not authenticated" } },
      { status: 401 },
    );
  }

  if (!isAribaConfigured()) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "SAP Ariba is not configured" } },
      { status: 400 },
    );
  }

  const endpoint = request.nextUrl.searchParams.get("endpoint") ?? "";
  const realm = request.nextUrl.searchParams.get("realm") ?? "";
  const limit = Number.parseInt(request.nextUrl.searchParams.get("limit") ?? "10", 10);

  if (!endpoint) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "endpoint is required" } },
      { status: 400 },
    );
  }

  try {
    const result = await callAribaEndpoint(endpoint, realm, limit);
    return NextResponse.json({ data: result });
  } catch (error) {
    console.error("[sap/ariba/call] request failed:", error);
    return NextResponse.json(
      {
        error: {
          code: ERROR_CODES.INTERNAL_ERROR,
          message: "Ariba call failed",
        },
      },
      { status: 502 },
    );
  }
}
