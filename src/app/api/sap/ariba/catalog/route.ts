import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import {
  ARIBA_ENDPOINTS,
  getAribaRealms,
  isAribaConfigured,
  isAribaPublicAccessEnabled,
} from "@/lib/sap-public/ariba-connector";
import { ERROR_CODES } from "@/types/api";

export async function GET(): Promise<NextResponse> {
  if (!isAribaPublicAccessEnabled() && !(await getCurrentUser())) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.UNAUTHORIZED, message: "Not authenticated" } },
      { status: 401 },
    );
  }

  let realms: ReturnType<typeof getAribaRealms> = [];
  try {
    realms = getAribaRealms();
  } catch {
    realms = [];
  }

  return NextResponse.json({
    data: {
      configured: isAribaConfigured(),
      realms,
      endpoints: ARIBA_ENDPOINTS,
    },
  });
}
