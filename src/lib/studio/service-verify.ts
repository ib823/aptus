/**
 * Verify an interface's SAP service, live: ask the system for the service's
 * own description ($metadata) through the organization's connection, and check
 * that it is one, that it is the OData version the interface says, and that it
 * declares the interface's dataset.
 *
 * WHY. A path a developer typed is a claim. The catalogue's services are
 * contracts SAP published; a Z* RAP service or a YY1_* custom CDS view is
 * whatever the customer's system says it is, and the only honest source is
 * that system. This answers the questions a builder actually has before a
 * single business record moves — "does it exist here, can we sign in, is the
 * dataset called what I think it is called" — and the write path refuses a
 * custom service until it has been answered once since the last change.
 *
 * READS NO BUSINESS DATA. One GET of `$metadata`, the same request the
 * connection probe makes (fetchMetadataDocument), read in full up to a bound
 * because the entity sets are spread through the document.
 *
 * No prisma here: the route owns persistence and audit; this owns the verdict.
 */

import { parseEntitySets } from "@/lib/sap-public/tdd-connector";
import type { ResolvedSapConnection } from "@/lib/sap-public/connection-resolver";
import type { ODataVersion } from "@/lib/sap-public/service-path";
import { fetchMetadataDocument } from "@/lib/studio/connection-health";

/** A service description larger than this is refused rather than half-read. */
export const VERIFY_MAX_METADATA_BYTES = 8 * 1024 * 1024;
/** How many entity-set names are stored on the interface after a verify. */
export const MAX_STORED_ENTITY_SETS = 500;

export type ServiceVerifyStatus =
  | "OK"
  | "ENTITY_SET_MISSING"
  | "VERSION_MISMATCH"
  | "METADATA_TOO_LARGE"
  | "UNAUTHORIZED"
  | "NOT_FOUND"
  | "TIMEOUT"
  | "ERROR";

export interface ServiceVerifyResult {
  status: ServiceVerifyStatus;
  /** True only for OK: the description was read, matched, and names the dataset. */
  verified: boolean;
  /** One plain sentence. Never a URL or a host. */
  detail: string;
  httpStatus: number | null;
  durationMs: number;
  /** Entity-set names the description declares, de-duplicated, in document order. */
  entitySets: string[];
  detectedODataVersion: ODataVersion | null;
  /** On ENTITY_SET_MISSING, a set whose name differs only in case. */
  suggestedEntitySet: string | null;
  /** The status the console-read audit row records. */
  auditStatus: number;
  failureReason: string | null;
}

const EDMX_OPEN = /<(?:[A-Za-z_][\w.-]*:)?Edmx\b([^>]*)>/;

/** Root element `<…:Edmx Version="1.0">` → V2; "4.0" / "4.01" → V4; otherwise null. */
export function edmxODataVersion(xml: string): ODataVersion | null {
  const attrs = EDMX_OPEN.exec(xml)?.[1] ?? "";
  const version = /\bVersion\s*=\s*["']([^"']+)["']/.exec(attrs)?.[1]?.trim();
  if (version === "1.0") return "V2";
  if (version === "4.0" || version === "4.01") return "V4";
  return null;
}

function versionLabel(v: ODataVersion): string {
  return v === "V4" ? "OData V4" : "OData V2";
}

function auditStatusFor(status: string, httpStatus: number | null): number {
  if (status === "UNAUTHORIZED") {
    // A 401/403 is what SAP said; anything else here is a credential that
    // could not be used or a redirect to a login page — a refusal all the same.
    return httpStatus === 401 || httpStatus === 403 ? httpStatus : 403;
  }
  if (status === "NOT_FOUND") return 404;
  if (status === "TIMEOUT") return 504;
  return 502;
}

export async function verifyServiceMetadata(
  input: {
    connection: ResolvedSapConnection;
    servicePath: string;
    declaredVersion: ODataVersion | null;
    entitySet: string | null;
  },
  fetchImpl: typeof fetch = fetch,
): Promise<ServiceVerifyResult> {
  const r = await fetchMetadataDocument(input.connection, input.servicePath, fetchImpl, {
    maxBytes: VERIFY_MAX_METADATA_BYTES,
  });

  const base = {
    httpStatus: r.httpStatus,
    durationMs: r.durationMs,
    failureReason: r.failureReason,
  };

  if (r.status !== "OK" || r.body === null) {
    // NO_PROBE_PATH cannot occur — the path is given — and is ERROR if it ever did.
    const status: ServiceVerifyStatus =
      r.status === "UNAUTHORIZED" || r.status === "NOT_FOUND" || r.status === "TIMEOUT" ? r.status : "ERROR";
    return {
      ...base,
      status,
      verified: false,
      detail:
        status === "NOT_FOUND"
          ? "The SAP system has no service at this path. Check it against the service binding in ADT (Service URL) or /IWFND/MAINT_SERVICE, and that the service is published."
          : r.detail,
      entitySets: [],
      detectedODataVersion: null,
      suggestedEntitySet: null,
      auditStatus: auditStatusFor(status, r.httpStatus),
    };
  }

  if (r.truncated) {
    return {
      ...base,
      status: "METADATA_TOO_LARGE",
      verified: false,
      detail: `The service description is larger than ${VERIFY_MAX_METADATA_BYTES / (1024 * 1024)} MB, so it was not read in full and the datasets cannot be listed. Ask for a smaller service (one service binding per business object).`,
      entitySets: [],
      detectedODataVersion: edmxODataVersion(r.body),
      suggestedEntitySet: null,
      auditStatus: 200,
      failureReason: "METADATA_TOO_LARGE",
    };
  }

  const entitySets = [...new Set(parseEntitySets(r.body).map((e) => e.name))];
  const detected = edmxODataVersion(r.body);

  if (input.declaredVersion !== null && detected !== null && detected !== input.declaredVersion) {
    return {
      ...base,
      status: "VERSION_MISMATCH",
      verified: false,
      detail: `This service describes itself as ${versionLabel(detected)}, but the interface says ${input.declaredVersion}. Change the version, then verify again.`,
      entitySets,
      detectedODataVersion: detected,
      suggestedEntitySet: null,
      auditStatus: 200,
    };
  }

  if (input.entitySet !== null && input.entitySet !== "" && !entitySets.includes(input.entitySet)) {
    // OData names are case-sensitive, so a near miss is a suggestion, never a match.
    const wanted = input.entitySet.toLowerCase();
    const suggestion = entitySets.find((n) => n.toLowerCase() === wanted) ?? null;
    return {
      ...base,
      status: "ENTITY_SET_MISSING",
      verified: false,
      detail:
        `The service answered, but it has no dataset called "${input.entitySet}".` +
        (suggestion ? ` Did you mean "${suggestion}"? Dataset names are case-sensitive.` : " Pick one of the datasets it lists."),
      entitySets,
      detectedODataVersion: detected,
      suggestedEntitySet: suggestion,
      auditStatus: 200,
    };
  }

  return {
    ...base,
    status: "OK",
    verified: true,
    detail:
      entitySets.length === 0
        ? "The service answered with its description, but it declares no datasets."
        : input.entitySet
          ? `The service answered with its description and offers the dataset "${input.entitySet}" (${entitySets.length} dataset${entitySets.length === 1 ? "" : "s"} in all).`
          : `The service answered with its description and offers ${entitySets.length} dataset${entitySets.length === 1 ? "" : "s"}. Pick one for this interface.`,
    entitySets,
    detectedODataVersion: detected,
    suggestedEntitySet: null,
    auditStatus: 200,
  };
}
