/**
 * Validate an OpenAPI document against the OFFICIAL specification schemas
 * (vendored under tests/fixtures/contracts/openapi-spec, Apache-2.0, from
 * spec.openapis.org), with ajv.
 *
 *   3.1.x — the 2022-10-07 schema for the document's structure, then every
 *           Schema Object in it (components, parameters, headers, bodies)
 *           against the JSON Schema 2020-12 meta-schema, which is what a 3.1
 *           Schema Object is. The structural schema points at each Schema
 *           Object through `$dynamicRef: "#meta"`, whose only anchor in that
 *           document is `$defs/schema` (an object or a boolean); ajv
 *           resolves the dynamic reference against its own 2020-12
 *           meta-schema instead, so it is rewritten to the plain `$ref` it
 *           is equivalent to here.
 *   3.0.x — the 2021-09-28 schema, which validates Schema Objects itself.
 *           It is a draft-04 document; ajv 8 reads it once two draft-04
 *           spellings are rewritten (`id` → `$id`, and the boolean
 *           `exclusiveMinimum` on multipleOf → its numeric form). Nothing
 *           else in it depends on draft-04 semantics.
 */

import { readFileSync } from "fs";
import path from "path";

import Ajv from "ajv";
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";

const SPEC_DIR = path.resolve(__dirname, "../fixtures/contracts/openapi-spec");

function load(name: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path.join(SPEC_DIR, name), "utf8")) as Record<string, unknown>;
}

export interface SpecValidation {
  valid: boolean;
  errors: string[];
}

let v31: ((doc: unknown) => SpecValidation) | null = null;
let v30: ((doc: unknown) => SpecValidation) | null = null;

function format(errors: { instancePath: string; message?: string; params?: unknown }[] | null | undefined): string[] {
  return (errors ?? []).slice(0, 25).map((e) => `${e.instancePath || "/"} ${e.message ?? ""} ${JSON.stringify(e.params ?? {})}`);
}

/** Every Schema Object a document carries, with where it sits. */
export function schemaObjects(doc: unknown): { at: string; schema: unknown }[] {
  const out: { at: string; schema: unknown }[] = [];
  const d = doc as Record<string, Record<string, Record<string, unknown>>>;
  const media = (at: string, content: unknown) => {
    for (const [type, m] of Object.entries((content ?? {}) as Record<string, { schema?: unknown }>)) {
      if (m.schema !== undefined) out.push({ at: `${at}/content/${type}`, schema: m.schema });
    }
  };
  for (const [name, s] of Object.entries(d.components?.schemas ?? {})) out.push({ at: `#/components/schemas/${name}`, schema: s });
  for (const [name, p] of Object.entries(d.components?.parameters ?? {})) out.push({ at: `#/components/parameters/${name}`, schema: (p as { schema?: unknown }).schema });
  for (const [name, h] of Object.entries(d.components?.headers ?? {})) out.push({ at: `#/components/headers/${name}`, schema: (h as { schema?: unknown }).schema });
  for (const [p, item] of Object.entries(d.paths ?? {})) {
    for (const [method, op] of Object.entries(item as Record<string, Record<string, unknown>>)) {
      const at = `#/paths/${p}/${method}`;
      for (const param of (op.parameters ?? []) as { schema?: unknown }[]) if (param.schema) out.push({ at: `${at}/parameters`, schema: param.schema });
      const body = op.requestBody as { content?: unknown } | undefined;
      if (body?.content) media(`${at}/requestBody`, body.content);
      for (const [status, r] of Object.entries((op.responses ?? {}) as Record<string, { content?: unknown; headers?: Record<string, { schema?: unknown }> }>)) {
        if (r.content) media(`${at}/responses/${status}`, r.content);
        for (const [h, hv] of Object.entries(r.headers ?? {})) if (hv.schema) out.push({ at: `${at}/responses/${status}/headers/${h}`, schema: hv.schema });
      }
    }
  }
  return out.filter((s) => s.schema !== undefined);
}

export function validateOpenApi31(doc: unknown): SpecValidation {
  if (!v31) {
    const ajv = new Ajv2020({ strict: false, allErrors: true, validateFormats: true });
    addFormats(ajv);
    // A format the 3.1 schema uses for media types; ajv-formats does not define it.
    ajv.addFormat("media-range", true);
    const validate = ajv.compile(
      JSON.parse(
        JSON.stringify(load("oas-3.1-schema-2022-10-07.json")).replaceAll('{"$dynamicRef":"#meta"}', '{"$ref":"#/$defs/schema"}'),
      ) as Record<string, unknown>,
    );
    v31 = (d) => {
      const errors: string[] = [];
      if (validate(d) !== true) errors.push(...format(validate.errors));
      for (const { at, schema } of schemaObjects(d)) {
        if (ajv.validateSchema(schema as Record<string, unknown>) !== true) {
          errors.push(...format(ajv.errors).map((e) => `${at} ${e}`));
        }
      }
      return { valid: errors.length === 0, errors };
    };
  }
  return v31(doc);
}

function draft04ToAjv(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(draft04ToAjv);
  if (!node || typeof node !== "object") return node;
  const out: Record<string, unknown> = {};
  const src = node as Record<string, unknown>;
  for (const [k, v] of Object.entries(src)) {
    if (k === "$schema") continue;
    if (k === "id" && typeof v === "string") out.$id = v;
    else if (k === "exclusiveMinimum" && v === true && typeof src.minimum === "number") out.exclusiveMinimum = src.minimum;
    else out[k] = draft04ToAjv(v);
  }
  if (out.exclusiveMinimum !== undefined && src.exclusiveMinimum === true) delete out.minimum;
  return out;
}

export function validateOpenApi30(doc: unknown): SpecValidation {
  if (!v30) {
    const ajv = new Ajv({ strict: false, allErrors: true, validateFormats: true });
    addFormats(ajv);
    const validate = ajv.compile(draft04ToAjv(load("oas-3.0-schema-2021-09-28.json")) as Record<string, unknown>);
    v30 = (d) => ({ valid: validate(d) === true, errors: format(validate.errors) });
  }
  return v30(doc);
}
