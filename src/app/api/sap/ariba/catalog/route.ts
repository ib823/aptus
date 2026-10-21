import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import {
  AribaRealmConfigError,
  aribaUrlConfigError,
  getAribaRealms,
  isAribaConfigured,
  isAribaPublicAccessEnabled,
  resolveAribaEndpoints,
} from "@/lib/sap-public/ariba-connector";
import { ERROR_CODES } from "@/types/api";

/**
 * GET /api/sap/ariba/catalog — what the Ariba explorer may call.
 *
 * TRUTHFUL (roadmap P0.6):
 *   - `endpoints` are resolveAribaEndpoints(), the paths the call route sends
 *     to, as tdd/catalog resolves through getSapServices. The static
 *     ARIBA_ENDPOINTS showed v2 while ARIBA_SOURCING_V1 sent v1 (audit A71).
 *   - a malformed ARIBA_REALMS_JSON is `realmsError`, with `configured: false`,
 *     not `configured: true` with zero realms (audit A72). The error and an
 *     empty result are never the same answer. An empty list is malformed too.
 *   - an ARIBA_BASE_URL or ARIBA_OAUTH_TOKEN_URL that is not an absolute
 *     http(s) URL is `configError`, with `configured: false`: the call route
 *     refuses every call while it is set so (P0.6 review).
 */
export async function GET(): Promise<NextResponse> {
  if (!isAribaPublicAccessEnabled() && !(await getCurrentUser())) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.UNAUTHORIZED, message: "Not authenticated" } },
      { status: 401 },
    );
  }

  let realms: ReturnType<typeof getAribaRealms> = [];
  let realmsError: string | null = null;
  try {
    realms = getAribaRealms();
  } catch (error) {
    if (!(error instanceof AribaRealmConfigError)) throw error;
    // The message names the variable and the defect, never its value.
    console.error(`[sap/ariba/catalog] ${error.message}`);
    realmsError = error.message;
  }

  // Names the variable, never its value.
  const configError = aribaUrlConfigError();
  if (configError) console.error(`[sap/ariba/catalog] ${configError}`);

  return NextResponse.json({
    data: {
      configured: isAribaConfigured() && realmsError === null && configError === null,
      realms,
      realmsError,
      configError,
      endpoints: resolveAribaEndpoints(),
    },
  });
}
