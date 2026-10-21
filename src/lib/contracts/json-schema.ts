/**
 * JSON Schemas from a compiled contract: the record a read returns, the body a
 * create sends, the body an update would send, and the key that names one
 * record.
 *
 * THE WIRE FORMAT, NOT THE MODEL. The broker passes SAP's rows through with
 * only the OData envelope removed (odata-envelope.ts), so each schema
 * describes what SAP's JSON actually carries — which differs by version:
 *
 *              OData V2 (SAP Gateway)          OData V4
 *   Int64      string of digits                integer
 *   Decimal    string                          number
 *   Double     string                          number
 *   DateTime   "/Date(ms)/"                    —
 *   DateTimeOffset "/Date(ms+0000)/"           RFC 3339 date-time
 *   Time       ISO 8601 duration "PT12H30M00S" —
 *   Date       —                               RFC 3339 full-date
 *   TimeOfDay  —                               hh:mm:ss[.f], no offset
 *
 * A schema that described the V4 shape for a V2 service would make every
 * consumer's validator reject every row.
 *
 * WHAT IS REQUIRED. A record requires its key, and nothing else: SAP omits
 * properties a $select did not ask for, and a later P1.4 query surface will
 * ask for fewer. A create body requires what the service marks mandatory
 * (Common.FieldControl, SuccessFactors' sap:required) — never what is merely
 * non-nullable, because SAP fills an omitted non-nullable field with its
 * initial value. Request bodies are closed (additionalProperties: false: SAP
 * refuses a property it does not declare); a record stays open, because a
 * customer's own extension fields arrive before the next compile does.
 *
 * TWO DIALECTS. "2020-12" is JSON Schema 2020-12, which OpenAPI 3.1 uses as is
 * (type arrays for null). "oas30" is OpenAPI 3.0.3's Schema Object (`nullable`
 * beside a `type`, `anyOf` with a null-only branch for a nullable `$ref`,
 * `format: byte` for base64). Facts JSON
 * Schema has no keyword for — the OData type, precision, scale, personal data —
 * travel as `x-` extensions, which both dialects allow.
 */

import {
  SAMPLED_TYPE_PREFIX,
  type InterfaceContract,
  type IrComplexType,
  type IrEnumType,
  type IrProperty,
  type ODataVersion,
} from "@/lib/contracts/ir";
import { toTypeName } from "@/lib/contracts/names";

export type SchemaDialect = "2020-12" | "oas30";

export type JsonSchema = Record<string, unknown>;

export interface ContractSchemaNames {
  record: string;
  create: string | null;
  update: string | null;
  key: string | null;
}

export interface ContractSchemas {
  /** Component name → schema; references between them use `ref`. */
  schemas: Record<string, JsonSchema>;
  names: ContractSchemaNames;
}

/**
 * The `${stem}_<suffix>` names given to something other than a type: the
 * bodies here, and the results and request the northbound document adds
 * (openapi.ts). A complex or enum type never takes one.
 */
export const RESERVED_SUFFIXES = ["Create", "Update", "Key", "ReadResult", "CreateResult", "CreateRequest"] as const;

export interface SchemaOptions {
  dialect: SchemaDialect;
  /** The prefix every component name of this contract starts with. */
  stem: string;
  /** How a component is referenced: "#/components/schemas/X" or "#/$defs/X". */
  ref: (name: string) => string;
}

const V2_DATE = "^/Date\\(-?\\d+([+-]\\d{4})?\\)/$";
const V2_TIME = "^PT(\\d+H)?(\\d+M)?(\\d+(\\.\\d+)?S)?$";
/** OData's Duration: days and time only, fractional seconds allowed — which JSON Schema's `duration` format refuses. */
const DURATION = "^-?P(\\d+D)?(T(\\d+H)?(\\d+M)?(\\d+(\\.\\d+)?S)?)?$";
const DECIMAL_STRING = "^[-+]?(\\d+(\\.\\d*)?|\\.\\d+)([eE][-+]?\\d+)?$";
const INTEGER_STRING = "^-?\\d+$";
/**
 * OData's TimeOfDay is hh:mm[:ss[.fffffffffff]] with NO offset; JSON Schema's
 * `time` format is RFC 3339 full-time, which requires one, so a validator
 * honouring the format would reject every real value. A pattern says it exactly.
 */
const TIME_OF_DAY = "^([01]\\d|2[0-3]):[0-5]\\d(:[0-5]\\d(\\.\\d{1,12})?)?$";

/** The schema of one primitive OData type on the wire, before nullability. */
function primitiveSchema(p: Pick<IrProperty, "type" | "maxLength" | "precision" | "scale">, v: ODataVersion, dialect: SchemaDialect): JsonSchema {
  const withLength = (s: JsonSchema): JsonSchema =>
    typeof p.maxLength === "number" ? { ...s, maxLength: p.maxLength } : s;
  const numeric = (s: JsonSchema): JsonSchema => ({
    ...s,
    ...(p.precision !== undefined ? { "x-odata-precision": p.precision } : {}),
    ...(p.scale !== undefined ? { "x-odata-scale": p.scale } : {}),
  });
  switch (p.type) {
    case "Edm.String":
      return withLength({ type: "string" });
    case "Edm.Boolean":
      return { type: "boolean" };
    case "Edm.Byte":
      return { type: "integer", minimum: 0, maximum: 255 };
    case "Edm.SByte":
      return { type: "integer", minimum: -128, maximum: 127 };
    case "Edm.Int16":
      return { type: "integer", format: "int32", minimum: -32768, maximum: 32767 };
    case "Edm.Int32":
      return { type: "integer", format: "int32" };
    case "Edm.Int64":
      return v === "V2" ? { type: "string", format: "int64", pattern: INTEGER_STRING } : { type: "integer", format: "int64" };
    case "Edm.Decimal":
      return numeric(v === "V2" ? { type: "string", format: "decimal", pattern: DECIMAL_STRING } : { type: "number", format: "decimal" });
    case "Edm.Double":
      return v === "V2" ? { type: "string", format: "double", pattern: DECIMAL_STRING } : { type: "number", format: "double" };
    case "Edm.Single":
      return v === "V2" ? { type: "string", format: "float", pattern: DECIMAL_STRING } : { type: "number", format: "float" };
    case "Edm.Guid":
      return { type: "string", format: "uuid" };
    case "Edm.DateTime":
      return { type: "string", pattern: V2_DATE };
    case "Edm.DateTimeOffset":
      return v === "V2" ? { type: "string", pattern: V2_DATE } : { type: "string", format: "date-time" };
    case "Edm.Time":
      return { type: "string", pattern: V2_TIME };
    case "Edm.Date":
      return { type: "string", format: "date" };
    case "Edm.TimeOfDay":
      return { type: "string", pattern: TIME_OF_DAY };
    case "Edm.Duration":
      return { type: "string", pattern: DURATION };
    case "Edm.Binary": {
      // MaxLength counts BYTES; the wire carries base64 (V2) or base64url
      // (V4), four characters per three bytes. The bound on the string is the
      // padded encoded length — never less than the unpadded one — and the
      // byte count travels as an extension.
      const s: JsonSchema =
        dialect === "oas30" ? { type: "string", format: "byte" } : { type: "string", contentEncoding: v === "V4" ? "base64url" : "base64" };
      return typeof p.maxLength === "number"
        ? { ...s, maxLength: 4 * Math.ceil(p.maxLength / 3), "x-odata-max-length": p.maxLength }
        : s;
    }
    default:
      if (p.type.startsWith("Edm.Geography") || p.type.startsWith("Edm.Geometry")) return { type: "object", description: "GeoJSON." };
      // Edm.Untyped, Edm.PrimitiveType, or a type the compiler does not know:
      // any value. A guess would be a contract the rows can break.
      return {};
  }
}

/** A sampled property: what JSON type was seen, or anything. */
function sampledSchema(p: IrProperty): JsonSchema {
  const t = p.type.slice(SAMPLED_TYPE_PREFIX.length);
  return t === "" ? {} : { type: t };
}

/**
 * A nullable reference in OpenAPI 3.0.3. `nullable` adds null only to a
 * `type` in the SAME Schema Object, so `{ allOf: [{ $ref }], nullable: true }`
 * still refuses null (and validators refuse to compile it: nullable without a
 * type). The reference OR a branch that admits null and nothing else says it
 * exactly. `type` is the referenced schema's own type, which that branch must
 * name for `nullable` to apply.
 */
export function nullableRef30(ref: JsonSchema, type: "object" | "string"): JsonSchema {
  return { anyOf: [ref, { type, nullable: true, enum: [null] }] };
}

/** Make a schema nullable in the dialect's own way. `refType` is what a `$ref` points at. */
function nullable(s: JsonSchema, dialect: SchemaDialect, refType: "object" | "string" = "object"): JsonSchema {
  if (dialect === "oas30") {
    if ("$ref" in s) return nullableRef30(s, refType);
    if (Object.keys(s).length === 0) return s; // already anything, null included
    const out: JsonSchema = { ...s, nullable: true };
    if (Array.isArray(s.enum)) out.enum = [...(s.enum as unknown[]), null];
    return out;
  }
  if ("$ref" in s) return { anyOf: [s, { type: "null" }] };
  if (typeof s.type === "string") {
    const out: JsonSchema = { ...s, type: [s.type, "null"] };
    if (Array.isArray(s.enum)) out.enum = [...(s.enum as unknown[]), null];
    return out;
  }
  return s;
}

function annotate(s: JsonSchema, p: IrProperty, readOnly: boolean): JsonSchema {
  const out: JsonSchema = { ...s };
  if (p.label) out.title = p.label;
  if (p.quickInfo && p.quickInfo !== p.label) out.description = p.quickInfo;
  if (!p.type.startsWith(SAMPLED_TYPE_PREFIX)) out["x-odata-type"] = p.collection ? `Collection(${p.type})` : p.type;
  if (p.semantics) out["x-sap-semantics"] = p.semantics;
  if (p.displayFormat) out["x-sap-display-format"] = p.displayFormat;
  if (p.personalData) out["x-personal-data"] = p.personalData;
  if (readOnly) out.readOnly = true;
  return out;
}

export function buildContractSchemas(contract: InterfaceContract, opts: SchemaOptions): ContractSchemas {
  const { dialect, stem, ref } = opts;
  const v = contract.odataVersion;
  const sampled = contract.source === "SAMPLED";
  const schemas: Record<string, JsonSchema> = {};

  /**
   * One component name per type, by qualified name. toTypeName folds distinct
   * names together (Price_Info and PriceInfo; the same name in two schemas),
   * and a type called Create or Key would land on a body's name; either way
   * one schema overwrote another and properties pointed at the wrong, closed
   * one. The names this module and the northbound document give the record,
   * its bodies and results are taken first; a type that still collides gets a
   * numeric suffix, in the contract's own order.
   */
  const used = new Set<string>([stem, ...RESERVED_SUFFIXES.map((s) => `${stem}_${s}`)]);
  const componentOf = new Map<string, string>();
  for (const t of [...contract.complexTypes, ...contract.enumTypes]) {
    if (componentOf.has(t.qualifiedName)) continue;
    const base = `${stem}_${toTypeName(t.name)}`;
    let name = base;
    for (let i = 2; used.has(name); i++) name = `${base}${i}`;
    used.add(name);
    componentOf.set(t.qualifiedName, name);
  }
  const complexName = (ct: { qualifiedName: string }) => componentOf.get(ct.qualifiedName)!;
  const enumName = (en: { qualifiedName: string }) => componentOf.get(en.qualifiedName)!;
  const complexByName = new Map(contract.complexTypes.map((t) => [t.qualifiedName, t]));
  const enumByName = new Map(contract.enumTypes.map((t) => [t.qualifiedName, t]));

  /** One property's value schema: primitive, enum or complex; collection; nullability. */
  const valueSchema = (p: IrProperty): JsonSchema => {
    let s: JsonSchema;
    let refType: "object" | "string" = "object";
    if (sampled) s = sampledSchema(p);
    else if (complexByName.has(p.type)) s = { $ref: ref(complexName(complexByName.get(p.type)!)) };
    else if (enumByName.has(p.type)) {
      s = { $ref: ref(enumName(enumByName.get(p.type)!)) };
      refType = "string"; // an enum value travels as its member name(s)
    } else s = primitiveSchema(p, v, dialect);
    if (p.collection) return { type: "array", items: s };
    return p.nullable ? nullable(s, dialect, refType) : s;
  };

  const objectOf = (props: readonly IrProperty[], include: (p: IrProperty) => boolean, readOnlyOf: (p: IrProperty) => boolean) =>
    Object.fromEntries(
      props.filter(include).map((p) => {
        const s = annotate(valueSchema(p), p, readOnlyOf(p));
        // A $ref beside sibling keywords is legal in 2020-12 but ignored by
        // 3.0 tooling: wrap it so the label survives in both.
        if (dialect === "oas30" && "$ref" in s && Object.keys(s).length > 1) {
          const { $ref, ...rest } = s;
          return [p.name, { ...rest, allOf: [{ $ref }] }];
        }
        return [p.name, s];
      }),
    );

  const writable = (p: IrProperty) => p.capabilities?.computed !== true;
  const readOnlyInRecord = (p: IrProperty) =>
    p.capabilities?.computed === true || (p.capabilities?.creatable === false && p.capabilities?.updatable === false);

  for (const ct of contract.complexTypes) schemas[complexName(ct)] = complexSchema(ct);
  for (const en of contract.enumTypes) schemas[enumName(en)] = enumSchema(en);

  function complexSchema(ct: IrComplexType): JsonSchema {
    return {
      type: "object",
      ...(ct.label ? { title: ct.label } : {}),
      "x-odata-type": ct.qualifiedName,
      properties: objectOf(ct.properties, () => true, () => false),
      additionalProperties: ct.openType === true,
    };
  }

  function enumSchema(en: IrEnumType): JsonSchema {
    // V4 JSON carries an enum value as its member NAME; a flags enum as a
    // comma-separated list of names, which no enum keyword can state.
    return en.isFlags
      ? { type: "string", "x-odata-type": en.qualifiedName, description: `Comma-separated members of ${en.name}.` }
      : { type: "string", "x-odata-type": en.qualifiedName, enum: en.members.map((m) => m.name) };
  }

  const et = contract.entityType;
  const set = contract.entitySet;
  const keySet = new Set(et.key);
  const title = set.label ?? et.label;

  schemas[stem] = {
    type: "object",
    ...(title ? { title } : {}),
    description: sampled
      ? "Inferred from rows a live read returned, because the service's description could not be read. Fields outside the sample are not described."
      : `A ${set.name} record as the service returns it, compiled from the service's own description.`,
    "x-odata-entity-set": set.name,
    ...(sampled ? {} : { "x-odata-entity-type": et.qualifiedName, "x-odata-key": et.key }),
    ...(et.personalData ? { "x-personal-data": et.personalData } : {}),
    properties: objectOf(et.properties, () => true, readOnlyInRecord),
    ...(et.key.length > 0 ? { required: [...et.key] } : {}),
    additionalProperties: true,
  };

  const names: ContractSchemaNames = { record: stem, create: null, update: null, key: null };
  if (sampled) return { schemas, names };

  if (set.capabilities.creatable !== false && set.singleton !== true) {
    const props = et.properties.filter((p) => writable(p) && p.capabilities?.creatable !== false);
    const required = props.filter((p) => p.capabilities?.mandatory === true).map((p) => p.name);
    names.create = `${stem}_Create`;
    schemas[names.create] = {
      type: "object",
      ...(title ? { title: `${title} (create)` } : {}),
      description: `The record a create sends to ${set.name}. Computed and non-creatable properties are left out; required lists what the service marks mandatory.`,
      properties: objectOf(props, () => true, () => false),
      ...(required.length > 0 ? { required } : {}),
      additionalProperties: false,
    };
  }

  if (set.capabilities.updatable !== false) {
    const props = et.properties.filter(
      (p) =>
        writable(p) && !keySet.has(p.name) && p.capabilities?.updatable !== false && p.capabilities?.immutable !== true,
    );
    names.update = `${stem}_Update`;
    schemas[names.update] = {
      type: "object",
      ...(title ? { title: `${title} (update)` } : {}),
      description: `The changes an update sends to one ${set.name} record (PATCH semantics: send only what changes). Keys, computed, immutable and non-updatable properties are left out.`,
      properties: objectOf(props, () => true, () => false),
      additionalProperties: false,
    };
  }

  if (et.key.length > 0) {
    names.key = `${stem}_Key`;
    schemas[names.key] = {
      type: "object",
      ...(title ? { title: `${title} (key)` } : {}),
      description: `The key that names one ${set.name} record.`,
      properties: objectOf(et.properties, (p) => keySet.has(p.name), () => false),
      required: [...et.key],
      additionalProperties: false,
    };
  }

  return { schemas, names };
}

/**
 * Self-contained JSON Schema 2020-12 documents — the record, and the bodies
 * where the contract has them — each carrying the types it reaches in $defs.
 * What the northbound /schema endpoint serves.
 */
export function standaloneSchemas(contract: InterfaceContract, stem: string): {
  record: JsonSchema;
  create: JsonSchema | null;
  update: JsonSchema | null;
  key: JsonSchema | null;
} {
  const built = buildContractSchemas(contract, { dialect: "2020-12", stem, ref: (n) => `#/$defs/${n}` });
  const shared = Object.fromEntries(
    Object.entries(built.schemas).filter(([n]) => !Object.values(built.names).includes(n)),
  );
  const wrap = (name: string | null): JsonSchema | null =>
    name === null
      ? null
      : {
          $schema: "https://json-schema.org/draft/2020-12/schema",
          ...built.schemas[name],
          ...(Object.keys(shared).length > 0 ? { $defs: shared } : {}),
        };
  return {
    record: wrap(built.names.record)!,
    create: wrap(built.names.create),
    update: wrap(built.names.update),
    key: wrap(built.names.key),
  };
}
