import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import {
  AribaRequestError,
  callAribaEndpoint,
  isAribaConfigured,
  parseAribaCallRequest,
} from "@/lib/sap-public/ariba-connector";
import { refuseUnlessMayProbeTenant } from "@/lib/sap-public/probe-guard";
import { logDecision } from "@/lib/audit/decision-logger";
import type { UserRole } from "@/types/assessment";
import { ERROR_CODES } from "@/types/api";

/**
 * GET /api/sap/ariba/call — a LIVE read against a customer's Ariba realm.
 *
 * GUARDED LIKE THE ODATA LIVE ROUTES, because it is one. This route performed
 * an OAuth exchange and a REST call against a real customer realm gated only by
 * `isAribaPublicAccessEnabled() || session` — the same public-access-flag shape
 * that made the probe guard unreachable twice on the OData side
 * (probe-guard.ts, capabilities/route.ts both record the incident). Different
 * protocol, same rule: a read nobody is accountable for is the one case the
 * guard exists to prevent. It now takes `refuseUnlessMayProbeTenant` and writes
 * the same style of audit row the OData probes write. The sapLive throttle
 * covers it via isLiveSapTenantRoute.
 *
 * NO SANDBOX DEVELOPER (roadmap P0.13). An Ariba realm declares no landscape,
 * so there is no SANDBOX to hold that role to; the guard's default refuses it
 * here, before any OAuth exchange. Do not pass `appliesSandboxDeveloperCeiling`
 * unless this route learns to cap the role itself.
 *
 * NOTHING LEAVES ON A BAD REQUEST OR A BAD CONFIGURATION (roadmap P0.6).
 * parseAribaCallRequest refuses an unknown endpoint key (A73, once a 502), an
 * ARIBA_BASE_URL or ARIBA_OAUTH_TOKEN_URL that is not an absolute http(s) URL
 * (also once a 502), a malformed or empty ARIBA_REALMS_JSON or a realm it does
 * not list (A72), and a limit that is not a positive integer (A75, once
 * `$top=NaN`), each 400 VALIDATION_ERROR before any token exchange. 502 is kept for a failure this
 * route did not expect; what Ariba or its token endpoint answered is the
 * result's `status`, `stage` and `failureReason`, answered 200.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const refusal = await refuseUnlessMayProbeTenant();
  if (refusal) return refusal;

  if (!isAribaConfigured()) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "SAP Ariba is not configured" } },
      { status: 400 },
    );
  }

  const parsed = parseAribaCallRequest(request.nextUrl.searchParams);
  if (!parsed.ok) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: parsed.message } },
      { status: 400 },
    );
  }
  const { endpointKey: endpoint, realm, limit } = parsed;

  try {
    const result = await callAribaEndpoint(endpoint, realm, limit);
    // Best-effort audit — endpoint + realm + outcome, never payload data. The
    // guard above means there is always an attributable caller. `stage` and
    // `failureReason` say whether the realm was asked at all (A74).
    try {
      const user = await getCurrentUser();
      await logDecision({
        assessmentId: null,
        entityType: "sap_ariba_call",
        entityId: endpoint,
        action: "SAP_CAPABILITY_PROBED",
        newValue: {
          endpoint,
          realm: realm || null,
          status: result.status,
          stage: result.stage,
          failureReason: result.failureReason,
        },
        actor: user?.email ?? "unknown",
        actorRole: (user?.role ?? "consultant") as UserRole,
      });
    } catch {
      /* audit is best-effort */
    }
    return NextResponse.json({ data: result });
  } catch (error) {
    if (error instanceof AribaRequestError) {
      // parseAribaCallRequest refuses these first; still the caller's error.
      return NextResponse.json(
        { error: { code: ERROR_CODES.VALIDATION_ERROR, message: error.message } },
        { status: 400 },
      );
    }
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
