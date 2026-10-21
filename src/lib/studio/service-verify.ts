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

import { LIMITS } from "@/lib/contracts/budget";
import { MAX_LISTED_DATASETS, readDatasetsSliced, type DatasetSummary } from "@/lib/contracts/datasets";
import { compileInEnvelope, VERIFY_WAIT_MS, withEnvelopeSlot } from "@/lib/contracts/envelope";
import type { CompiledService, RenderSubject } from "@/lib/contracts/pipeline";
import type { ResolvedSapConnection } from "@/lib/sap-public/connection-resolver";
import type { ODataVersion } from "@/lib/sap-public/service-path";
import { DEFAULT_TIMEOUT_MS, fetchMetadataDocument, MAX_TIMEOUT_MS, METADATA_SNIFF_BYTES } from "@/lib/studio/connection-health";

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
export const VERIFY_MAX_METADATA_BYTES = LIMITS.sourceBytes;
/** How many entity-set names a verify lists, and stores on the interface (datasets.ts). */
export const MAX_STORED_ENTITY_SETS = MAX_LISTED_DATASETS;

export type ServiceVerifyStatus =
  | "OK"
  | "ENTITY_SET_MISSING"
  | "VERSION_MISMATCH"
  | "METADATA_TOO_LARGE"
  | "UNAUTHORIZED"
  | "NOT_FOUND"
  | "TIMEOUT"
  /** The organisation already has verifies in flight, past its share (envelope.ts): nothing was read. */
  | "BUSY"
  | "ERROR";

export interface ServiceVerifyResult {
  status: ServiceVerifyStatus;
  /** True only for OK: the description was read, matched, and names the dataset. */
  verified: boolean;
  /** One plain sentence. Never a URL or a host. */
  detail: string;
  httpStatus: number | null;
  durationMs: number;
  /**
   * Entity-set names the description declares, de-duplicated, in document
   * order: the first MAX_STORED_ENTITY_SETS of them (datasets.ts).
   */
  entitySets: string[];
  /** How many distinct entity sets the description declares in all. */
  entitySetCount: number;
  detectedODataVersion: ODataVersion | null;
  /** On ENTITY_SET_MISSING, a set whose name differs only in case. */
  suggestedEntitySet: string | null;
  /** The status the console-read audit row records. */
  auditStatus: number;
  failureReason: string | null;
  /**
   * What compiling the description (P1.3) gave, when one was read in full;
   * absent when none was. A description the compiler refuses — or one the
   * envelope stopped (RESOURCE_LIMIT, BUSY, UNAVAILABLE) — still verifies as
   * it did before the compiler existed: the dataset list then comes from the
   * older reader, and the refusal is said here.
   */
  compiled?: CompiledService;
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

/**
 * The compile, IN THE ENVELOPE (envelope.ts): a worker with its own capped
 * heap and stack and a deadline, so a description built to be expensive
 * ends its own worker and never this request's thread or the process. What
 * comes back is a refusal or the bounded summary the verify needs
 * (pipeline.ts), with the interface's dataset already sliced, digested and
 * measured for every read path. Refuses, never rejects: a description the
 * compiler refuses is read by the older reader in the same job, inside the
 * envelope, as before the compiler (pipeline.ts, compileJob).
 */
function compileOrRefuse(
  body: string,
  entitySet: string | null,
  subject: RenderSubject | null,
  tenant: string | null,
  deadlineAt: number,
): Promise<CompiledService> {
  return compileInEnvelope(body, entitySet, subject, tenant, deadlineAt);
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

export interface VerifyServiceInput {
  connection: ResolvedSapConnection;
  servicePath: string;
  declaredVersion: ODataVersion | null;
  entitySet: string | null;
  /** The interface's product: decides whole-service or one-dataset metadata (see the header). */
  sapProduct?: string | null;
  /**
   * The interface the dataset's contract would be recorded for, so the
   * compile renders and measures every read path's output for it inside
   * the envelope (pipeline.ts). Omitted, a stand-in of the same shape.
   */
  subject?: RenderSubject | null;
  /** The organisation verifying: its share of verifies and of the compiler's envelope (envelope.ts). */
  organizationId?: string | null;
  /**
   * When the request must have its answer (ms since the epoch): the turn's
   * wait and the compile are bounded by it (see VERIFY_REQUEST_BUDGET_MS);
   * omitted, VERIFY_REQUEST_BUDGET_MS from now.
   */
  deadlineAt?: number | null;
}

/**
 * ONE DEADLINE FOR THE WHOLE VERIFY (structural hardening round 4). The
 * route's platform limit (maxDuration, 60 s) was shorter than the waits the
 * envelope allows in sequence — the verify turn (20 s), the SAP read (up to
 * 30 s), the compile slot (15 s) and the compile (15 s), the diff at record
 * time (10 s + 10 s, up to three times) — so a slow SAP and a busy compiler
 * had the platform cut the request off with a 504, nothing answered, audited
 * or recorded. Now the verify has this much from the moment the request
 * starts, and every wait and run inside it is clamped to what is left: the
 * turn waits only while the SAP read would still fit after it, the SAP read
 * keeps its own timeout, and the compile and the record's diff get the rest;
 * past it they are refused BUSY, the contract is NOT_COMPILED, and the
 * verify answers as it did before the compiler existed. What remains of the
 * platform's limit (VERIFY_RESPONSE_MARGIN_MS) is for a worker cut at the
 * deadline to exit and for the route's own writes.
 */
export const VERIFY_REQUEST_BUDGET_MS = 45_000;
/** What the route keeps beyond the verify's budget: a worker's exit grace (5 s) and the route's own writes and audit. */
export const VERIFY_RESPONSE_MARGIN_MS = 15_000;

/** The SAP read's own timeout for this connection (connection-health.ts). */
function fetchTimeoutMs(connection: ResolvedSapConnection): number {
  return Math.min(connection.timeoutMs ?? DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS);
}

export const VERIFY_BUSY_DETAIL =
  "This organisation is already verifying other services. Verify again when those have answered.";

/**
 * ONE ORGANISATION'S VERIFIES TAKE TURNS, BEFORE ANYTHING IS READ
 * (structural hardening round 3). A verify reads up to 8 MiB of description
 * and works on it; with no gate, one builder sent twenty at once, seventeen
 * were refused a compile slot and each then read the whole description on
 * this thread. Now a verify holds a turn (envelope.ts, the `verify` pool)
 * from before SAP is asked for the description until it has answered, a few
 * more waiting, and past that BUSY at once — nothing fetched, nothing read.
 * Across organisations it is the compile slots behind it that bound the work.
 *
 * SEVERAL TURNS PER ORGANISATION, NOT ONE (structural hardening round 4).
 * The turn is held across the SAP read, so with one per organisation a
 * single hung system — a DEV tenant running to its 30 s timeout — made every
 * teammate's verify of a healthy system wait 20 s and answer BUSY, SAP never
 * asked. An organisation now holds ENVELOPE_VERIFY_TENANT_RUNNING turns: what
 * the turn bounds is the descriptions it holds in flight (that many × 8 MiB),
 * and a slow system takes one of them, not all.
 */
export async function verifyServiceMetadata(input: VerifyServiceInput, fetchImpl: typeof fetch = fetch): Promise<ServiceVerifyResult> {
  const started = Date.now();
  const deadlineAt = input.deadlineAt ?? started + VERIFY_REQUEST_BUDGET_MS;
  // Wait for a turn only while the SAP read, at its own timeout, would still end inside the verify's deadline.
  const wait = Math.max(0, Math.min(VERIFY_WAIT_MS, deadlineAt - Date.now() - fetchTimeoutMs(input.connection)));
  const turn = await withEnvelopeSlot("verify", input.organizationId ?? null, wait, () => verifyOnce(input, fetchImpl, deadlineAt));
  if (turn.ok) return turn.value;
  return {
    status: "BUSY",
    verified: false,
    detail: VERIFY_BUSY_DETAIL,
    httpStatus: null,
    durationMs: Date.now() - started,
    entitySets: [],
    entitySetCount: 0,
    detectedODataVersion: null,
    suggestedEntitySet: null,
    // Refused here, before SAP was asked: what a throttle answers.
    auditStatus: 429,
    failureReason: "VERIFY_BUSY",
  };
}

async function verifyOnce(input: VerifyServiceInput, fetchImpl: typeof fetch, deadlineAt: number): Promise<ServiceVerifyResult> {
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
          : status === "TIMEOUT" && datasetNeeded && r.signedIn
            ? // The TENANT did not answer in time: what happened, then the
              // likely cause. A timeout of the token endpoint never reached
              // the tenant, so the dataset is not its cause and its own
              // sentence stays (review round 5).
              `${r.detail} ${DATASET_NEEDED_DETAIL}`
            : r.detail,
      entitySets: [],
      entitySetCount: 0,
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
      entitySetCount: 0,
      detectedODataVersion: edmxODataVersion(r.body),
      suggestedEntitySet: null,
      auditStatus: 200,
      failureReason: "METADATA_TOO_LARGE",
    };
  }

  /*
   * COMPILED, ONCE, HERE (P1.3). The verify has just read the whole
   * description; compiling it now is what lets the contract be recorded at
   * verification time and never on a broker call. The compiler is a bounded
   * XML parser, not a regex scan: when it can read the document, the dataset
   * list and the version come from it. When it cannot (a document it refuses
   * as malformed or hostile), the verify answers exactly as it did before —
   * the older readers below still list the datasets — so no service that
   * verified yesterday stops verifying today.
   */
  const compiled = await compileOrRefuse(r.body, input.entitySet || null, input.subject ?? null, input.organizationId ?? null, deadlineAt);
  /*
   * THE DATASETS, AS A BOUNDED SUMMARY (datasets.ts, structural hardening
   * round 3): the first MAX_STORED_ENTITY_SETS names, how many there are,
   * and whether the interface's dataset is one — taken in the envelope
   * whether the compiler read the description or refused it (a singleton is
   * one record, not a dataset the broker can page through; a name
   * PostgreSQL cannot hold is no dataset anyone can address). Only when the
   * envelope never ran the job (no free slot, no worker) does this thread
   * read them, in slices that give the event loop back between them.
   */
  const datasets: DatasetSummary =
    compiled.ok ? compiled.datasets : (compiled.datasets ?? (await readDatasetsSliced(r.body, input.entitySet || null)));
  const entitySets = datasets.names;
  const entitySetCount = datasets.count;
  const detected = compiled.ok ? compiled.odataVersion : edmxODataVersion(r.body);

  if (input.declaredVersion !== null && detected !== null && detected !== input.declaredVersion) {
    return {
      ...base,
      status: "VERSION_MISMATCH",
      verified: false,
      detail: `This service describes itself as ${versionLabel(detected)}, but the interface says ${input.declaredVersion}. Change the version, then verify again.`,
      entitySets,
      entitySetCount,
      detectedODataVersion: detected,
      suggestedEntitySet: null,
      auditStatus: 200,
      compiled,
    };
  }

  if (input.entitySet !== null && input.entitySet !== "" && !datasets.hasEntitySet) {
    // OData names are case-sensitive, so a near miss is a suggestion, never a match.
    const suggestion = datasets.suggestion;
    return {
      ...base,
      status: "ENTITY_SET_MISSING",
      verified: false,
      detail:
        `The service answered, but it has no dataset called "${input.entitySet}".` +
        (suggestion ? ` Did you mean "${suggestion}"? Dataset names are case-sensitive.` : " Pick one of the datasets it lists."),
      entitySets,
      entitySetCount,
      detectedODataVersion: detected,
      suggestedEntitySet: suggestion,
      auditStatus: 200,
      compiled,
    };
  }

  return {
    ...base,
    status: "OK",
    verified: true,
    detail:
      entitySetCount === 0
        ? "The service answered with its description, but it declares no datasets."
        : input.entitySet
          ? `The service answered with its description and offers the dataset "${input.entitySet}" (${entitySetCount} dataset${entitySetCount === 1 ? "" : "s"} in all).`
          : `The service answered with its description and offers ${entitySetCount} dataset${entitySetCount === 1 ? "" : "s"}. Pick one for this interface.`,
    entitySets,
    entitySetCount,
    detectedODataVersion: detected,
    suggestedEntitySet: null,
    auditStatus: 200,
    compiled,
  };
}
