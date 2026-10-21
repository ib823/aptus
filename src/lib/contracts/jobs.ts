/**
 * EVERY CONTRACT COMPILER JOB, as pure functions that run inside a worker
 * (envelope.ts: a heap cap and a deadline) and never on a request's own
 * thread (P1.3). Tenant-supplied bytes — a $metadata description, sampled
 * rows, a fixture body — are parsed only here.
 *
 *   record   a verify's description: parse → IR → slice → canonical digest,
 *            the dataset summary, the /schema texts, and the diffs against
 *            the interface's previous heads;
 *   capture  capture-schema's request: parse and validate it, infer the
 *            captured schema, and the sampled contract made from it as
 *            `record` makes one (digest, /schema texts, diffs);
 *   fixture  capture-fixture's request: parse, validate, strip the OData
 *            envelope, and the compact body to store;
 *   render   the starter kit or the solution document, from what was stored.
 *
 * /SCHEMA IS RENDERED HERE, ONCE. Its texts — the four schemas and the create
 * and update bodies — are rendered when the snapshot is recorded, under
 * schemaLimit (at most 1 MiB together; past it OUTPUT_TOO_LARGE, nothing
 * stored), and served from the snapshot row as they are, so the
 * consumer-facing read path never renders anything.
 *
 * WHAT CROSSES BACK IS BOUNDED, AND TEXT. Everything the request thread only
 * stores or sends — the IR, the stored diffs, the /schema texts, the captured
 * schema, the fixture body, a kit or document — comes back as UTF-8 bytes
 * (Text), transferred, never copied (compile.worker.ts), and is written as
 * it is. What it reads — the hash, the sizes, the facts, the dataset summary,
 * a diff's headline — crosses as small values beside them.
 */

import { z } from "zod";

import { BudgetExceeded, contractLimit, jsonText, LIMITS, OutputBudget, schemaLimit } from "@/lib/contracts/budget";
import { contractDigest, inJsonbKeyOrder } from "@/lib/contracts/canonical";
import { compileContract, type CompileRefusal } from "@/lib/contracts/compile";
import { readDatasets, summarizeDatasets, type DatasetSummary } from "@/lib/contracts/datasets";
import { diffContracts, storedDiff, type Bump } from "@/lib/contracts/diff";
import type { InterfaceContract, ODataVersion } from "@/lib/contracts/ir";
import { contractBodies, standaloneSchemas } from "@/lib/contracts/json-schema";
import { toTypeName } from "@/lib/contracts/names";
import { buildNorthboundOpenApi, documentJson, type NorthboundDocInput } from "@/lib/contracts/openapi";
import { hydrateJsonTexts } from "@/lib/contracts/render-input";
import { contractFromSample, sampledODataVersion } from "@/lib/contracts/sampled";
import { sliceForEntitySet } from "@/lib/contracts/slice";
import {
  buildFixtureBody,
  isFixtureScenario,
  isReadStatus,
  SCENARIO_STATUS,
  scenarioForOutcome,
  scenarioForReadStatus,
} from "@/lib/studio/fixtures";
import { buildScaffold, safeName, type ScaffoldFixture, type ScaffoldInterface, type WithheldFixture } from "@/lib/studio/scaffold";
import { inferResponseSchema, rowsPastCaptureBound } from "@/lib/studio/schema-capture";

/** Why a job did not give its answer (envelope.ts). */
export type EnvelopeRefusal =
  /** The job ran out of heap, stack or time: the input is built to be expensive, or is simply too much. */
  | "RESOURCE_LIMIT"
  /** No slot within the wait: the next attempt will run. */
  | "BUSY"
  /** The organisation has used its compiler time for today (contract-time.ts). */
  | "ALLOWANCE"
  /** The compiler is turned off (COREEDGE_CONTRACT_ISOLATES=0). */
  | "DISABLED"
  /** The worker could not be started, or its heap was not capped: nothing ran. */
  | "UNAVAILABLE"
  /** The job threw: a defect, refused rather than surfaced. */
  | "INTERNAL";

/** Text a job sends back: UTF-8 bytes, encoded here, transferred to the request thread and written as they are. */
export type Text = Uint8Array<ArrayBuffer>;

const encoder = new TextEncoder();
const decoder = new TextDecoder();
export const utf8 = (s: string): Text => encoder.encode(s) as Text;
/** A Text as a string (for a write that takes one, and for a test). */
export const textOf = (t: Text): string => decoder.decode(t);

/** What the record states of a contract beside its IR, without reading it on the request thread. */
export interface ContractFacts {
  source: InterfaceContract["source"];
  odataVersion: ODataVersion;
  irVersion: InterfaceContract["irVersion"];
  /** Whether it has a create and an update body (contractBodies). */
  bodies: { create: boolean; update: boolean };
}

/** What GET /schema serves, as compact JSON: the four schemas, and the create and update bodies (null when none). */
export interface SchemaTexts<T = Text> {
  schemas: T;
  create: T | null;
  update: T | null;
}

/** How many of a diff's changes the verify reports. */
export const DIFF_HEADLINE_CHANGES = 10;

/** A diff against one previous head: its bump, the stored diff as its text, and its first changes as sentences. */
export interface DiffOut {
  bump: Bump | null;
  stored: Text;
  headline: string[];
  omitted?: number;
}

/** A contract made ready to record: digested, its /schema texts rendered, diffed against the previous heads. */
export type RecordableContract =
  | {
      ok: true;
      hash: string;
      bytes: number;
      facts: ContractFacts;
      ir: Text;
      texts: SchemaTexts;
      /** One per previous head, in order; null when the hash says the record is UNCHANGED (unchangedHashes). */
      diffs: DiffOut[] | null;
    }
  | {
      ok: false;
      reason: "NO_SUCH_ENTITY_SET" | "NO_SUCH_ENTITY_TYPE" | "TOO_LARGE" | "OUTPUT_TOO_LARGE";
      detail: string;
      /** Canonical bytes, when the refusal is the contract's own size. */
      bytes?: number;
    };

/** The interface's previous heads, as record and capture are handed them (snapshot.ts, loadRecordHeads). */
export interface PreviousHeads {
  /** Their IRs as stored text (ir::text), parsed here. */
  previous: string[];
  /** Hashes whose record is certainly UNCHANGED: no diff is taken for them. */
  unchangedHashes: string[];
  /**
   * The interface's current row — the newest of its service and dataset, the
   * row /schema serves — as its hash and stored IR text; absent or null when
   * it has none. A contract with that hash IS that row's contract: it is
   * recorded with that IR text, and its /schema texts are rendered from it,
   * so an UNCHANGED verify of the same fields in another order never writes
   * texts that differ from the row's IR, the kit and the document.
   */
  current?: { hash: string; ir: string } | null;
}

/** What a verify learns from a description: never the IR itself. */
export type CompiledService =
  | {
      ok: true;
      format: "xml" | "json";
      odataVersion: ODataVersion;
      /** The entity sets it declares (not its singletons), summarised (datasets.ts). */
      datasets: DatasetSummary;
      sourceLength: number;
      /** The interface's dataset, made ready to record; null when none was asked for. */
      dataset: RecordableContract | null;
    }
  | {
      ok: false;
      reason: CompileRefusal | EnvelopeRefusal;
      detail: string;
      /** A description the compiler refused is still read by the older reader, in the same job; absent when no job ran. */
      datasets?: DatasetSummary;
      /** For a refusal that has a known end (ALLOWANCE): how long until a job may run. */
      retryAfterMs?: number;
    };

export interface RecordJobInput extends PreviousHeads {
  description: string;
  /** The interface's dataset; null or "" for none. */
  entitySet: string | null;
}

/** The /schema texts of a contract, under one budget (schemaLimit of its canonical bytes): BudgetExceeded past it. */
export function renderSchemaTexts(contract: InterfaceContract, entitySet: string, contractBytes: number): SchemaTexts<string> {
  const budget = new OutputBudget("schema", schemaLimit(contractBytes));
  const schemas = standaloneSchemas(contract, toTypeName(entitySet));
  return {
    schemas: jsonText(schemas, budget),
    create: schemas.create ? jsonText(schemas.create, budget) : null,
    update: schemas.update ? jsonText(schemas.update, budget) : null,
  };
}

/** Digest, render the /schema texts, and diff: what a record stores, or the budget that refused it. */
export function recordableContract(
  contract: InterfaceContract,
  sourceLength: number | undefined,
  entitySet: string,
  heads: PreviousHeads,
): RecordableContract {
  const limit = contractLimit(sourceLength);
  let digest: { hash: string; bytes: number };
  let texts: SchemaTexts<string>;
  try {
    digest = contractDigest(contract, new OutputBudget("contract", limit));
  } catch (err) {
    if (!(err instanceof BudgetExceeded)) throw err;
    return { ok: false, reason: "TOO_LARGE", bytes: err.spent, detail: `The compiled contract is larger than ${Math.floor(limit / 1024)} KB, so it was not recorded.` };
  }
  /*
   * RENDERED FROM THE IR AS STORED. The row's IR is jsonb, which keeps keys in
   * its own order, and the kit and the document render `ir::text`: so the
   * texts are rendered from the same order (inJsonbKeyOrder), or — when this
   * contract is the current row's (same hash) — from that row's stored text
   * itself, which this record then keeps as its IR too.
   */
  const stored = heads.current && heads.current.hash === digest.hash ? heads.current.ir : null;
  try {
    texts = renderSchemaTexts(stored === null ? inJsonbKeyOrder(contract) : (JSON.parse(stored) as InterfaceContract), entitySet, digest.bytes);
  } catch (err) {
    if (!(err instanceof BudgetExceeded)) throw err;
    return {
      ok: false,
      reason: "OUTPUT_TOO_LARGE",
      detail: `The schemas generated from this contract would be larger than ${Math.max(1, Math.floor(err.limit / (1024 * 1024)))} MB, so it was not recorded.`,
    };
  }
  const diffs = heads.unchangedHashes.includes(digest.hash)
    ? null
    : heads.previous.map((text) => {
        const d = diffContracts(JSON.parse(text) as InterfaceContract, contract);
        const stored = storedDiff(d);
        return {
          bump: d.bump,
          stored: utf8(JSON.stringify(stored)),
          headline: stored.changes.slice(0, DIFF_HEADLINE_CHANGES).map((c) => c.change),
          ...(stored.omitted !== undefined ? { omitted: stored.omitted } : {}),
        };
      });
  return {
    ok: true,
    hash: digest.hash,
    bytes: digest.bytes,
    facts: { source: contract.source, odataVersion: contract.odataVersion, irVersion: contract.irVersion, bodies: contractBodies(contract) },
    ir: utf8(stored ?? JSON.stringify(contract)),
    texts: { schemas: utf8(texts.schemas), create: texts.create === null ? null : utf8(texts.create), update: texts.update === null ? null : utf8(texts.update) },
    diffs,
  };
}

/** The verify's job: the description compiled, its datasets summarised, the interface's dataset made ready to record. */
export function recordJob(input: RecordJobInput): CompiledService {
  const entitySet = input.entitySet || null;
  const r = compileContract(input.description);
  // Refused by the compiler: the older reader lists the datasets, here, never on the request thread.
  if (!r.ok) return { ...r, datasets: readDatasets(input.description, entitySet) };
  const datasets = summarizeDatasets(
    r.ir.entitySets.filter((e) => e.singleton !== true).map((e) => e.name),
    entitySet,
  );
  let dataset: RecordableContract | null = null;
  if (entitySet) {
    const slice = sliceForEntitySet(r.ir, entitySet, r.sourceLength);
    dataset = slice.ok ? recordableContract(slice.contract, r.sourceLength, entitySet, input) : { ok: false, reason: slice.reason, detail: slice.detail };
  }
  return { ok: true, format: r.format, odataVersion: r.ir.odataVersion, datasets, sourceLength: r.sourceLength, dataset };
}

// ---------------------------------------------------------------- capture-schema

const captureSchemaBody = z.object({
  /** Rows from a real run. Used to infer a shape, then discarded. */
  rows: z.array(z.record(z.string(), z.unknown())).min(1).max(100),
  /** The contract the run was against, as broker-run reported it (optional: a console open across a deploy). */
  interfaceVersion: z.number().int().min(1).optional(),
  entitySet: z.string().max(200).nullable().optional(),
});

/** What a capture's request claims about the contract its run was against (contract-provenance.ts). */
export interface ClaimedContract {
  interfaceVersion?: number | undefined;
  entitySet?: string | null | undefined;
}

export interface CaptureJobInput extends PreviousHeads {
  /** The request body as it was read (≤ LIMITS.capturedSchema.requestBytes). */
  body: string;
  /** When it is captured (ISO), stamped into the schema. */
  capturedAt: string;
  /** The interface's contract, stamped into the schema. */
  iface: { version: number; entitySet: string | null };
  /** The OData version the interface or its service declares, when known. */
  declaredVersion: string | null;
  /** Whether the sampled contract is wanted (no compiled one describes the interface, and it names a dataset). */
  record: boolean;
}

export type CaptureJobOutput =
  | { ok: false; reason: "INVALID" | "TOO_MANY_FIELDS" | "NO_FIELDS" }
  | {
      ok: true;
      claimed: ClaimedContract;
      /** The captured schema as compact JSON, to store on the interface. */
      schema: Text;
      fields: number;
      required: number;
      sampleSize: number;
      /** The sampled contract; null when not wanted, NO_VERSION when the rows' OData version cannot be told. */
      contract: RecordableContract | { ok: false; reason: "NO_VERSION" } | null;
    };

export function captureJob(input: CaptureJobInput): CaptureJobOutput {
  let value: unknown;
  try {
    value = JSON.parse(input.body);
  } catch {
    return { ok: false, reason: "INVALID" };
  }
  // A row wider than a schema could describe is refused before it is validated (a pass over every key).
  if (rowsPastCaptureBound((value as { rows?: unknown } | null)?.rows)) return { ok: false, reason: "TOO_MANY_FIELDS" };
  const parsed = captureSchemaBody.safeParse(value);
  if (!parsed.success) return { ok: false, reason: "INVALID" };
  const { rows } = parsed.data;
  let schema: ReturnType<typeof inferResponseSchema>;
  try {
    schema = inferResponseSchema(rows, new Date(input.capturedAt), input.iface);
  } catch (err) {
    if (err instanceof BudgetExceeded) return { ok: false, reason: "TOO_MANY_FIELDS" };
    throw err;
  }
  if (!schema) return { ok: false, reason: "NO_FIELDS" };
  let contract: Extract<CaptureJobOutput, { ok: true }>["contract"] = null;
  if (input.record && input.iface.entitySet) {
    const version = sampledODataVersion(input.declaredVersion, rows);
    contract = version
      ? recordableContract(contractFromSample(schema, input.iface.entitySet, version), undefined, input.iface.entitySet, input)
      : { ok: false, reason: "NO_VERSION" };
  }
  return {
    ok: true,
    claimed: { interfaceVersion: parsed.data.interfaceVersion, entitySet: parsed.data.entitySet },
    schema: utf8(JSON.stringify(schema)),
    fields: Object.keys(schema.properties).length,
    required: schema.required.length,
    sampleSize: schema["x-captured"].sampleSize,
    contract,
  };
}

// ---------------------------------------------------------------- capture-fixture

const captureFixtureBody = z.object({
  /** The broker's read outcome for the run (NorthboundReadStatus). Preferred. */
  readStatus: z.string().min(1).optional(),
  /** The honest status the run reported — what a console from before readStatus sends. */
  honestStatus: z.string().min(1).optional(),
  /** The broker's sentence for the run, served as the fixture's error message. */
  detail: z.string().max(2000).optional(),
  interfaceVersion: z.number().int().min(1).optional(),
  entitySet: z.string().max(200).nullable().optional(),
  /** The status the TENANT returned on that run; absent is recorded as null, never defaulted. */
  sourceStatus: z.number().int().min(100).max(599).optional(),
  rows: z.array(z.record(z.string(), z.unknown())).default([]),
});

export interface FixtureJobInput {
  /** The request body as it was read (≤ LIMITS.fixture.requestBytes). */
  body: string;
}

export type FixtureJobOutput =
  | { ok: false; reason: "INVALID" | "NOT_RECORDABLE" | "TOO_LARGE" }
  | {
      ok: true;
      claimed: ClaimedContract;
      scenario: string;
      status: number;
      sourceStatus: number | null;
      rows: number;
      /** The body to store, as compact JSON (≤ LIMITS.fixture.bytes). */
      body: Text;
    };

export function fixtureJob(input: FixtureJobInput): FixtureJobOutput {
  let value: unknown;
  try {
    value = JSON.parse(input.body);
  } catch {
    return { ok: false, reason: "INVALID" };
  }
  const parsed = captureFixtureBody.safeParse(value);
  if (!parsed.success) return { ok: false, reason: "INVALID" };
  const { readStatus, honestStatus, rows } = parsed.data;
  const scenario =
    readStatus !== undefined
      ? isReadStatus(readStatus)
        ? scenarioForReadStatus(readStatus, rows.length)
        : null
      : honestStatus !== undefined
        ? scenarioForOutcome(honestStatus, rows.length, parsed.data.sourceStatus)
        : null;
  // A run that failed for a local reason teaches a consumer nothing about how the tenant behaves.
  if (!scenario || !isFixtureScenario(scenario)) return { ok: false, reason: "NOT_RECORDABLE" };
  const body = buildFixtureBody(scenario, rows, parsed.data.detail);
  const text = utf8(JSON.stringify(body));
  if (text.byteLength > LIMITS.fixture.bytes) return { ok: false, reason: "TOO_LARGE" };
  return {
    ok: true,
    claimed: { interfaceVersion: parsed.data.interfaceVersion, entitySet: parsed.data.entitySet },
    scenario,
    status: SCENARIO_STATUS[scenario],
    sourceStatus: parsed.data.sourceStatus ?? null,
    rows: body.records?.length ?? 0,
    body: text,
  };
}

// ---------------------------------------------------------------- render (the starter kit, the solution document)

/**
 * A Studio download, from what was stored: everything it needs as plain data
 * (stored JSON as references to its text, render-input.ts), under `limit`
 * bytes — its budget, computed by the route from the sizes it stored.
 */
export type RenderJobInput =
  | {
      /** The starter kit's files (scaffold.ts). */
      path: "kit";
      iface: ScaffoldInterface;
      baseUrl: string;
      fixtures: ScaffoldFixture[];
      withheld: WithheldFixture[];
      limit: number;
    }
  | {
      /** The per-solution OpenAPI document; `safe` is always safeName, and the budget is `limit`. */
      path: "document";
      doc: Omit<NorthboundDocInput, "safe" | "budget">;
      limit: number;
    };

/** The download as it is sent (the kit's files as JSON, the document as downloaded), or the budget that stopped it. */
export type RenderJobOutput = { ok: true; text: Text } | { ok: false; reason: "TOO_LARGE"; limit: number };

/** Render a download under its budget; each text is written by the one budgeted writer, so it stops there. */
export function renderJob(stored: RenderJobInput): RenderJobOutput {
  const input = hydrateJsonTexts(stored);
  try {
    if (input.path === "kit") {
      const files = buildScaffold(input.iface, input.baseUrl, input.fixtures, input.withheld, new OutputBudget("kit", input.limit));
      // The files' contents were charged as they were written; their JSON escapes are a bounded multiple of them.
      return { ok: true, text: utf8(JSON.stringify(files)) };
    }
    const doc = buildNorthboundOpenApi({ ...input.doc, safe: safeName, budget: new OutputBudget("document", input.limit) });
    return { ok: true, text: utf8(documentJson(doc, new OutputBudget("document", input.limit))) };
  } catch (err) {
    if (err instanceof BudgetExceeded) return { ok: false, reason: "TOO_LARGE", limit: stored.limit };
    throw err;
  }
}

// ---------------------------------------------------------------- texts (a stored row, re-rendered)

/**
 * A stored snapshot's /schema texts rendered again from what the row holds —
 * its IR as `ir::text`, its dataset and its canonical size — after a deploy
 * that changed SCHEMA_TEXTS_VERSION (scripts/rerender-schema-texts.ts). The
 * same render the record wrote, from the same text, so the same bytes the
 * running renderer would write for that row; SAP is not asked.
 */
export interface TextsJobInput {
  ir: string;
  entitySet: string;
  bytes: number;
}

export type TextsJobOutput = { ok: true; texts: SchemaTexts } | { ok: false; reason: "OUTPUT_TOO_LARGE" };

export function textsJob(input: TextsJobInput): TextsJobOutput {
  try {
    const t = renderSchemaTexts(JSON.parse(input.ir) as InterfaceContract, input.entitySet, input.bytes);
    return { ok: true, texts: { schemas: utf8(t.schemas), create: t.create === null ? null : utf8(t.create), update: t.update === null ? null : utf8(t.update) } };
  } catch (err) {
    if (err instanceof BudgetExceeded) return { ok: false, reason: "OUTPUT_TOO_LARGE" };
    throw err;
  }
}

// ---------------------------------------------------------------- the jobs

export type Job =
  | { kind: "record"; input: RecordJobInput }
  | { kind: "capture"; input: CaptureJobInput }
  | { kind: "fixture"; input: FixtureJobInput }
  | { kind: "render"; input: RenderJobInput }
  | { kind: "texts"; input: TextsJobInput };

export type JobOutput<K extends Job["kind"]> = K extends "record"
  ? CompiledService
  : K extends "capture"
    ? CaptureJobOutput
    : K extends "fixture"
      ? FixtureJobOutput
      : K extends "texts"
        ? TextsJobOutput
        : RenderJobOutput;

export function runJob(job: Job): unknown {
  switch (job.kind) {
    case "record":
      return recordJob(job.input);
    case "capture":
      return captureJob(job.input);
    case "fixture":
      return fixtureJob(job.input);
    case "render":
      return renderJob(job.input);
    case "texts":
      return textsJob(job.input);
  }
}
