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
 * SUCCESSFACTORS ASKS ABOUT ONE DATASET. Its service root, /odata/v2, describes
 * the whole tenant — every standard and custom MDF entity — and that document
 * is large and slow enough (SAP's own EC performance guidance says so) to run
 * past the connection timeout or the size bound, so the root could never be
 * verified and a custom write could never be unlocked. SuccessFactors answers
 * `{root}/{EntitySet}/$metadata` with the description of that one entity, so
 * when the interface names its dataset on that root, that is what is fetched
 * (its OData V4 services under /odatav4/ are small, per-module, and answer
 * `$metadata` only at their own root, so they are read whole). The verdict
 * is the same question — is it OData, which version, is the dataset there —
 * asked about the part the interface uses.
 *
 * No prisma here: the route owns persistence and audit; this owns the verdict.
 */

import { parseEntitySets } from "@/lib/sap-public/tdd-connector";
import type { ResolvedSapConnection } from "@/lib/sap-public/connection-resolver";
import type { ODataVersion } from "@/lib/sap-public/service-path";
import { fetchMetadataDocument, METADATA_SNIFF_BYTES } from "@/lib/studio/connection-health";

/**
 * The service roots that describe a whole tenant and answer
 * `{root}/{EntitySet}/$metadata` for one entity (see the header), by product.
 * The ROOT, not just the product: SuccessFactors' OData V4 services under
 * /odatav4/ are per-module services with their own small description, and
 * OData V4 serves `$metadata` only at the service root — asking
 * `{service}/{EntitySet}/$metadata` there is answered 404, so a V4 service
 * with its dataset entered could never be verified (review round 3).
 * Matched case-insensitively, like the path rule's roots.
 */
const ENTITY_SCOPED_METADATA_ROOTS: ReadonlyMap<string, string> = new Map([["successfactors", "/odata/v2"]]);

/**
 * An entity-set name safe to put in a path segment: an OData simple
 * identifier. Anything else cannot be a dataset of the service anyway, and is
 * never joined onto a path — the root description is asked instead.
 */
const SIMPLE_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/;

/**
 * Where the description is fetched from: `{servicePath}` (and fetchMetadataDocument
 * appends `/$metadata`), or, for a product's tenant-wide root that answers
 * entity-scoped metadata (SuccessFactors /odata/v2) and a dataset that is a
 * simple identifier, `{servicePath}/{entitySet}`.
 */
export function metadataTarget(input: {
  sapProduct?: string | null;
  servicePath: string;
  entitySet: string | null;
}): { path: string; scope: "service" | "entitySet" } {
  const scopedRoot = input.sapProduct != null ? ENTITY_SCOPED_METADATA_ROOTS.get(input.sapProduct) : undefined;
  if (
    scopedRoot !== undefined &&
    input.servicePath.toLowerCase() === scopedRoot &&
    input.entitySet != null &&
    SIMPLE_IDENTIFIER.test(input.entitySet)
  ) {
    return { path: `${input.servicePath}/${input.entitySet}`, scope: "entitySet" };
  }
  return { path: input.servicePath, scope: "service" };
}

/**
 * A tenant-wide root asked whole because no (usable) dataset was entered:
 * SuccessFactors /odata/v2 with an empty entity set. Its description is the
 * whole tenant, so the read usually runs out of time or past the size limit,
 * and "ask for a smaller service" cannot apply. The answer then says the one
 * thing that helps: enter the dataset (review round 4).
 */
function isTenantWideRootAskedWhole(
  input: { sapProduct?: string | null; servicePath: string },
  scope: "service" | "entitySet",
): boolean {
  const scopedRoot = input.sapProduct != null ? ENTITY_SCOPED_METADATA_ROOTS.get(input.sapProduct) : undefined;
  return scope === "service" && scopedRoot !== undefined && input.servicePath.toLowerCase() === scopedRoot;
}

export const DATASET_NEEDED_DETAIL =
  "Set the dataset (for example cust_TravelRequest) on the interface, then verify again: on /odata/v2 SuccessFactors describes one dataset at a time, and the description of the whole tenant is too large to read.";

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

/**
 * The EDMX root's start tag. Bounded and `<`-free for the same reason as
 * ENTITY_SET_TAG (tdd-connector.ts): `[^>]*` let every `<Edmx` in a hostile
 * body scan to its end, which is quadratic over the 8 MB a verify reads.
 */
const EDMX_OPEN = /<(?:[A-Za-z_][\w.-]{0,64}:)?Edmx\b([^<>]{0,4096})>/;

/**
 * Root element `<…:Edmx Version="1.0">` → V2; "4.0" / "4.01" → V4; otherwise null.
 *
 * Reads only the first METADATA_SNIFF_BYTES: the root element is at the top
 * of the document — the probe's EDMX check already requires it there — and
 * nothing past it can change the answer.
 */
export function edmxODataVersion(xml: string): ODataVersion | null {
  const attrs = EDMX_OPEN.exec(xml.slice(0, METADATA_SNIFF_BYTES))?.[1] ?? "";
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
    /** The interface's product: decides whole-service or one-dataset metadata (see the header). */
    sapProduct?: string | null;
  },
  fetchImpl: typeof fetch = fetch,
): Promise<ServiceVerifyResult> {
  const target = metadataTarget(input);
  const datasetNeeded = isTenantWideRootAskedWhole(input, target.scope);
  const r = await fetchMetadataDocument(input.connection, target.path, fetchImpl, {
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
          ? target.scope === "entitySet"
            ? `The SAP system has no dataset called "${input.entitySet}" under this service path. Check the name in the system's OData API Data Dictionary (names are case-sensitive), and the path (/odata/v2).`
            : "The SAP system has no service at this path. Check it against the service binding in ADT (Service URL) or /IWFND/MAINT_SERVICE, and that the service is published."
          : status === "TIMEOUT" && datasetNeeded
            ? DATASET_NEEDED_DETAIL
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
      detail: datasetNeeded
        ? DATASET_NEEDED_DETAIL
        : `The service description is larger than ${VERIFY_MAX_METADATA_BYTES / (1024 * 1024)} MB, so it was not read in full and the datasets cannot be listed. Ask for a smaller service (one service binding per business object).`,
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
