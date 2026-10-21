/**
 * Scaffold artifacts — what a developer downloads and takes to their own repo.
 *
 * THE POINT OF THE WHOLE CONSOLE: the solution's application code lives in the
 * developer's own repository, in whatever stack they use. Studio governs the
 * integration edge and hands over a contract. There is no in-browser editor and
 * there never should be.
 *
 * THE CONTRACT IS COMPILED, WHEN IT CAN BE (P1.3). openapi.json (3.1) and
 * openapi-3.0.json (3.0.3) come from the Contract Compiler
 * (lib/contracts/openapi.ts): the record, request and key schemas are
 * compiled from the service's own description when a verify has recorded one
 * (a ContractSnapshot), inferred from captured rows when only those exist,
 * and stated as unknown otherwise. The interface's operation decides the
 * paths: a read interface gets the read, a create interface the write with
 * its body. Every artifact says which source it came from, in the file
 * itself, so nobody mistakes a template for a guarantee.
 *
 * Pure functions: no I/O, no framework, fully testable.
 */

import type { InterfaceContract, IrProperty } from "@/lib/contracts/ir";
import { toTypeName } from "@/lib/contracts/names";
import {
  buildNorthboundOpenApi,
  type ContractForDoc,
  type OpenApiVersion,
  type SampledSchema,
} from "@/lib/contracts/openapi";
import { supportedVersions, UNVERSIONED_BASE_PATH, VERSION_HEADER } from "@/lib/northbound/version-policy";
import { isCapturedSchema, servedResponseSchema } from "@/lib/studio/schema-capture";
import { FIXTURE_SCENARIOS, stripFixtureEnvelope } from "@/lib/studio/fixtures";

export { toTypeName };

/**
 * The base URL a kit is generated for when the caller names none: the
 * original path, which Studio's download also uses with its own origin.
 *
 * NOT YET THE VERSIONED PATH (P1 wave A review). /api/northbound/v1 ships in
 * this release; the deployment a Vercel Instant Rollback returns to does not
 * serve it, so a kit that called it would get a 404 page on every call after
 * a rollback. Kits move to v1 in a later release, once a deployment that
 * serves it is the rollback target; the kit's OpenAPI lists v1 as the second
 * server meanwhile. One implementation serves both.
 */
export const DEFAULT_KIT_BASE_URL = `https://coreedge.example${UNVERSIONED_BASE_PATH}`;

/** The version an unpinned call is served today, as the kit's examples name it. */
function defaultVersionName(): string {
  return supportedVersions(new Date())[0]?.version ?? "";
}

export interface ScaffoldInterface {
  id: string;
  name: string;
  externalId: string;
  sapProduct: string;
  operation: string;
  entitySet: string | null;
  version: number;
  solutionName: string;
  /**
   * A schema inferred from rows this tenant actually returned, when one has been
   * captured FOR THIS CONTRACT. Absent → the document keeps the open shape and
   * says why, rather than describing fields nobody has seen. The caller passes
   * only a schema whose stamp matches the interface (contract-provenance.ts).
   */
  responseSchema?: unknown;
  /**
   * Why a stored schema was withheld — captured under an earlier contract, or
   * of a contract that cannot be established (A38). Said in the generated
   * files, so "not captured" is not mistaken for "nobody ever ran it".
   */
  withheldSchemaNote?: string;
  /**
   * READ | WRITE. Omitted, it follows the operation as the interfaces route
   * derives it: READ reads, anything else writes.
   */
  mode?: string;
  status?: string;
  /**
   * The interface's CURRENT compiled contract (P1.3) — a snapshot whose
   * service and dataset match the interface now (contracts/snapshot.ts).
   * A METADATA one describes the record precisely and gives a write its
   * body; a SAMPLED one is the captured schema again, with a version.
   */
  compiled?: {
    semver: string;
    snapshotId: string;
    contentHash: string;
    compiledAt: string;
    contract: InterfaceContract;
  };
  /** Approved, live grants on this interface, for the document's grant notes. */
  grants?: readonly { operation: string; environment: string }[];
}

/** The mode the interfaces route derives from the operation, when none is given. */
function modeOf(iface: ScaffoldInterface): string {
  return iface.mode ?? (iface.operation === "READ" ? "READ" : "WRITE");
}

/** Which of the three sources the record's shape comes from. */
function contractForDoc(iface: ScaffoldInterface): ContractForDoc {
  if (iface.compiled && iface.compiled.contract.source === "METADATA") {
    return {
      source: "metadata",
      contract: iface.compiled.contract,
      semver: iface.compiled.semver,
      snapshotId: iface.compiled.snapshotId,
      contentHash: iface.compiled.contentHash,
      compiledAt: iface.compiled.compiledAt,
    };
  }
  // A captured schema is emitted as the served rows can satisfy it (it carries
  // its own provenance in `x-captured`; one captured before the envelope was
  // stripped is reconciled first — see servedResponseSchema).
  const served = servedResponseSchema(iface.responseSchema);
  if (isCapturedSchema(served)) return { source: "sampled", schema: served as unknown as SampledSchema };
  return iface.withheldSchemaNote ? { source: "none", note: iface.withheldSchemaNote } : { source: "none" };
}

/**
 * OpenAPI for this interface as the NORTHBOUND API exposes it — 3.1.0 by
 * default (openapi.json), 3.0.3 on request (openapi-3.0.json, for generators
 * that do not read 3.1 yet).
 *
 * It describes the CoreEdge endpoint the developer's app will call — not SAP's
 * own API. That is the whole value: they code against a stable contract we own,
 * rather than against a tenant-specific SAP surface.
 *
 * Every honest state is documented as a response, with every error code the
 * broker can send at it. An OpenAPI that only describes the happy path teaches
 * consumers to treat everything else as a crash, which is exactly the
 * confusion the honest-status contract exists to prevent.
 */
export function buildOpenApi(
  iface: ScaffoldInterface,
  baseUrl = DEFAULT_KIT_BASE_URL,
  version: OpenApiVersion = "3.1.0",
): string {
  const contract = contractForDoc(iface);
  const source =
    contract.source === "metadata"
      ? `The record shape is COMPILED from the service's own description ($metadata), contract version ${contract.semver}.`
      : contract.source === "sampled"
        ? "The record shape is INFERRED from rows this tenant returned (the service's description has not been compiled)."
        : "The record shape is not described yet: verify the service, or capture a schema in the Test Console, and regenerate.";
  const doc = buildNorthboundOpenApi({
    version,
    baseUrl,
    title: `${safeName(iface.name)} — CoreEdge northbound`,
    infoVersion: `1.${iface.version}.0`,
    description: [
      `Contract for the CoreEdge interface "${safeName(iface.name)}" (${iface.externalId}) of solution "${safeName(iface.solutionName)}".`,
      "",
      "Generated by CoreEdge Developer Studio from the interface's governed configuration.",
      "This describes the CoreEdge northbound endpoint your application calls — not SAP's own API.",
      source,
      "",
      "Honest status: an empty result is a 200 with an empty array and MUST be treated as",
      "'no records', which is different from 'not set up' (403) and from an error (5xx).",
    ].join("\n"),
    interfaces: [
      {
        id: iface.id,
        name: iface.name,
        externalId: iface.externalId,
        sapProduct: iface.sapProduct,
        operation: iface.operation,
        mode: modeOf(iface),
        entitySet: iface.entitySet,
        version: iface.version,
        ...(iface.status ? { status: iface.status } : {}),
        contract,
        ...(iface.grants ? { grants: iface.grants } : {}),
      },
    ],
    safe: safeName,
  });
  return JSON.stringify(doc, null, 2);
}

/**
 * A contract's complex and enum types by qualified name, built once per
 * contract: looked up per property, a scan of either list made the kit
 * quadratic in a description with many types.
 */
interface CompiledTypeIndex {
  complex: ReadonlySet<string>;
  enums: ReadonlyMap<string, InterfaceContract["enumTypes"][number]>;
}

function compiledTypeIndex(contract: InterfaceContract): CompiledTypeIndex {
  const enums = new Map<string, InterfaceContract["enumTypes"][number]>();
  for (const t of contract.enumTypes) if (!enums.has(t.qualifiedName)) enums.set(t.qualifiedName, t);
  return { complex: new Set(contract.complexTypes.map((t) => t.qualifiedName)), enums };
}

/**
 * A compiled property as TypeScript: the WIRE type (see json-schema.ts — a V2
 * Int64, Decimal or date arrives as a string).
 */
function tsTypeOfCompiled(p: IrProperty, contract: InterfaceContract, types: CompiledTypeIndex): string {
  const v = contract.odataVersion;
  let base: string;
  const en = types.enums.get(p.type);
  if (types.complex.has(p.type)) base = "Record<string, unknown>";
  else if (en) {
    base = en.isFlags ? "string" : en.members.map((m) => JSON.stringify(m.name)).join(" | ") || "string";
  } else {
    switch (p.type) {
      case "Edm.Boolean":
        base = "boolean";
        break;
      case "Edm.Byte":
      case "Edm.SByte":
      case "Edm.Int16":
      case "Edm.Int32":
        base = "number";
        break;
      case "Edm.Int64":
      case "Edm.Decimal":
      case "Edm.Double":
      case "Edm.Single":
        base = v === "V2" ? "string" : "number";
        break;
      case "Edm.Untyped":
      case "Edm.PrimitiveType":
        base = "unknown";
        break;
      default:
        base = p.type.startsWith("Edm.Geo") ? "Record<string, unknown>" : p.type.startsWith("Edm.") ? "string" : "unknown";
    }
  }
  if (p.collection) return `${base.includes("|") ? `(${base})` : base}[]`;
  return p.nullable ? `${base} | null` : base;
}

/** Map a captured JSON-schema type to its TypeScript equivalent. */
function tsTypeOf(prop: { type?: string; nullable?: boolean }): string {
  const base =
    prop.type === "integer" || prop.type === "number"
      ? "number"
      : prop.type === "boolean"
        ? "boolean"
        : prop.type === "array"
          ? "unknown[]"
          : prop.type === "object"
            ? "Record<string, unknown>"
            : prop.type === "string"
              ? "string"
              : // No consistent type was observed. `unknown` forces the consumer to
                // narrow it themselves, which is correct — we genuinely do not know.
                "unknown";
  return prop.nullable ? `${base} | null` : base;
}

/**
 * The record interface body.
 *
 * With a captured schema this emits the real fields, with optional markers for
 * the ones that did not appear in every sampled row. The index signature stays
 * either way: the sample is not a census, and a consumer meeting an unlisted
 * field should get a value, not a type error. Optional markers follow the
 * schema as served, as openapi.json does (see servedResponseSchema).
 */
function buildRecordBody(stored: unknown, compiled?: InterfaceContract): string {
  if (compiled && compiled.source === "METADATA") {
    // Compiled: every property the service declares. The key is always sent;
    // anything else may be left out by a $select, so it is optional. The
    // index signature stays for a customer's extension fields, which arrive
    // before the next compile does.
    const key = new Set(compiled.entityType.key);
    const types = compiledTypeIndex(compiled);
    const lines = compiled.entityType.properties.map((p) => {
      const name = /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(p.name) ? p.name : JSON.stringify(p.name);
      const doc = p.label ? `  /** ${safeComment(p.label.replace(/\s+/g, " "))} */\n` : "";
      return `${doc}  ${name}${key.has(p.name) ? "" : "?"}: ${tsTypeOfCompiled(p, compiled, types)};`;
    });
    lines.push("  /** Fields the compiled description does not name (extension fields added since). */");
    lines.push("  [field: string]: unknown;");
    return lines.join("\n");
  }
  const responseSchema = servedResponseSchema(stored);
  if (!isCapturedSchema(responseSchema)) {
    return "  [field: string]: unknown;";
  }
  const required = new Set(responseSchema.required);
  const lines = Object.entries(responseSchema.properties).map(([name, prop]) => {
    const optional = required.has(name) ? "" : "?";
    // Quote anything that is not a plain identifier (SAP emits names like
    // `to_Partner` — fine — but also `@odata.x` on occasion).
    const key = /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) ? name : JSON.stringify(name);
    return `  ${key}${optional}: ${tsTypeOf(prop)};`;
  });
  // Always keep the index signature — see the doc comment above.
  lines.push("  /** Fields outside the captured sample. */");
  lines.push("  [field: string]: unknown;");
  return lines.join("\n");
}

/**
 * TypeScript types + a tiny typed client. Any language can be generated from the OpenAPI.
 *
 * IT MUST COMPILE UNDER THE DEVELOPER'S STRICTEST SETTINGS (P0.4). The file goes
 * into someone else's repository, and it failed `tsc --strict` there: the body
 * was cast `as typeof json`, which reads the variable's type at that point —
 * narrowed to `null` by its initialiser — so every later read of it was
 * `never`. It now names its envelope type, and avoids constructs some strict
 * setups refuse (parameter properties, under `erasableSyntaxOnly`).
 * scripts/check-scaffold-client.ts compiles the generated file in CI under
 * strict and the stricter flags beside it, with the DOM lib and with Node's.
 */
export function buildTypeScriptClient(
  iface: ScaffoldInterface,
  baseUrl = DEFAULT_KIT_BASE_URL,
): string {
  const typeName = toTypeName(iface.entitySet ?? iface.name);
  /*
   * THE HEADER FOLLOWS THE SCHEMA. It said "This is a TEMPLATE … the record
   * shape is intentionally open" unconditionally — directly above 54 typed
   * fields, once a schema had been captured. The sentence was true the day it
   * was written and the capture feature did not update it.
   */
  const compiled = iface.compiled?.contract.source === "METADATA" ? iface.compiled : undefined;
  const shapeNote = compiled
    ? ` * The record type below was COMPILED from the service's own description
 * ($metadata), contract version ${safeComment(compiled.semver)} (${safeComment(compiled.compiledAt)}). Its
 * types are the wire types: an OData V2 Int64, Decimal or date arrives as a
 * string. The key fields are always present; every other field is optional,
 * because a query may leave it out.`
    : isCapturedSchema(iface.responseSchema)
    ? ` * The record type below was CAPTURED from ${iface.responseSchema["x-captured"].sampleSize} live row${
        iface.responseSchema["x-captured"].sampleSize === 1 ? "" : "s"
      } this tenant returned
 * (${safeComment(String(iface.responseSchema["x-captured"].capturedAt))}). It describes what was observed, not
 * SAP's full $metadata: fields outside the sample are not listed, and the index
 * signature keeps them reachable. Fields are optional unless the sample was
 * large enough to assert otherwise — see x-captured in openapi.json.`
    : ` * This is a TEMPLATE, not generated from a live $metadata document. The record
 * shape is intentionally open — run the interface in the Test Console, use
 * Capture schema, and regenerate to get the fields this tenant actually returns.${
   iface.withheldSchemaNote ? `\n *\n * A stored schema was not used: ${safeComment(iface.withheldSchemaNote)}` : ""
 }`;
  return `/**
 * ${safeComment(safeName(iface.name))} — CoreEdge northbound client
 *
 * Generated by CoreEdge Developer Studio from governed interface configuration
 * (${safeComment(iface.externalId)}, v${iface.version}).
 *
${shapeNote}
 *
 * Not using TypeScript? Generate a client in your language from the OpenAPI
 * document shipped alongside this file:
 *
 *   openapi-generator-cli generate -i openapi.json -g <your-language> -o ./client
 */

/** A record as this tenant exposes it. */
export interface ${typeName} {
${buildRecordBody(iface.responseSchema, compiled?.contract)}
}

/** The error envelope every CoreEdge endpoint returns. */
export interface CoreEdgeErrorBody {
  error: { code: string; message: string; correlationId: string };
}

/** What a read response body may parse to: the data envelope, the error envelope, or neither. */
type ReadEnvelope = { data?: Omit<ReadResult, "draft" | "apiVersion"> } & Partial<CoreEdgeErrorBody>;

/** What a 200 carries — every field the broker sends, not only the records. */
export interface ReadResult {
  records: ${typeName}[];
  /** records.length. */
  count: number;
  /**
   * True when the service answered successfully and had nothing to return.
   * THIS IS DATA, NOT A FAILURE — the one field that tells an empty read apart
   * from a refusal, and the reason a consumer must not key on records.length.
   */
  empty: boolean;
  /** A one-line, human-readable account of what came back. */
  note: string;
  /** The governed interface (and contract version) that served the call. */
  interface: { id: string; name: string; version: number };
  /**
   * True when the broker sent x-coreedge-interface-status: DRAFT — the
   * interface is served but its builder has not marked it ACTIVE, so this
   * contract may still change.
   */
  draft: boolean;
  /**
   * The northbound API version that served the call (the CoreEdge-Version
   * response header), or null when the answer named none.
   */
  apiVersion: string | null;
}

export interface CoreEdgeClientOptions {
  /** e.g. ${baseUrl} — or your local mock. */
  baseUrl: string;
  /** Per-solution client token issued in Developer Studio. Keep it server-side. */
  token: string;
  /**
   * Pin a northbound API version, sent as CoreEdge-Version (e.g. "${defaultVersionName()}").
   * Omitted, the call is served the oldest version still supported. A version
   * the deployment does not serve fails with code UNSUPPORTED_VERSION.
   */
  apiVersion?: string;
  fetchImpl?: typeof fetch;
}

export class CoreEdgeError extends Error {
  readonly status: number;
  readonly code: string;
  readonly correlationId: string;

  constructor(message: string, status: number, code: string, correlationId: string) {
    super(message);
    this.name = "CoreEdgeError";
    this.status = status;
    this.code = code;
    this.correlationId = correlationId;
  }
}

export function createClient(options: CoreEdgeClientOptions) {
  const doFetch = options.fetchImpl ?? fetch;
  const interfaceId = ${JSON.stringify(iface.id)};

  return {
    /**
     * Read records.
     *
     * An empty array means NO RECORDS — it is a successful read of a resource
     * that has nothing in it, and is not the same as "not set up" (403) or a
     * failure (5xx). Treat it as data.
     */
    async read(limit = 10): Promise<ReadResult> {
      const res = await doFetch(
        \`\${options.baseUrl}/interfaces/\${interfaceId}/data?limit=\${limit}\`,
        {
          headers: {
            Authorization: \`Bearer \${options.token}\`,
            Accept: "application/json",
            ...(options.apiVersion ? { "${VERSION_HEADER}": options.apiVersion } : {}),
          },
        },
      );
      /*
       * PARSE DEFENSIVELY, AND LET THE STATUS DECIDE.
       *
       * A failure does not always arrive as CoreEdge JSON: a proxy 502, an edge
       * 429 and a gateway timeout are commonly HTML or empty. Calling
       * res.json() first threw a SyntaxError on those, which replaced a usable
       * status and correlation id with a parse error — the client hid the one
       * fact the developer needed at exactly the moment it mattered.
       */
      const body = await res.text().catch(() => "");
      let json: ReadEnvelope | null = null;
      try {
        json = body ? (JSON.parse(body) as ReadEnvelope) : null;
      } catch {
        json = null;
      }
      if (!res.ok) {
        throw new CoreEdgeError(
          json?.error?.message ?? \`Request failed with HTTP \${res.status}\`,
          res.status,
          json?.error?.code ?? "UNKNOWN",
          json?.error?.correlationId ?? res.headers.get("x-correlation-id") ?? "",
        );
      }
      if (!json?.data) {
        // A 2xx without the data envelope is not "no records" — it is a
        // response this client does not understand, and saying so beats
        // inventing an empty result.
        throw new CoreEdgeError(
          "Response carried no data envelope",
          res.status,
          "MALFORMED_RESPONSE",
          res.headers.get("x-correlation-id") ?? "",
        );
      }
      return {
        ...json.data,
        draft: res.headers.get("x-coreedge-interface-status") === "DRAFT",
        apiVersion: res.headers.get("${VERSION_HEADER}"),
      };
    },
  };
}
`;
}

/** The runnable starter kit's README — the file that sets expectations. */
export function buildReadme(
  iface: ScaffoldInterface,
  fixtures: readonly ScaffoldFixture[] = [],
  baseUrl = DEFAULT_KIT_BASE_URL,
  withheld: readonly WithheldFixture[] = [],
): string {
  const captured = fixtures.map((f) => f.scenario);
  const missing = FIXTURE_SCENARIOS.filter((s) => !captured.includes(s));
  const withheldSection =
    withheld.length === 0
      ? ""
      : `\n\nWithheld: **${withheld.map((w) => w.scenario).join(", ")}** — recorded under an earlier contract of
this interface, or with no record of which contract it belongs to.
A mock of another contract would test code against rows the live route will
never return, so they are not shipped. Capture them again from the Test Console.`;
  const fixtureSection =
    captured.length === 0
      ? `## Offline mock — nothing captured yet

\`npm run mock\` will start, but it has no recorded responses to serve. Open this
interface in the Test Console, run it, and use **Capture fixture** — then
regenerate this kit. Until then your tests cannot run offline.
`
      : `## Offline mock

\`\`\`bash
npm run mock          # http://localhost:4010, serving recorded responses
\`\`\`

Captured scenarios: **${captured.join(", ")}**${
          missing.length > 0
            ? `\n\nNot captured yet: **${missing.join(", ")}** — capture them from the Test
Console so your tests can exercise those paths too. A suite that only proves your
code works when everything is fine is proving the easy half.`
            : "\n\nEvery honest state is recorded, so your tests can exercise every path."
        }${withheldSection}

Choose one per request with \`?scenario=empty\`, or for the whole process with
\`COREEDGE_SCENARIO=empty\`.
`;

  return `# ${safeName(iface.solutionName)} — ${safeName(iface.name)}

Starter kit generated by CoreEdge Developer Studio.

## What this is, and is not

**Your application code lives in YOUR repository, in whatever stack you use.**
CoreEdge governs the integration edge — which SAP capability you consume, who
approved it, and what the contract looks like. It is not an IDE and does not want
to be. This kit only shows the CoreEdge call; everything around it is yours.

Your database, your framework, your language: untouched by any of this.

## Files

| File | What it is |
|---|---|
| \`openapi.json\` | OpenAPI 3.1 for the northbound endpoint. **This is the portable artifact** — generate a client in any language from it. |
| \`openapi-3.0.json\` | The same contract in OpenAPI 3.0.3, for generators that do not read 3.1 yet. |
| \`client.ts\` | A small typed TypeScript client, if that is your stack. |
| \`demo.mjs\` | A runnable read. Proves the loop end to end. |
| \`mock.mjs\` + \`fixtures.json\` | An offline CoreEdge, serving responses recorded from real runs. No dependencies. |
| \`.env.example\` | The two values you need. |
| \`.gitignore\` | Keeps \`.env\` (your token) and \`fixtures.json\` (your customer's records) out of your repository by default. |

## Run it

Needs Node 20.12 or newer — the scripts load \`.env\` for you.

\`\`\`bash
cp .env.example .env     # COREEDGE_BASE_URL is already filled in for you
                         # add your COREEDGE_TOKEN
npm run demo
\`\`\`

No \`.env\`? Pass them inline — both scripts work either way:

\`\`\`bash
COREEDGE_BASE_URL=${baseUrl} COREEDGE_TOKEN=ce_… npm run demo
\`\`\`

${fixtureSection}

Point \`COREEDGE_BASE_URL\` at the live broker or at a local mock — **that one
variable is the only difference**, so your tests can run offline against the mock
and the same code path runs against the real tenant.

## The fixture file holds your customer's data — treat it that way

\`fixtures.json\` is recorded from **real reads of a real tenant**. A \`data\`
fixture carries live master data — supplier numbers, user IDs, company codes,
whatever the entity set returned. It is truncated to a sample, never redacted.

- It is listed in \`.gitignore\`, so it stays out of your repository unless you
  choose otherwise. Keep it that way, or redact it first.
- Do not share this kit with anyone who is not cleared to see the tenant's data.
- The other scenarios (\`empty\`, \`needs_setup\`, \`not_found\`, \`timeout\`,
  \`error\`) carry no records and are safe to commit; split them out if your
  suite needs them in CI.

## Not a TypeScript shop?

The OpenAPI document is the contract. Python, Go, Java, C# and the rest:

\`\`\`bash
openapi-generator-cli generate -i openapi.json -g python -o ./client
\`\`\`

## Honest status — the one thing to get right

| Response | Means | Do |
|---|---|---|
| \`200\` with records | Data | Use it |
| \`200\` with \`records: []\` | **No records** | Treat as data, not failure |
| \`403\` | Not set up, or no approved grant | Fix access — do not retry |
| \`404\` | No such interface, or its dataset does not exist on the tenant | Fix the configuration — do not retry |
| \`400\` \`UNSUPPORTED_VERSION\` | Your \`CoreEdge-Version\` header names a version this deployment does not serve | Send one of \`error.supportedVersions\`, or omit the header |
| \`5xx\` | Tenant or broker failed (\`502\`, \`504\` timeout) | Retry or escalate |

An empty result is **not** an error. Conflating the two is the single most common
way an integration lies to its users.

## API versions

This kit calls \`/api/northbound\`. The versioned path, \`/api/northbound/v1\`,
is the same implementation (the same versions, credentials and limits); kits
switch to it in a later release, and this one keeps working.

Every answer names the API version that served it in the \`CoreEdge-Version\`
header (\`apiVersion\` in the client's read result). Send the same header to pin
one (\`createClient({ ..., apiVersion: "${defaultVersionName()}" })\`); without it you
are served the oldest version still supported. A version that is unknown or past
its Sunset date is refused with \`400 UNSUPPORTED_VERSION\`. From the day a
version's deprecation is announced, its answers carry \`Deprecation\` and
\`Sunset\` headers: log them. The versions and the policy are served at
\`$COREEDGE_BASE_URL/versions\` (no token needed) and described in \`openapi.json\`.

## Interface

- Service: ${inlineCode(iface.externalId)} (${safeName(iface.sapProduct)})
- Operation: ${safeName(iface.operation)}${iface.entitySet ? `\n- Entity set: ${inlineCode(iface.entitySet)}` : ""}
- Contract version: v${iface.version}${
    iface.compiled?.contract.source === "METADATA"
      ? `\n- Record shape: compiled from the service's own description, contract ${inlineCode(iface.compiled.semver)}`
      : isCapturedSchema(iface.responseSchema)
        ? "\n- Record shape: inferred from captured rows (verify the service to compile it from its description)"
        : "\n- Record shape: not described yet (verify the service, or capture a schema in the Test Console)"
  }
`;
}

/**
 * .env.example — pre-filled with THIS deployment's base URL.
 *
 * IT USED TO HARDCODE `https://coreedge.example/api/northbound` while
 * openapi.json (three files away, same download) carried the real origin the
 * route derives. So the one file the README tells you to copy was the one file
 * that could not work, and `npm run demo` failed against a domain that does not
 * resolve — after the developer had already filled in a real token. The base URL
 * is a parameter here for the same reason it is one in buildOpenApi: the kit is
 * generated per request and knows where it came from.
 */
export function buildEnvExample(baseUrl = DEFAULT_KIT_BASE_URL): string {
  return `# The CoreEdge northbound base URL, pre-filled for the deployment that
# generated this kit. Point it at your local mock to develop offline.
COREEDGE_BASE_URL=${baseUrl}

# Per-solution client token, issued in Developer Studio.
# Treat it like a password: server-side only, never in a browser bundle or git.
COREEDGE_TOKEN=
`;
}

/**
 * fixtures.json — and the one sentence in it that has to be earned.
 *
 * THE NOTE USED TO READ "Recorded from real runs in CoreEdge Developer Studio"
 * UNCONDITIONALLY. It was written into every download, including over fixtures
 * captured while the Test Console was reporting a tenant's 403 as a successful
 * empty read. So the file asserted provenance for records that had none, a
 * developer took it into their own repository, and `npm run mock` served an
 * invented 200 for a call that really refuses.
 *
 * A fixture can now say where it came from. One that cannot — because it
 * predates `sourceStatus` — is not silently dropped and not silently blessed:
 * it is shipped, flagged, and the note stops claiming what it cannot support.
 * That is the same rule the product applies to a probe it has not run.
 */
function buildFixturesJson(
  iface: { id: string; name: string },
  fixtures: readonly ScaffoldFixture[],
  withheld: readonly WithheldFixture[] = [],
): string {
  const unproven = fixtures.filter((f) => f.sourceStatus === null || f.sourceStatus === undefined);
  const dataFixtures = fixtures.filter((f) => f.scenario === "data");

  return JSON.stringify(
    {
      interfaceId: iface.id,
      interfaceName: safeName(iface.name),
      // First key in the file, so it is the first line anyone opening it reads.
      warning: dataFixtures.length > 0
        ? `CUSTOMER DATA. ${dataFixtures.length === 1 ? "The data fixture carries" : `${dataFixtures.length} fixtures carry`} live records read from a real tenant — master data, identifiers, amounts. ` +
          "This file is listed in the kit's .gitignore; do not commit it to a shared repository or hand it to anyone not cleared to see the tenant's data. Redact before sharing."
        : "No data fixture is captured, so this file carries no tenant records. A data capture will; see the README.",
      note:
        unproven.length === 0
          ? "Recorded from real runs in CoreEdge Developer Studio, each carrying the status the tenant returned. Serve them with `npm run mock`."
          : `Recorded in CoreEdge Developer Studio. ${unproven.length} of ${fixtures.length} ` +
            "fixtures predate provenance recording and carry no sourceStatus, so what the " +
            "tenant actually answered when they were captured cannot be established — they " +
            "are marked unverified below. Re-run those scenarios in the Test Console and " +
            "capture again to replace them. Serve with `npm run mock`.",
      fixtures: fixtures.map((f) => ({
        scenario: f.scenario,
        status: f.status,
        // Named for what it is, so a reader who never opens the docs still sees
        // the difference between "the tenant said 200" and "nobody recorded it".
        sourceStatus: f.sourceStatus ?? null,
        capturedAt: f.capturedAt ?? null,
        ...(f.sourceStatus === null || f.sourceStatus === undefined
          ? { unverified: "Captured before CoreEdge recorded provenance; origin unknown." }
          : {}),
        // Cleaned on the way out as well as at capture: fixtures stored before
        // capture stripped SAP's envelope still carry the tenant's host in
        // every row's __metadata / __deferred URIs. See stripFixtureEnvelope.
        body: stripFixtureEnvelope(f.body),
      })),
      // Named, never served: recorded under another contract, or under one
      // nobody can establish (A38). No body — it describes the wrong rows.
      ...(withheld.length > 0 ? { withheld: withheld.map((w) => ({ scenario: w.scenario, reason: w.reason })) } : {}),
    },
    null,
    2,
  );
}


/**
 * A name, made safe to embed in a file someone else will open.
 *
 * SOLUTION AND INTERFACE NAMES ARE FREE TEXT AND THEY LEAVE THE BROWSER. React
 * escapes them on screen, which is where everyone looked; the scaffold writes
 * them into README.md and openapi.json and hands those to a developer. A stored
 * `QA-<script>alert(1)</script>-XSS` arrived VERBATIM in both:
 *
 *     "Contract for the CoreEdge interface … of solution
 *      "QA-<script>alert(1)</script>-XSS"."
 *
 * An OpenAPI `description` is rendered as markdown or HTML by Swagger UI, Redoc
 * and every API portal worth the name, and a README is rendered by the forge and
 * the IDE. The payload executes in the viewer, not here — which is exactly why
 * it was invisible to a check that only opened the product.
 *
 * ESCAPED AT THE SINK, NOT REJECTED AT THE SOURCE. Refusing angle brackets in a
 * solution name would be a second, weaker control in a different place, would
 * not help the records that already carry one, and would tell a consultant their
 * perfectly reasonable name is forbidden because of how one downstream file is
 * generated. The generator is what knows it is writing a document.
 *
 * Angle brackets and ampersand only: this must stay readable. A name is still a
 * name after it goes through here.
 */
export function safeName(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * The same "escape at the sink" rule as safeName, for the two OTHER sinks the
 * kit writes into — because safeName covers the HTML-ish ones and nothing
 * covered these.
 *
 * A field like externalId reaches a file as three different things: a JSON
 * string (escaped by JSON.stringify), a TypeScript block comment, and a
 * markdown code span. The last two were interpolated raw. A comment terminator
 * inside an externalId ends client.ts's header comment early and the rest of
 * the line becomes code; a backtick inside one closes the README's code span
 * and the rest of the line becomes markdown. Neither is exotic input in a field
 * a consultant types, and neither is the record's fault — the generator is what
 * knows which document it is writing.
 */
function safeComment(value: string): string {
  // A space through the terminator: visible, lossless enough to read back, and
  // no longer able to end the comment it sits in.
  return value.replace(/\*\//g, "* /");
}

/**
 * A markdown code span holding `value`, fenced so nothing inside can close it.
 *
 * Markdown's own rule rather than an escape: a span may be delimited by any run
 * of backticks longer than the longest run inside it, so the value travels
 * whole — no character is substituted and no homoglyph is smuggled into a
 * service name a developer may paste back.
 */
function inlineCode(value: string): string {
  const longest = Math.max(0, ...[...value.matchAll(/`+/g)].map((m) => m[0].length));
  const fence = "`".repeat(longest + 1);
  // A span whose content starts or ends with a backtick needs the padding
  // spaces, which markdown strips again on render.
  const pad = longest > 0 ? " " : "";
  return `${fence}${pad}${value}${pad}${fence}`;
}

/** A recorded response the kit does not ship, and why (contract-provenance.ts). */
export interface WithheldFixture {
  scenario: string;
  reason: string;
}

/** A recorded response, as captured from a real run. */
export interface ScaffoldFixture {
  scenario: string;
  status: number;
  body: unknown;
  /**
   * The status the tenant returned when this was recorded, and when.
   *
   * Both optional, because fixtures captured before provenance existed have
   * neither — and that absence is carried into the file rather than smoothed
   * over. See `buildFixturesJson`.
   */
  sourceStatus?: number | null;
  capturedAt?: string | null;
}

/**
 * The offline mock.
 *
 * Deliberately a ~60-line Node script with no dependencies rather than a mock
 * framework: the developer already has enough tooling opinions of their own, and
 * a fixture server that needs installing is a fixture server that does not get
 * used. It reads the same fixtures.json the Studio captured and serves the same
 * shape the real broker returns, so the ONLY difference between mock and live is
 * COREEDGE_BASE_URL.
 *
 * SCENARIO SELECTION is explicit — `?scenario=empty`, or the COREEDGE_SCENARIO
 * env var. A mock that always returns the happy path lets a test suite prove
 * only that the code works when everything is fine, which is exactly when it
 * does not matter.
 */
export function buildMockServer(iface: ScaffoldInterface): string {
  return `#!/usr/bin/env node
/**
 * Offline CoreEdge mock for "${safeComment(safeName(iface.name))}".
 *
 * Serves the recorded responses in fixtures.json in exactly the shape the real
 * northbound API returns. No dependencies — node mock.mjs and you are running.
 *
 *   npm run mock                       # http://localhost:4010
 *   COREEDGE_SCENARIO=empty npm run mock
 *
 * Pick a scenario per request with ?scenario=…, or for the whole process with
 * COREEDGE_SCENARIO. Available scenarios are whatever was captured:
 * ${FIXTURE_SCENARIOS.join(", ")}.
 *
 * Point your app at it by changing ONE variable:
 *   COREEDGE_BASE_URL=http://localhost:4010
 */
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = JSON.parse(readFileSync(join(here, "fixtures.json"), "utf8"));
${loadEnvPrelude()}
const PORT = Number(process.env.PORT ?? 4010);
const DEFAULT_SCENARIO = process.env.COREEDGE_SCENARIO ?? "data";
// The broker's own bounds, so ?limit behaves here exactly as it will there.
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;
const INTERFACE_ID = ${JSON.stringify(iface.id)};
const INTERFACE = ${JSON.stringify({ id: iface.id, name: safeName(iface.name), version: iface.version })};
// The northbound API versions the deployment served when this kit was
// generated, oldest (the default) first: the mock names the version that
// served each answer, as the broker does, and refuses one the broker would.
const SUPPORTED_VERSIONS = ${JSON.stringify(supportedVersions(new Date()).map((v) => v.version))};

function pick(scenario) {
  const found = fixtures.fixtures.find((f) => f.scenario === scenario);
  if (found) return found;
  // Say what IS available rather than silently serving something else — a mock
  // that quietly substitutes a different scenario is worse than one that fails.
  return {
    scenario,
    status: 404,
    body: {
      error: {
        code: "FIXTURE_NOT_CAPTURED",
        message:
          \`No "\${scenario}" fixture was captured for this interface. Available: \` +
          fixtures.fixtures.map((f) => f.scenario).join(", ") +
          ". Capture it from the Test Console in Developer Studio.",
        correlationId: "mock",
      },
    },
  };
}

/**
 * ?limit=N, honoured — the broker clamps it to 1…100 and returns at most that
 * many rows.
 *
 * The mock used to ignore it and serve the whole fixture, so read(1) came back
 * with every recorded row and code written against the mock broke on the first
 * real call. count and empty are recomputed from what is actually served,
 * because an envelope whose count disagrees with its own array is the kind of
 * lie this kit exists to argue against.
 */
function applyLimit(body, raw) {
  if (!body || !Array.isArray(body.records)) return body;
  const parsed = Number.parseInt(raw ?? "", 10);
  const limit = Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), MAX_LIMIT) : DEFAULT_LIMIT;
  if (body.records.length <= limit) return body;
  const records = body.records.slice(0, limit);
  return {
    ...body,
    records,
    count: records.length,
    empty: records.length === 0,
    note: \`\${records.length} record(s) — the mock truncated \${body.records.length} recorded rows to ?limit=\${limit}.\`,
  };
}

createServer((req, res) => {
  const url = new URL(req.url ?? "/", \`http://localhost:\${PORT}\`);

  // First, as the broker does: a version it does not serve is a 400.
  const pinned = String(req.headers["coreedge-version"] ?? "").trim();
  if (pinned && !SUPPORTED_VERSIONS.includes(pinned)) {
    res.writeHead(400, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        error: {
          code: "UNSUPPORTED_VERSION",
          message: \`CoreEdge-Version "\${pinned}" is not served. Supported: \${SUPPORTED_VERSIONS.join(", ")}.\`,
          correlationId: "mock",
          requestedVersion: pinned,
          supportedVersions: SUPPORTED_VERSIONS,
        },
      }),
    );
    return;
  }
  const served = { "${VERSION_HEADER}": pinned || SUPPORTED_VERSIONS[0] };

  // The mock does not check the token — it is a local stand-in, not a security
  // boundary. It DOES require one, so code that forgets the header fails here
  // rather than in production.
  const auth = req.headers.authorization ?? "";
  if (!auth.toLowerCase().startsWith("bearer ")) {
    res.writeHead(401, { "content-type": "application/json", ...served });
    res.end(JSON.stringify({ error: { code: "UNAUTHENTICATED", message: "Missing bearer token.", correlationId: "mock" } }));
    return;
  }

  if (!url.pathname.startsWith(\`/interfaces/\${INTERFACE_ID}/data\`)) {
    res.writeHead(404, { "content-type": "application/json", ...served });
    res.end(JSON.stringify({ error: { code: "NOT_FOUND", message: \`This mock only serves /interfaces/\${INTERFACE_ID}/data\`, correlationId: "mock" } }));
    return;
  }

  const fixture = pick(url.searchParams.get("scenario") ?? DEFAULT_SCENARIO);
  // The same envelope the broker sends, "interface" included: the fixture body
  // is what the run returned; which interface served it is the mock's to add.
  const payload =
    fixture.status < 400
      ? { data: { interface: INTERFACE, ...applyLimit(fixture.body, url.searchParams.get("limit")) } }
      : fixture.body;
  res.writeHead(fixture.status, { "content-type": "application/json", "x-correlation-id": "mock", ...served });
  res.end(JSON.stringify(payload, null, 2));
}).listen(PORT, () => {
  const names = fixtures.fixtures.map((f) => f.scenario).join(", ") || "(none captured)";
  console.log(\`CoreEdge mock on http://localhost:\${PORT}\`);
  console.log(\`  scenarios: \${names}\`);
  console.log(\`  default:   \${DEFAULT_SCENARIO}\`);
});
`;
}

/**
 * package.json for the starter kit — the two scripts that matter.
 *
 * PLAIN `node`, because loading .env is the SCRIPT'S job now (see loadEnvPrelude).
 *
 * This briefly ran `node --env-file-if-exists=.env`, with `engines: >=22.9` to
 * declare the flag's floor. That floor was the problem: npm treats `engines` as
 * ADVISORY unless engine-strict is set, so a developer on Node 22.5 — a version
 * that looks entirely current — gets a warning they may not read and then
 * `node: bad option: --env-file-if-exists`. Cryptic, and landing on exactly the
 * "the documented first run works" promise this kit exists to keep. The floor
 * also excluded all of 22.0–22.8, not just older majors.
 */
export function buildPackageJson(iface: ScaffoldInterface): string {
  return JSON.stringify(
    {
      name: `coreedge-${iface.id.toLowerCase()}`,
      private: true,
      type: "module",
      description: `CoreEdge starter kit for ${safeName(iface.name)}`,
      scripts: {
        mock: "node mock.mjs",
        demo: "node demo.mjs",
      },
    },
    null,
    2,
  );
}

/**
 * Load .env with NODE'S OWN PARSER, and shrug if there isn't one.
 *
 * THE DEFECT THIS CLOSES. The README has always said `cp .env.example .env` then
 * `npm run demo`. Nothing ever loaded that file, so the documented first run
 * exited 1 with "Set COREEDGE_BASE_URL and COREEDGE_TOKEN (see .env.example)"
 * while the developer was looking at a .env holding exactly those two values.
 * The first thing the kit did was tell them they had not done the thing they
 * had just done.
 *
 * `process.loadEnvFile` (Node 20.12+) is the built-in parser — comments and
 * quoting handled by Node, not by a hand-rolled splitter that would eventually
 * mangle a token containing "=". It THROWS on a missing file, so the catch is
 * what makes the inline form (`COREEDGE_BASE_URL=… npm run demo`, and the mock
 * walkthrough) keep working: both paths in the README have to run.
 *
 * The typeof guard costs one line and means a genuinely ancient Node still
 * reaches the script's own "set these two variables" message rather than dying
 * on an unknown method.
 */
function loadEnvPrelude(): string {
  return `// Load .env if present — Node's own parser; absent file is fine (inline env vars).
if (typeof process.loadEnvFile === "function") {
  try {
    process.loadEnvFile(".env");
  } catch {
    /* no .env — variables may come from the environment instead */
  }
}
`;
}

/** A runnable demo — the thing that proves the loop works end to end. */
export function buildDemo(iface: ScaffoldInterface): string {
  return `#!/usr/bin/env node
/**
 * Reads through CoreEdge and prints what came back.
 *
 * Run it against the mock or against the live broker — the ONLY difference is
 * COREEDGE_BASE_URL:
 *
 *   npm run mock &                 # terminal 1
 *   COREEDGE_BASE_URL=http://localhost:4010 COREEDGE_TOKEN=anything npm run demo
 *
 *   COREEDGE_BASE_URL=https://…/api/northbound COREEDGE_TOKEN=ce_… npm run demo
 */
${loadEnvPrelude()}
const baseUrl = process.env.COREEDGE_BASE_URL;
const token = process.env.COREEDGE_TOKEN;

if (!baseUrl || !token) {
  console.error("Set COREEDGE_BASE_URL and COREEDGE_TOKEN (see .env.example).");
  process.exit(1);
}

const res = await fetch(\`\${baseUrl}/interfaces/${iface.id}/data?limit=5\`, {
  headers: { Authorization: \`Bearer \${token}\`, Accept: "application/json" },
});
// The status first: a 502 from a proxy is usually HTML, and parsing it before
// looking at res.ok turns a readable failure into a SyntaxError.
const body = await res.text().catch(() => "");
let json = null;
try {
  json = body ? JSON.parse(body) : null;
} catch {
  json = null;
}

if (!res.ok) {
  // 403 means "not set up" — an access problem to fix, not an outage to retry.
  console.error(\`HTTP \${res.status}\`, json?.error?.code ?? "", "-", json?.error?.message ?? body.slice(0, 200));
  console.error("correlationId:", json?.error?.correlationId ?? res.headers.get("x-correlation-id") ?? "");
  process.exit(1);
}

const { records = [], empty, note } = json?.data ?? {};
if (empty) {
  // The single most important line in this file: an empty result is DATA. Your
  // application should render "nothing here", not an error page.
  console.log("No records — the service answered successfully and had nothing to return.");
} else {
  console.log(\`\${records.length} record(s):\`);
  for (const r of records.slice(0, 5)) console.log(" ", JSON.stringify(r).slice(0, 160));
}
if (note) console.log("note:", note);
`;
}

/**
 * .gitignore — the one line that stops customer data reaching a repository.
 *
 * The kit's premise is that you take it to your own repository, and the default
 * path did exactly that with fixtures.json inside it: supplier numbers, SAP
 * user IDs and company codes, recorded from a real tenant and described in the
 * README as "responses recorded from real runs", walked into a developer's git
 * history on the first commit. The token in .env was one `git add .` from the
 * same fate. Both are ignored by default; un-ignoring is a decision.
 */
export function buildGitignore(): string {
  return `# Your per-solution client token. Never commit it.
.env

# Recorded responses from a REAL tenant. The data fixture carries live customer
# records (master data, identifiers, amounts) — truncated, never redacted.
# Keep it out of shared history; redact it first if your suite must have it.
fixtures.json
`;
}

export interface ScaffoldFile {
  path: string;
  contents: string;
}

/**
 * Everything the developer takes away, as plain files.
 *
 * With fixtures, the kit is runnable offline: `npm run mock` then `npm run demo`
 * exercises the same code path the live broker serves. Without them it still
 * ships, and the README says which scenarios are missing rather than pretending
 * the mock is complete.
 */
export function buildScaffold(
  iface: ScaffoldInterface,
  baseUrl?: string,
  fixtures: readonly ScaffoldFixture[] = [],
  withheld: readonly WithheldFixture[] = [],
): ScaffoldFile[] {
  return [
    { path: "README.md", contents: buildReadme(iface, fixtures, baseUrl, withheld) },
    { path: "openapi.json", contents: buildOpenApi(iface, baseUrl) },
    { path: "openapi-3.0.json", contents: buildOpenApi(iface, baseUrl, "3.0.3") },
    { path: "client.ts", contents: buildTypeScriptClient(iface, baseUrl) },
    { path: ".env.example", contents: buildEnvExample(baseUrl) },
    { path: ".gitignore", contents: buildGitignore() },
    { path: "package.json", contents: buildPackageJson(iface) },
    { path: "demo.mjs", contents: buildDemo(iface) },
    { path: "mock.mjs", contents: buildMockServer(iface) },
    {
      path: "fixtures.json",
      contents: buildFixturesJson(iface, fixtures, withheld),
    },
  ];
}
