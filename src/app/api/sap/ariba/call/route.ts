import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import {
  AribaRequestError,
  callAribaEndpoint,
  isAribaConfigured,
  parseAribaCallRequest,
} from "@/lib/sap-public/ariba-connector";
import { refuseUnlessMayProbeTenant } from "@/lib/sap-public/probe-guard";
import { consoleRefusalBody, consoleRefusalInit, openConsoleCall } from "@/lib/governed/console";
import type { Refusal } from "@/lib/governed/pipeline";
import { failureReasonFromHttp } from "@/lib/northbound/failure-reason";
import { answeredReadAuditStatus } from "@/lib/sap-public/console-read-failure";
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
 *
 * AUDITED, NOT BEST-EFFORT LOGGED (P0.14b). The call runs on the console
 * pipeline (governed/console.ts) and leaves a platform-scope row
 * (PlatformAuditEvent `SAP_CONSOLE_READ`) naming the person, the endpoint and
 * the realm; the `logDecision` entry it used to rely on is kept beside it.
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

  const viewer = await getCurrentUser();
  // The guard above has established a session; a call nobody is accountable
  // for must not run, and the audit row cannot be written without an actor.
  if (!viewer) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.UNAUTHORIZED, message: "Not authenticated" } },
      { status: 401 },
    );
  }

  /*
   * ON THE GOVERNED PIPELINE (P0.14b, governed/console.ts). The person, as the
   * "console" principal: the sandbox developer's ceiling (an Ariba realm is
   * never SANDBOX; the guard above already refuses the role), ARIBA_BASE_URL
   * and ARIBA_OAUTH_TOKEN_URL against the SAP host allow-list (bind,
   * COREEDGE_ENV_TENANT_HOSTS), the console's own circuit for this realm, then
   * the call itself, audited on the platform-scope trail. An Ariba realm is the
   * deployment's, not an organization's, so there is no organization row.
   */
  const call = openConsoleCall({
    viewer,
    target: { kind: "ariba", realm },
    route: "/api/sap/ariba/call",
    externalId: endpoint,
    request: { endpoint, realm, limit },
  });
  const correlationId = call.correlationId;
  const refuse = (r: Refusal) => NextResponse.json(consoleRefusalBody(r, correlationId), consoleRefusalInit(r));
  const authorised = await call.authorise();
  if (!authorised.ok) return refuse(authorised.refusal);
  const bound = await call.bind();
  if (!bound.ok) return refuse(bound.refusal);
  const contained = await call.contain();
  if (!contained.ok) return refuse(contained.refusal);

  const called = await call.callSap(() => callAribaEndpoint(endpoint, realm, limit), {
    // What the realm (or its token endpoint) answered is the result's own:
    // `stage` says whether the realm was asked at all (A74).
    // Recorded as the OData console records SAP's answer (answeredReadAuditStatus):
    // its 401/403/404 as themselves, anything else that is not ok as 502; a
    // realm that never answered, or a token step that failed, as 502 with the
    // result's own TOKEN_* reason.
    answered: (result) => ({
      status: result.status > 0 ? answeredReadAuditStatus(result.ok, result.status) : 502,
      rowCount: result.ok ? result.rows.length : null,
      failureReason: result.failureReason ?? (result.status > 0 ? failureReasonFromHttp(result.status) : null),
      sapStatus: result.status > 0 ? result.status : null,
    }),
    failed: (error) => ({ status: error instanceof AribaRequestError ? 400 : 502, rowCount: null }),
  });

  if (called.ok) {
    const result = called.value;
    // Best-effort assessment-trail entry, as before — endpoint + realm +
    // outcome, never payload data. The platform-scope row above is the record.
    try {
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
        actor: viewer.email ?? "unknown",
        actorRole: (viewer.role ?? "consultant") as UserRole,
      });
    } catch {
      /* audit is best-effort */
    }
    return NextResponse.json({ data: result });
  }
  const error = called.error;
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
