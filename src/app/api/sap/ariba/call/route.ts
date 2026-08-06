import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import {
  callAribaEndpoint,
  isAribaConfigured,
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
    // Best-effort audit — endpoint + realm + outcome, never payload data. The
    // guard above means there is always an attributable caller.
    try {
      const user = await getCurrentUser();
      await logDecision({
        assessmentId: null,
        entityType: "sap_ariba_call",
        entityId: endpoint,
        action: "SAP_CAPABILITY_PROBED",
        newValue: { endpoint, realm: realm || null, status: result.status },
        actor: user?.email ?? "unknown",
        actorRole: (user?.role ?? "consultant") as UserRole,
      });
    } catch {
      /* audit is best-effort */
    }
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
