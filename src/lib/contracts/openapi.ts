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
 * Pure and deterministic: the same input renders the same document.
 */

import type { InterfaceContract } from "@/lib/contracts/ir";
import { buildContractSchemas, type JsonSchema, type SchemaDialect } from "@/lib/contracts/json-schema";
import { toTypeName } from "@/lib/contracts/names";
import { ALL_ERROR_CODES, NORTHBOUND_ERROR_CODES, NORTHBOUND_REFUSAL_REASONS } from "@/lib/contracts/northbound-errors";
import type { NorthboundErrorCode } from "@/lib/northbound/respond";

export type OpenApiVersion = "3.1.0" | "3.0.3";

/** What the broker serves today, by operation. The single place a new operation is switched on. */
export const BROKER_OPERATIONS = {
  list: { served: true, query: ["limit"] as readonly string[] },
  getByKey: { served: false, roadmap: "P1.4" },
  create: { served: true },
  update: { served: false, roadmap: "P2.4" },
  delete: { served: false, roadmap: "P2.4" },
} as const;

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
}

type Obj = Record<string, unknown>;

const H = {
  correlation: "CorrelationId",
  request: "RequestId",
  rateRemaining: "RateLimitRemaining",
  retryAfter: "RetryAfter",
  interfaceStatus: "InterfaceStatus",
  replayed: "IdempotencyReplayed",
  cache: "CacheControl",
} as const;

export function buildNorthboundOpenApi(input: NorthboundDocInput): Obj {
  const dialect: SchemaDialect = input.version === "3.1.0" ? "2020-12" : "oas30";
  const safe = input.safe ?? ((s: string) => s);
  const ref = (kind: "schemas" | "headers" | "parameters" | "responses", name: string) => ({
    $ref: `#/components/${kind}/${name}`,
  });
  const nullableOf = (s: JsonSchema): JsonSchema => {
    if (dialect === "oas30") return "$ref" in s ? { allOf: [s], nullable: true } : { ...s, nullable: true };
    if ("$ref" in s) return { anyOf: [s, { type: "null" }] };
    return { ...s, type: [s.type as string, "null"] };
  };

  const schemas: Record<string, JsonSchema> = {};
  const paths: Record<string, Obj> = {};
  const usedStems = new Set<string>();
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
    })[name]!;
  const commonHeaders = () => ({
    ...header("x-correlation-id"),
    ...header("X-Request-Id"),
    ...header("X-RateLimit-Remaining"),
    ...header("Cache-Control"),
  });

  /** One error response: its codes, in the description and as x-coreedge-error-codes. */
  const errorResponse = (status: number, codes: readonly NorthboundErrorCode[], lead: string, retryAfter = false): Obj => ({
    description: `${lead} Codes: ${codes.join(", ")}.`,
    headers: { ...commonHeaders(), ...(retryAfter ? header("Retry-After") : {}) },
    content: { "application/json": { schema: ref("schemas", "Error") } },
    "x-coreedge-error-codes": codes.map((c) => ({ code: c, status, action: NORTHBOUND_ERROR_CODES[c].action })),
  });

  // The answers every operation shares, defined once (components.responses).
  const sharedResponses: Record<string, Obj> = {
    Unauthenticated: errorResponse(401, ["UNAUTHENTICATED"], "Missing, unknown, revoked, expired or rotated-out client token — one answer for all of them."),
    RateLimited: errorResponse(429, ["RATE_LIMITED", "RATE_LIMITED_ADDRESS"], "Rate limited: this credential's budget, or the caller's address.", true),
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
    const stem = uniqueStem(toTypeName(iface.entitySet ?? iface.name), usedStems);
    const tag = stem;
    const recordSchemaName = stem;
    let createSchemaName: string | null = null;
    let sapCreatable: boolean | null = null;
    let sapUpdatable: boolean | null = null;
    let sapDeletable: boolean | null = null;

    const c = iface.contract;
    if (c.source === "metadata") {
      const built = buildContractSchemas(c.contract, { dialect, stem, ref: (n) => `#/components/schemas/${n}` });
      Object.assign(schemas, built.schemas);
      createSchemaName = built.names.create;
      const caps = c.contract.entitySet.capabilities;
      sapCreatable = caps.creatable !== false;
      sapUpdatable = caps.updatable !== false;
      sapDeletable = caps.deletable !== false;
    } else if (c.source === "sampled") {
      schemas[recordSchemaName] = sampledRecord(c.schema, dialect);
    } else {
      schemas[recordSchemaName] = {
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
      schemas[resultName] = {
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
      paths[`/interfaces/${iface.id}/data`] = {
        get: {
          operationId: `read${stem}`,
          tags: [tag],
          summary: `Read ${safe(iface.entitySet ?? iface.name)}`,
          description:
            "Reads records through CoreEdge from the customer's SAP system, through the connection bound to this credential's environment. " +
            "An empty result is a 200 with an empty array and MUST be treated as 'no records', which is different from 'not set up' (403) and from an error (5xx).",
          parameters: [ref("parameters", "Limit")],
          responses: {
            "200": {
              description: "Records, or an empty array meaning 'no records' — not an error.",
              headers: { ...commonHeaders(), ...header("x-coreedge-interface-status") },
              content: { "application/json": { schema: ref("schemas", resultName) } },
            },
            "400": errorResponse(400, ["VALIDATION_ERROR"], "The interface cannot be read as configured: it names no entity set, or its service could not be resolved. Fix the configuration in Studio — do not retry."),
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
      schemas[bodyName] = {
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
      schemas[resultName] = {
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
      paths[`/interfaces/${iface.id}/data/write`] = {
        post: {
          operationId: `create${stem}`,
          tags: [tag],
          summary: `Create a ${safe(iface.entitySet ?? iface.name)} record`,
          description:
            "Creates one record in the customer's SAP system. Requires the solution's write key beside the bearer token, and an Idempotency-Key: a retry with the same key and payload is answered from the stored outcome (Idempotency-Replayed: true) and never writes twice.",
          security: [{ bearerAuth: [], writeKey: [] }],
          parameters: [ref("parameters", "IdempotencyKey")],
          requestBody: { required: true, content: { "application/json": { schema: ref("schemas", bodyName) } } },
          responses: {
            "201": {
              description: "Created. A replay of an earlier outcome under the same Idempotency-Key carries Idempotency-Replayed: true and the original status and body.",
              headers: { ...commonHeaders(), ...header("Idempotency-Replayed") },
              content: { "application/json": { schema: ref("schemas", resultName) } },
            },
            "400": errorResponse(400, ["VALIDATION_ERROR"], "The request or the interface's definition cannot be used: a missing or malformed Idempotency-Key, a body that is not { record }, an `entity` that differs from the interface's dataset, no dataset, or an own service not yet verified in this environment."),
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

    paths[`/interfaces/${iface.id}/schema`] = {
      get: {
        operationId: `get${stem}Contract`,
        tags: [tag],
        summary: "Fetch this interface's contract",
        description:
          "The interface's request and response schemas, and where they came from (the service's own description, sampled rows, or none). Makes no SAP call.",
        responses: {
          "200": {
            description: "The contract.",
            headers: commonHeaders(),
            content: { "application/json": { schema: ref("schemas", "ContractDocument") } },
          },
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
  }

  if (input.discovery) {
    paths["/interfaces"] = {
      get: {
        operationId: "listInterfaces",
        summary: "List the interfaces this credential's solution defines",
        description: "Metadata only; makes no SAP call. `callable` says whether a data call would be made, and `refusal` why not.",
        responses: {
          "200": {
            description: "This solution's interfaces.",
            headers: commonHeaders(),
            content: { "application/json": { schema: ref("schemas", "Discovery") } },
          },
          ...commonErrors(),
        },
      },
    };
    schemas.Discovery = discoverySchema(dialect);
  }

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
    servers: [{ url: input.baseUrl }],
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
      },
      schemas,
    },
    "x-coreedge-interfaces": docInterfaces,
  };
}

function uniqueStem(base: string, used: Set<string>): string {
  let stem = base;
  for (let i = 2; used.has(stem); i++) stem = `${base}${i}`;
  used.add(stem);
  return stem;
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
