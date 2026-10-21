/**
 * The northbound OpenAPI — in 3.1.0 and 3.0.3 — for one solution's interfaces
 * (P1.3).
 *
 * IT DESCRIBES COREEDGE, NOT SAP. Every path is a CoreEdge northbound route a
 * developer's application calls with its own token; SAP's host, service path
 * and protocol never appear. What comes from SAP is the SHAPE of the records,
 * compiled from the service's own description when there is one (the contract
 * snapshot), from sampled rows when there is not, and stated as unknown when
 * there is neither.
 *
 * EVERY OPERATION IT ALLOWS, AND ONLY THOSE. An interface carries one
 * operation. A READ interface is served by GET …/data; a CREATE interface by
 * POST …/data/write (the broker refuses to read through a write interface,
 * and serves no update yet). What the broker does not serve is not drawn as a
 * path — a path in a contract file is a promise — but every operation is
 * listed under `x-coreedge-operations` with whether CoreEdge serves it,
 * whether SAP's description allows it, and the environments whose approved
 * grants cover it. When P1.4 (get by key, $filter, $select, $skip) and P2.4
 * (update, delete) land, BROKER_OPERATIONS changes and the paths follow.
 *
 * EVERY HEADER AND EVERY ERROR. Bearer auth; the write key and the
 * Idempotency-Key on writes; the correlation id, the request id and the
 * rate-limit headers on every answer; Retry-After where the broker sends it;
 * the error envelope with every code the broker can send, per status, and the
 * internal refusal reasons behind them (northbound-errors.ts).
 *
 * EVERY VERSION AND BOTH PATHS (P1.10). The documents list both base paths in
 * `servers` — the original first, because a generator picks the first and
 * every deployment serves it, the versioned (/api/northbound/v1) second: one
 * implementation serves both (see northboundServers). Every
 * operation takes the optional CoreEdge-Version request header and every
 * answer names its version in the same header (with Deprecation, Sunset and
 * Link once a deprecation is announced); a version the deployment does not
 * serve is a 400 UNSUPPORTED_VERSION. GET /versions, the changelog, is drawn
 * like any other route. The versions come from version-policy.ts, so the
 * document cannot name one the broker does not have.
 *
 * Pure and deterministic: the same input renders the same document.
 */

import { chargeJson, jsonBytesUpTo, jsonText, LIMITS, UNLIMITED, type OutputBudget } from "@/lib/contracts/budget";
import { semverParts } from "@/lib/contracts/diff";
import type { InterfaceContract } from "@/lib/contracts/ir";
import { buildContractSchemas, nullableRef30, type JsonSchema, type SchemaDialect } from "@/lib/contracts/json-schema";
import { nameAllocator, toTypeName } from "@/lib/contracts/names";
import { ALL_ERROR_CODES, NORTHBOUND_ERROR_CODES, NORTHBOUND_REFUSAL_REASONS } from "@/lib/contracts/northbound-errors";
import type { NorthboundErrorCode } from "@/lib/northbound/respond";
import {
  CHANGELOG_PATH,
  NORTHBOUND_API_VERSIONS,
  UNVERSIONED_BASE_PATH,
  V1_BASE_PATH,
  VERSION_HEADER,
} from "@/lib/northbound/version-policy";

export type OpenApiVersion = "3.1.0" | "3.0.3";

/** What the broker serves today, by operation. The single place a new operation is switched on. */
export const BROKER_OPERATIONS = {
  list: { served: true, query: ["limit"] as readonly string[] },
  getByKey: { served: false, roadmap: "P1.4" },
  create: { served: true },
  update: { served: false, roadmap: "P2.4" },
  delete: { served: false, roadmap: "P2.4" },
} as const;

/** Every registered version, oldest first, and the newest (the documents' example). */
const VERSION_LIST = NORTHBOUND_API_VERSIONS.map((v) => v.version).join(", ");
const NEWEST_VERSION = NORTHBOUND_API_VERSIONS[NORTHBOUND_API_VERSIONS.length - 1]!.version;

/** The broker's own bound on ?limit (read.ts clamps to it). */
export const READ_LIMIT_MAX = 100;
export const READ_LIMIT_DEFAULT = 10;

/** A schema captured from sampled rows (schema-capture.ts), as served — see servedResponseSchema. */
export type SampledSchema = {
  properties: Record<string, { type?: string; format?: string; nullable?: boolean }>;
  required?: string[];
} & Record<string, unknown>;

export type ContractForDoc =
  | {
      source: "metadata";
      contract: InterfaceContract;
      semver: string;
      snapshotId?: string;
      contentHash?: string;
      compiledAt?: string;
    }
  | { source: "sampled"; schema: SampledSchema }
  | { source: "none"; note?: string };

export interface InterfaceForDoc {
  id: string;
  name: string;
  externalId: string;
  sapProduct: string;
  /** READ | CREATE | UPDATE */
  operation: string;
  /** READ | WRITE */
  mode: string;
  entitySet: string | null;
  version: number;
  status?: string;
  contract: ContractForDoc;
  /** Approved, live grants on this interface. Omitted: not known to the caller (kit preview). */
  grants?: readonly { operation: string; environment: string }[];
}

export interface NorthboundDocInput {
  version: OpenApiVersion;
  baseUrl: string;
  title: string;
  description: string;
  infoVersion: string;
  interfaces: readonly InterfaceForDoc[];
  /** Include GET /interfaces (discovery) — the per-solution document does. */
  discovery?: boolean;
  /** Text made safe for a document someone else renders (the scaffold's safeName). */
  safe?: (s: string) => string;
  /**
   * The document's budget, charged with each interface's part (compact) as it
   * is built: past it the build stops (BudgetExceeded) at the interface that
   * passed it, never building the rest (solutions/[id]/openapi).
   */
  budget?: OutputBudget;
}

type Obj = Record<string, unknown>;

export interface ServerEntry {
  url: string;
  description?: string;
}

/**
 * The `servers` a northbound document lists for a base URL (P1.10).
 *
 * A base URL on either northbound path names a deployment: the document then
 * lists the original `/api/northbound` first — the one server generators
 * pick by default — and `/api/northbound/v1` second. Not v1 first, yet (P1
 * wave A review): v1 ships in this release, and the deployment an Instant
 * Rollback returns to does not serve it, so a client generated against it
 * would get a 404 page on every call after a rollback. v1 moves first in a
 * later release, once a deployment that serves it is the rollback target.
 * Any other base URL (a local mock, a proxy in front of CoreEdge) is listed
 * as given: its paths are not ours to rewrite.
 */
export function northboundServers(baseUrl: string): ServerEntry[] {
  const trimmed = baseUrl.replace(/\/+$/, "");
  const origin = trimmed.endsWith(V1_BASE_PATH)
    ? trimmed.slice(0, -V1_BASE_PATH.length)
    : trimmed.endsWith(UNVERSIONED_BASE_PATH)
      ? trimmed.slice(0, -UNVERSIONED_BASE_PATH.length)
      : null;
  if (origin === null) return [{ url: baseUrl }];
  return [
    {
      url: `${origin}${UNVERSIONED_BASE_PATH}`,
      description: "The original path. Every deployment serves it.",
    },
    {
      url: `${origin}${V1_BASE_PATH}`,
      description:
        "The versioned path: the same implementation, the same versions and the same credentials. Generated clients move to it in a later release.",
    },
  ];
}

const H = {
  correlation: "CorrelationId",
  request: "RequestId",
  rateRemaining: "RateLimitRemaining",
  retryAfter: "RetryAfter",
  interfaceStatus: "InterfaceStatus",
  replayed: "IdempotencyReplayed",
  cache: "CacheControl",
  version: "CoreEdgeVersion",
  deprecation: "Deprecation",
  sunset: "Sunset",
  link: "Link",
} as const;

/** Component schemas every document defines beside its interfaces' own. */
const DOCUMENT_SCHEMA_NAMES = ["InterfaceRef", "ContractDocument", "Error", "Discovery", "Versions"] as const;

/**
 * A generated document is indented while it is small enough to be read, and
 * compact past this: indentation is the larger part of a large document —
 * most lines of a schema are a few characters of content after a dozen
 * spaces — and a document this large is read by a generator, not a person.
 * So a document's size is linear in its contract with the compact constant
 * (hostile-input review round 2), and every real one stays readable.
 */
export const PRETTY_DOCUMENT_MAX_BYTES = LIMITS.prettyDocument;

/**
 * The `info.version` of a document carrying several interfaces (the
 * per-solution document): a semantic version that moves the way its
 * interfaces' contracts move, with `build` as build metadata.
 *
 *   major  1 + the majors each compiled contract has gained past 1
 *   minor  the compiled contracts' minors, the interface version of each
 *          interface without one (as the kit numbers it), and one per
 *          interface past the first (adding one is additive)
 *   patch  the compiled contracts' patches
 *
 * So a document of one compiled interface is that contract's version, and a
 * major bump of any interface's contract raises the document's major. It was
 * `1.0.0+<digest>` whatever changed, and SemVer ignores build metadata for
 * precedence, so a field removed from an interface did not change the
 * document's version at all (hostile-input review round 2). What the sum
 * cannot see is an interface leaving the document (DEPRECATED, or moved to
 * another solution): that lowers it, and the digest still changes.
 */
export function multiInterfaceInfoVersion(
  interfaces: readonly { version: number; contract: ContractForDoc }[],
  build: string,
): string {
  let major = 1;
  let minor = Math.max(0, interfaces.length - 1);
  let patch = 0;
  for (const i of interfaces) {
    if (i.contract.source === "metadata") {
      const [a, b, c] = semverParts(i.contract.semver);
      major += Math.max(0, a - 1);
      minor += b;
      patch += c;
    } else {
      minor += i.version;
    }
  }
  return `${major}.${minor}.${patch}+${build}`;
}

/**
 * The document as JSON: indented when small (PRETTY_DOCUMENT_MAX_BYTES),
 * compact otherwise — written by the one budgeted writer (budget.ts), every
 * byte charged to `budget` as it is written, so a document past its budget
 * is refused (BudgetExceeded) without ever being built in full. Whether it is
 * small is measured first, by the same writer, stopping at the threshold.
 */
export function documentJson(doc: unknown, budget: OutputBudget = UNLIMITED()): string {
  const pretty = jsonBytesUpTo(doc, PRETTY_DOCUMENT_MAX_BYTES) <= PRETTY_DOCUMENT_MAX_BYTES;
  return jsonText(doc, budget, pretty ? { indent: 2 } : {});
}

export function buildNorthboundOpenApi(input: NorthboundDocInput): Obj {
  const dialect: SchemaDialect = input.version === "3.1.0" ? "2020-12" : "oas30";
  const safe = input.safe ?? ((s: string) => s);
  const ref = (kind: "schemas" | "headers" | "parameters" | "responses", name: string) => ({
    $ref: `#/components/${kind}/${name}`,
  });
  /** Nullable. Every `$ref` passed here names an object schema (a record). */
  const nullableOf = (s: JsonSchema): JsonSchema => {
    if (dialect === "oas30") return "$ref" in s ? nullableRef30(s, "object") : { ...s, nullable: true };
    if ("$ref" in s) return { anyOf: [s, { type: "null" }] };
    return { ...s, type: [s.type as string, "null"] };
  };

  const schemas: Record<string, JsonSchema> = {};
  const paths: Record<string, Obj> = {};
  // The document's own schemas are named first: a dataset called Error must
  // not overwrite the error envelope.
  const stemFor = nameAllocator(DOCUMENT_SCHEMA_NAMES);
  const docInterfaces: Obj[] = [];

  const header = (name: string) => ({ [name]: ref("headers", headerComponent(name)) });
  const headerComponent = (name: string): string =>
    ({
      "x-correlation-id": H.correlation,
      "X-Request-Id": H.request,
      "X-RateLimit-Remaining": H.rateRemaining,
      "Retry-After": H.retryAfter,
      "x-coreedge-interface-status": H.interfaceStatus,
      "Idempotency-Replayed": H.replayed,
      "Cache-Control": H.cache,
      [VERSION_HEADER]: H.version,
      Deprecation: H.deprecation,
      Sunset: H.sunset,
      Link: H.link,
    })[name]!;
  /** What every answer carries but a version refusal: the version that served it (P1.10). */
  const versionHeaders = () => ({
    ...header(VERSION_HEADER),
    ...header("Deprecation"),
    ...header("Sunset"),
    ...header("Link"),
  });
  /** What the edge and the route put on every answer, a version refusal included. */
  const baseHeaders = () => ({
    ...header("x-correlation-id"),
    ...header("X-Request-Id"),
    ...header("X-RateLimit-Remaining"),
    ...header("Cache-Control"),
  });
  const commonHeaders = () => ({ ...baseHeaders(), ...versionHeaders() });

  /** One error response: its codes, in the description and as x-coreedge-error-codes. */
  const errorResponse = (status: number, codes: readonly NorthboundErrorCode[], lead: string, retryAfter = false): Obj => ({
    description: `${lead} Codes: ${codes.join(", ")}.`,
    headers: { ...commonHeaders(), ...(retryAfter ? header("Retry-After") : {}) },
    content: { "application/json": { schema: ref("schemas", "Error") } },
    "x-coreedge-error-codes": codes.map((c) => ({ code: c, status, action: NORTHBOUND_ERROR_CODES[c].action })),
  });
  /** A 400 an operation already documents, with the version refusal beside its own codes. */
  const UNSUPPORTED_VERSION_LEAD =
    "Or UNSUPPORTED_VERSION: the CoreEdge-Version header names a version this deployment does not serve (unknown, or retired at its Sunset date); error.supportedVersions lists what may be sent, and nothing ran.";
  const badRequest = (codes: readonly NorthboundErrorCode[], lead: string): Obj =>
    errorResponse(400, [...codes, "UNSUPPORTED_VERSION"], `${lead} ${UNSUPPORTED_VERSION_LEAD}`);

  // The answers every operation shares, defined once (components.responses).
  const sharedResponses: Record<string, Obj> = {
    UnsupportedVersion: {
      // No CoreEdge-Version here: no version served this answer.
      description:
        "UNSUPPORTED_VERSION: the CoreEdge-Version header names a version this deployment does not serve (unknown, or retired at its Sunset date). Refused before anything else; error.supportedVersions lists what may be sent. Send one of them, or omit the header. Codes: UNSUPPORTED_VERSION.",
      headers: baseHeaders(),
      content: { "application/json": { schema: ref("schemas", "Error") } },
      "x-coreedge-error-codes": [{ code: "UNSUPPORTED_VERSION", status: 400, action: NORTHBOUND_ERROR_CODES.UNSUPPORTED_VERSION.action }],
    },
    Unauthenticated: errorResponse(401, ["UNAUTHENTICATED"], "Missing, unknown, revoked, expired or rotated-out client token — one answer for all of them."),
    // RATE_LIMIT_EXCEEDED is the edge's ordinary per-address bucket: the only
    // 429 GET /versions, a call without a bearer, or any call with
    // per-credential limits switched off can meet (middleware.ts).
    RateLimited: errorResponse(
      429,
      ["RATE_LIMITED", "RATE_LIMITED_ADDRESS", "RATE_LIMIT_EXCEEDED"],
      "Rate limited: this credential's budget, or the caller's address.",
      true,
    ),
    LimiterUnavailable: errorResponse(503, ["LIMITER_UNAVAILABLE"], "The rate limiter could not be asked; nothing reached SAP.", true),
    Internal: errorResponse(500, ["INTERNAL"], "CoreEdge itself failed."),
  };
  const commonErrors = (): Record<string, Obj> => ({
    "401": ref("responses", "Unauthenticated"),
    "429": ref("responses", "RateLimited"),
    "503": ref("responses", "LimiterUnavailable"),
    "5XX": ref("responses", "Internal"),
  });

  for (const iface of input.interfaces) {
    // What this interface adds, charged to the build budget before it joins the document.
    const own = { schemas: {} as Record<string, JsonSchema>, paths: {} as Record<string, Obj> };
    const stem = stemFor(toTypeName(iface.entitySet ?? iface.name));
    const tag = stem;
    const recordSchemaName = stem;
    let createSchemaName: string | null = null;
    let sapCreatable: boolean | null = null;
    let sapUpdatable: boolean | null = null;
    let sapDeletable: boolean | null = null;

    const c = iface.contract;
    if (c.source === "metadata") {
      const built = buildContractSchemas(c.contract, { dialect, stem, ref: (n) => `#/components/schemas/${n}` });
      Object.assign(own.schemas, built.schemas);
      createSchemaName = built.names.create;
      const caps = c.contract.entitySet.capabilities;
      sapCreatable = caps.creatable !== false;
      sapUpdatable = caps.updatable !== false;
      sapDeletable = caps.deletable !== false;
    } else if (c.source === "sampled") {
      own.schemas[recordSchemaName] = sampledRecord(c.schema, dialect);
    } else {
      own.schemas[recordSchemaName] = {
        type: "object",
        description: c.note
          ? `No captured response describes this contract, so its fields are not described. ${c.note}`
          : "No live response has been captured for this interface yet, and its service description has not been compiled, so its fields are not described. Verify the service, or run it in the Test Console and capture a schema, then regenerate to get a precise contract.",
        additionalProperties: true,
      };
    }

    const isRead = iface.mode !== "WRITE";
    const isCreate = iface.mode === "WRITE" && iface.operation === "CREATE";
    const grantsFor = (ops: readonly string[]) =>
      iface.grants === undefined
        ? null
        : [...new Set(iface.grants.filter((g) => ops.includes(g.operation)).map((g) => g.environment))].sort();

    if (isRead) {
      const resultName = `${stem}_ReadResult`;
      own.schemas[resultName] = {
        type: "object",
        required: ["data"],
        properties: {
          data: {
            type: "object",
            // Every field the broker sends on a 200, named. `empty` is the one
            // that tells a successful read of nothing apart from a failure.
            required: ["records", "count", "empty", "note", "interface"],
            properties: {
              records: { type: "array", items: ref("schemas", recordSchemaName) },
              count: { type: "integer", description: "records.length." },
              empty: {
                type: "boolean",
                description: "True when the service answered successfully and had nothing to return. This is data, not a failure.",
              },
              note: { type: "string", description: "A one-line, human-readable account of what came back." },
              interface: ref("schemas", "InterfaceRef"),
            },
          },
        },
      };
      own.paths[`/interfaces/${iface.id}/data`] = {
        get: {
          operationId: `read${stem}`,
          tags: [tag],
          summary: `Read ${safe(iface.entitySet ?? iface.name)}`,
          description:
            "Reads records through CoreEdge from the customer's SAP system, through the connection bound to this credential's environment. " +
            "An empty result is a 200 with an empty array and MUST be treated as 'no records', which is different from 'not set up' (403) and from an error (5xx).",
          parameters: [ref("parameters", "Limit"), ref("parameters", "CoreEdgeVersion")],
          responses: {
            "200": {
              description: "Records, or an empty array meaning 'no records' — not an error.",
              headers: { ...commonHeaders(), ...header("x-coreedge-interface-status") },
              content: { "application/json": { schema: ref("schemas", resultName) } },
            },
            "400": badRequest(["VALIDATION_ERROR"], "The interface cannot be read as configured: it names no entity set, or its service could not be resolved. Fix the configuration in Studio — do not retry."),
            "403": errorResponse(403, ["FORBIDDEN", "CONNECTION_NOT_CONFIGURED"], "Not set up: no approved access grant for this interface in this environment, a deprecated interface, or the customer's connection is not bound yet."),
            "404": errorResponse(404, ["NOT_FOUND"], "NOT_FOUND. No interface with this id belongs to the solution this token was issued for, or the tenant answered that the interface's entity set does not exist. A configuration fault — do not retry."),
            ...commonErrors(),
            "502": errorResponse(502, ["UPSTREAM_ERROR"], "The tenant or the connection's token endpoint failed. Distinct from an empty result; retrying may help."),
            "504": errorResponse(504, ["UPSTREAM_TIMEOUT"], "The tenant or the connection's token endpoint did not answer in time; retrying may help."),
          },
        },
      };
    }

    if (isCreate && sapCreatable !== false) {
      const resultName = `${stem}_CreateResult`;
      const bodyName = `${stem}_CreateRequest`;
      const recordBody: JsonSchema = createSchemaName
        ? ref("schemas", createSchemaName)
        : { type: "object", additionalProperties: true, description: "The record to create. Its fields are not described: the service's description has not been compiled." };
      own.schemas[bodyName] = {
        type: "object",
        required: ["record"],
        properties: {
          record: recordBody,
          entity: {
            type: "string",
            maxLength: 200,
            deprecated: true,
            description:
              "Accepted for older clients, never obeyed: the dataset is part of the interface's definition. Sent and different from it, the write is refused with 400.",
          },
        },
      };
      own.schemas[resultName] = {
        type: "object",
        required: ["data"],
        properties: {
          data: {
            type: "object",
            required: ["created", "record", "location", "interface", "note"],
            properties: {
              created: { type: "boolean", enum: [true] },
              record: nullableOf(ref("schemas", recordSchemaName)),
              location: nullableOf({
                type: "string",
                description: "The created record's identity after the service root, e.g. /A_BusinessPartner('1000123'). Never a host.",
              }),
              interface: ref("schemas", "InterfaceRef"),
              note: { type: "string" },
            },
          },
        },
      };
      own.paths[`/interfaces/${iface.id}/data/write`] = {
        post: {
          operationId: `create${stem}`,
          tags: [tag],
          summary: `Create a ${safe(iface.entitySet ?? iface.name)} record`,
          description:
            "Creates one record in the customer's SAP system. Requires the solution's write key beside the bearer token, and an Idempotency-Key: a retry with the same key and payload is answered from the stored outcome (Idempotency-Replayed: true) and never writes twice.",
          security: [{ bearerAuth: [], writeKey: [] }],
          parameters: [ref("parameters", "IdempotencyKey"), ref("parameters", "CoreEdgeVersion")],
          requestBody: { required: true, content: { "application/json": { schema: ref("schemas", bodyName) } } },
          responses: {
            "201": {
              description: "Created. A replay of an earlier outcome under the same Idempotency-Key carries Idempotency-Replayed: true and the original status and body.",
              headers: { ...commonHeaders(), ...header("Idempotency-Replayed") },
              content: { "application/json": { schema: ref("schemas", resultName) } },
            },
            "400": badRequest(["VALIDATION_ERROR"], "The request or the interface's definition cannot be used: a missing or malformed Idempotency-Key, a body that is not { record }, an `entity` that differs from the interface's dataset, no dataset, or an own service not yet verified in this environment."),
            "403": errorResponse(403, ["FORBIDDEN", "CONNECTION_NOT_CONFIGURED"], "Not set up: a missing or invalid write key, no approved WRITE grant in this environment, an interface that is not ACTIVE, writes disabled on the connection, or the connection is not bound."),
            "404": errorResponse(404, ["NOT_FOUND"], "No such interface for this solution, or the dataset does not exist on the tenant."),
            "409": errorResponse(409, ["CONFLICT"], "The Idempotency-Key was used with a different payload or destination; or, with Retry-After, the first request under it is still running — retry with the same key.", true),
            "422": errorResponse(422, ["VALIDATION_ERROR"], "SAP rejected the record. Fix the payload; do not retry unchanged."),
            ...commonErrors(),
            "502": errorResponse(502, ["UPSTREAM_ERROR"], "The tenant or the token endpoint failed. Retry with the same Idempotency-Key."),
            "504": errorResponse(504, ["UPSTREAM_TIMEOUT"], "The tenant or the token endpoint did not answer in time. Retry with the same Idempotency-Key: the stored outcome answers if the first attempt landed."),
          },
        },
      };
    }

    own.paths[`/interfaces/${iface.id}/schema`] = {
      get: {
        operationId: `get${stem}Contract`,
        tags: [tag],
        summary: "Fetch this interface's contract",
        description:
          "The interface's request and response schemas, and where they came from (the service's own description, sampled rows, or none). Makes no SAP call.",
        parameters: [ref("parameters", "CoreEdgeVersion")],
        responses: {
          "200": {
            description: "The contract.",
            headers: commonHeaders(),
            content: { "application/json": { schema: ref("schemas", "ContractDocument") } },
          },
          "400": ref("responses", "UnsupportedVersion"),
          "404": errorResponse(404, ["NOT_FOUND"], "No such interface for this solution."),
          ...commonErrors(),
        },
      },
    };

    const contractInfo =
      c.source === "metadata"
        ? {
            source: "metadata",
            semver: c.semver,
            ...(c.snapshotId ? { snapshotId: c.snapshotId } : {}),
            ...(c.contentHash ? { contentHash: c.contentHash } : {}),
            ...(c.compiledAt ? { compiledAt: c.compiledAt } : {}),
            odataVersion: c.contract.odataVersion,
          }
        : { source: c.source };

    docInterfaces.push({
      id: iface.id,
      name: safe(iface.name),
      externalId: iface.externalId,
      entitySet: iface.entitySet,
      interfaceVersion: iface.version,
      ...(iface.status ? { status: iface.status } : {}),
      tag,
      contract: contractInfo,
      operations: {
        list: {
          served: BROKER_OPERATIONS.list.served && isRead,
          query: BROKER_OPERATIONS.list.query,
          ...(isRead ? {} : { note: "A write interface is not read through the data route." }),
          ...(isRead && grantsFor(["READ"]) !== null ? { grantedIn: grantsFor(["READ"]) } : {}),
        },
        getByKey: { served: false, roadmap: BROKER_OPERATIONS.getByKey.roadmap },
        create: {
          served: isCreate && sapCreatable !== false,
          ...(sapCreatable !== null ? { allowedBySap: sapCreatable } : {}),
          ...(iface.mode === "WRITE" && iface.operation !== "CREATE" ? { note: `This interface is configured to ${iface.operation}.` } : {}),
          ...(isCreate && grantsFor(["CREATE", "UPDATE"]) !== null ? { grantedIn: grantsFor(["CREATE", "UPDATE"]) } : {}),
        },
        update: {
          served: false,
          roadmap: BROKER_OPERATIONS.update.roadmap,
          ...(sapUpdatable !== null ? { allowedBySap: sapUpdatable } : {}),
        },
        delete: {
          served: false,
          roadmap: BROKER_OPERATIONS.delete.roadmap,
          ...(sapDeletable !== null ? { allowedBySap: sapDeletable } : {}),
        },
      },
    });
    if (input.budget) chargeJson({ ...own, entry: docInterfaces[docInterfaces.length - 1] }, input.budget);
    Object.assign(schemas, own.schemas);
    Object.assign(paths, own.paths);
  }

  if (input.discovery) {
    paths["/interfaces"] = {
      get: {
        operationId: "listInterfaces",
        summary: "List the interfaces this credential's solution defines",
        description: "Metadata only; makes no SAP call. `callable` says whether a data call would be made, and `refusal` why not.",
        parameters: [ref("parameters", "CoreEdgeVersion")],
        responses: {
          "200": {
            description: "This solution's interfaces.",
            headers: commonHeaders(),
            content: { "application/json": { schema: ref("schemas", "Discovery") } },
          },
          "400": ref("responses", "UnsupportedVersion"),
          ...commonErrors(),
        },
      },
    };
    schemas.Discovery = discoverySchema(dialect);
  }

  // The changelog (P1.10): no credential, and served on both paths like the rest.
  paths["/versions"] = {
    get: {
      operationId: "listApiVersions",
      summary: "List the northbound API versions and the deprecation policy",
      description:
        "The changelog as JSON: which versions exist, which this deployment serves, which one an unpinned request gets, and when each is deprecated or sunset. Needs no credential; reads nothing but the deployment's own version registry.",
      security: [],
      parameters: [ref("parameters", "CoreEdgeVersion")],
      responses: {
        "200": {
          description: "The versions, newest first.",
          headers: commonHeaders(),
          content: { "application/json": { schema: ref("schemas", "Versions") } },
        },
        "400": ref("responses", "UnsupportedVersion"),
        "429": ref("responses", "RateLimited"),
        "503": ref("responses", "LimiterUnavailable"),
      },
    },
  };
  schemas.Versions = versionsSchema(dialect);

  schemas.InterfaceRef = {
    type: "object",
    required: ["id", "name", "version"],
    properties: {
      id: { type: "string" },
      name: { type: "string" },
      version: { type: "integer", description: "The governed contract version that served this call." },
    },
  };
  schemas.ContractDocument = contractDocumentSchema(dialect);
  schemas.Error = {
    type: "object",
    required: ["error"],
    description: "The one error envelope every CoreEdge northbound answer uses. Branch on `code`; quote `correlationId`.",
    properties: {
      error: {
        type: "object",
        required: ["code", "message", "correlationId"],
        properties: {
          code: { type: "string", enum: ALL_ERROR_CODES },
          message: { type: "string", description: "A sentence for a person. Never a host, a URL or SAP's raw answer." },
          correlationId: { type: "string", description: "Identifies the audit row for this call." },
          requestedVersion: {
            type: "string",
            description: "UNSUPPORTED_VERSION only: the CoreEdge-Version value the request sent.",
          },
          supportedVersions: {
            type: "array",
            items: { type: "string" },
            description: "UNSUPPORTED_VERSION only: the versions this deployment serves, oldest (the default) first.",
          },
        },
      },
    },
    "x-coreedge-codes": Object.fromEntries(
      ALL_ERROR_CODES.map((code) => [code, { ...NORTHBOUND_ERROR_CODES[code], statuses: [...NORTHBOUND_ERROR_CODES[code].statuses] }]),
    ),
    "x-coreedge-refusal-reasons": NORTHBOUND_REFUSAL_REASONS.map((r) => ({ ...r })),
  };

  return {
    openapi: input.version,
    info: {
      title: input.title,
      version: input.infoVersion,
      description: input.description,
    },
    servers: northboundServers(input.baseUrl),
    security: [{ bearerAuth: [] }],
    tags: docInterfaces.map((i) => ({ name: i.tag as string, description: `${i.name as string} (${i.externalId as string})` })),
    paths,
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          description:
            "Per-solution client token issued in Developer Studio. During a rotation's overlap window the replaced key keeps working; after it, it answers 401 like any unknown key.",
        },
        writeKey: {
          type: "apiKey",
          in: "header",
          name: "X-CoreEdge-Write-Key",
          description: "The solution's write credential — a second secret, so a leaked read token cannot write.",
        },
      },
      responses: sharedResponses,
      parameters: {
        Limit: {
          name: "limit",
          in: "query",
          required: false,
          description: `How many records to return. The broker clamps it to 1–${READ_LIMIT_MAX}.`,
          schema: { type: "integer", minimum: 1, maximum: READ_LIMIT_MAX, default: READ_LIMIT_DEFAULT },
        },
        CoreEdgeVersion: {
          name: VERSION_HEADER,
          in: "header",
          required: false,
          description: `The northbound API version to be served, one of the versions this API has had (${VERSION_LIST}). Omit it to be served the oldest version still supported, which keeps code written before it behaving as it was written. A version this deployment does not serve is refused with 400 UNSUPPORTED_VERSION. The versions and their dates: GET /versions.`,
          schema: { type: "string", pattern: "^\\d{4}-(0[1-9]|1[0-2])$" },
          example: NEWEST_VERSION,
        },
        IdempotencyKey: {
          name: "Idempotency-Key",
          in: "header",
          required: true,
          description: "Required on every write. Reuse the same key when retrying the same write; a new write takes a new key. Kept for 24 hours.",
          schema: { type: "string", minLength: 8, maxLength: 255, pattern: "^[A-Za-z0-9_.:-]+$" },
        },
      },
      headers: {
        [H.correlation]: {
          description: "Quote this when raising a support request; it identifies the audit row for this call.",
          schema: { type: "string" },
        },
        [H.request]: { description: "The edge's own request id.", schema: { type: "string" } },
        [H.rateRemaining]: {
          description: "Calls left in this credential's current window (the smaller of its own budget and its address's backstop).",
          schema: { type: "integer", minimum: 0 },
        },
        [H.retryAfter]: { description: "Seconds to wait before retrying.", schema: { type: "integer", minimum: 0 } },
        [H.interfaceStatus]: {
          description:
            "Present, with the value DRAFT, when the interface is still a draft in Developer Studio. A draft is served — premature is not wrong — but its contract may still change. Absent once the interface is ACTIVE.",
          schema: { type: "string", enum: ["DRAFT"] },
        },
        [H.replayed]: {
          description: "\"true\" when this answer is the stored outcome of an earlier request under the same Idempotency-Key.",
          schema: { type: "string", enum: ["true"] },
        },
        [H.cache]: { description: "Always no-store: customer data never sits in a shared cache.", schema: { type: "string" } },
        [H.version]: {
          description:
            "The northbound API version that served this answer: the one the request pinned, or the default. Absent only on 400 UNSUPPORTED_VERSION, which no version served.",
          schema: { type: "string" },
        },
        [H.deprecation]: {
          description: `RFC 9745: present once the serving version's deprecation is announced, as @<unix seconds> of its deprecation date. Move to a newer version before its Sunset; ${CHANGELOG_PATH} says which.`,
          schema: { type: "string" },
        },
        [H.sunset]: {
          description: "RFC 8594: the HTTP-date from which the serving version is refused, once announced.",
          schema: { type: "string" },
        },
        [H.link]: {
          description: `With Deprecation or Sunset: <${CHANGELOG_PATH}>; rel="deprecation" and rel="sunset", the changelog.`,
          schema: { type: "string" },
        },
      },
      schemas,
    },
    "x-coreedge-interfaces": docInterfaces,
  };
}

/**
 * A schema captured from sampled rows, in the document's dialect. The stored
 * form records a null it saw as `nullable: true`; a 3.1 document must say it
 * as a type array, which is what generators reading 3.1 understand.
 */
function sampledRecord(stored: SampledSchema, dialect: SchemaDialect): JsonSchema {
  return {
    ...stored,
    properties: Object.fromEntries(
      Object.entries(stored.properties).map(([name, prop]) => [name, dialect === "2020-12" ? to31(prop) : to30(prop)]),
    ),
    description:
      "Fields observed in a live response from this tenant. Additional fields may exist on records outside the sample.",
  };
}

function to31(prop: { type?: string; format?: string; nullable?: boolean }): Obj {
  const { nullable, type, ...rest } = prop;
  if (!nullable) return type ? { ...rest, type } : rest;
  // No consistent type observed AND a null: JSON Schema has no way to say
  // "unknown-or-null" narrower than no type at all.
  if (!type) return { ...rest, description: "Observed as null in the sample; no consistent type otherwise." };
  return { ...rest, type: [type, "null"] };
}

function to30(prop: { type?: string; format?: string; nullable?: boolean }): Obj {
  const { nullable, type, ...rest } = prop;
  if (!nullable) return type ? { ...rest, type } : rest;
  if (!type) return { ...rest, description: "Observed as null in the sample; no consistent type otherwise." };
  return { ...rest, type, nullable: true };
}

function nullableType(t: string, dialect: SchemaDialect, extra: Obj = {}): Obj {
  return dialect === "2020-12" ? { ...extra, type: [t, "null"] } : { ...extra, type: t, nullable: true };
}

function anyObjectOrNull(dialect: SchemaDialect, description: string): Obj {
  return dialect === "2020-12"
    ? { type: ["object", "null"], description }
    : { type: "object", nullable: true, description };
}

/** GET …/schema's body. Its fields are the route's; `contract` is the additive P1.3 part. */
function contractDocumentSchema(dialect: SchemaDialect): Obj {
  return {
    type: "object",
    required: ["data"],
    properties: {
      data: {
        type: "object",
        required: ["id", "name", "externalId", "version", "requestSchema", "responseSchema", "schemaCaptured", "schemaState"],
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          externalId: { type: "string" },
          sapProduct: { type: "string" },
          operation: { type: "string" },
          entitySet: nullableType("string", dialect),
          mode: { type: "string" },
          version: { type: "integer" },
          requestSchema: anyObjectOrNull(dialect, "The JSON Schema of a write's `record`, compiled from the service's description; null for a read interface or when none is compiled."),
          responseSchema: anyObjectOrNull(dialect, "The schema captured from sampled rows of this contract, or null."),
          responseSchemaOmitted: {
            type: "string",
            enum: ["TOO_LARGE"],
            description: "Present when `responseSchema` is null for a capture of this contract that is stored: it is larger than a captured schema may be.",
          },
          responseSchemaNote: { type: "string" },
          schemaCaptured: { type: "boolean" },
          schemaState: { type: "string", enum: ["current", "stale", "unverified", "none"] },
          schemaNote: { type: "string" },
          contract: {
            type: "object",
            description: "The compiled contract and where it came from.",
            required: ["source"],
            properties: {
              source: { type: "string", enum: ["metadata", "sampled", "none"] },
              semver: nullableType("string", dialect),
              snapshotId: nullableType("string", dialect),
              contentHash: nullableType("string", dialect),
              odataVersion: nullableType("string", dialect),
              compiledAt: nullableType("string", dialect, { format: "date-time" }),
              schemas: anyObjectOrNull(dialect, "JSON Schema 2020-12 documents: record, create, update, key."),
              schemasOmitted: {
                type: "string",
                enum: ["TOO_LARGE"],
                description: "Present when `schemas` is null for a contract that is recorded: it is larger than a generated document may carry.",
              },
              schemasNote: { type: "string" },
            },
          },
        },
      },
    },
  };
}

function discoverySchema(dialect: SchemaDialect): Obj {
  return {
    type: "object",
    required: ["data"],
    properties: {
      data: {
        type: "object",
        required: ["environment", "interfaces"],
        properties: {
          environment: { type: "string" },
          interfaces: {
            type: "array",
            items: {
              type: "object",
              required: ["id", "name", "callable"],
              properties: {
                id: { type: "string" },
                name: { type: "string" },
                externalId: { type: "string" },
                sapProduct: { type: "string" },
                operation: { type: "string" },
                entitySet: nullableType("string", dialect),
                mode: { type: "string" },
                version: { type: "integer" },
                status: { type: "string" },
                callable: { type: "boolean" },
                refusal: nullableType("string", dialect),
                service: {
                  type: "object",
                  properties: {
                    source: { type: "string", enum: ["custom", "catalogue"] },
                    odataVersion: nullableType("string", dialect),
                  },
                },
              },
            },
          },
        },
      },
    },
  };
}

/** GET /versions's body (src/app/api/northbound/versions/route.ts). */
function versionsSchema(dialect: SchemaDialect): Obj {
  return {
    type: "object",
    required: ["data"],
    properties: {
      data: {
        type: "object",
        required: ["header", "defaultVersion", "supportedVersions", "basePaths", "policy", "versions"],
        properties: {
          header: { type: "string", enum: [VERSION_HEADER] },
          defaultVersion: nullableType("string", dialect, { description: "What a request without the header is served." }),
          supportedVersions: { type: "array", items: { type: "string" } },
          basePaths: { type: "array", items: { type: "string" } },
          policy: {
            type: "object",
            properties: {
              minimumOverlapMonths: { type: "integer" },
              unpinned: { type: "string" },
              breakingChanges: { type: "string" },
            },
          },
          versions: {
            type: "array",
            items: {
              type: "object",
              required: ["version", "status", "releasedOn", "deprecatedOn", "announcedOn", "sunsetOn", "summary", "changes"],
              properties: {
                version: { type: "string" },
                status: { type: "string", enum: ["supported", "deprecated", "retired"] },
                releasedOn: { type: "string", format: "date" },
                deprecatedOn: nullableType("string", dialect, { format: "date" }),
                announcedOn: nullableType("string", dialect, { format: "date" }),
                sunsetOn: nullableType("string", dialect, { format: "date" }),
                summary: { type: "string" },
                changes: { type: "array", items: { type: "string" } },
              },
            },
          },
        },
      },
    },
  };
}
