/**
 * EVERYTHING THE CONTRACT COMPILER DOES WITH A HOSTILE DESCRIPTION, as three
 * pure jobs that run inside the envelope (envelope.ts, a worker with a heap
 * cap and a deadline) and never on the request's own thread (P1.3,
 * structural containment):
 *
 *   compile  parse → IR → annotate → slice → canonical digest → render and
 *            measure every output a read path will ever produce from it;
 *   prepare  the same from "canonical digest" on, for a contract that did not
 *            come from a description (a sampled capture, a test);
 *   diff     the structural diff against earlier snapshots, as stored;
 *   render   a read path's output (/schema, the starter kit, the solution
 *            document) from what was stored, when it is too large to render
 *            on the request thread (read-render.ts).
 *
 * WHY RENDER AT RECORD TIME. /schema, the starter kit and the per-solution
 * OpenAPI render a stored contract on every read. Each is rendered HERE first,
 * under the very budget its read path will apply (budget.ts: schemaLimit,
 * kitLimit, documentLimit, all functions of the contract's canonical size,
 * which the snapshot keeps as irBytes), and inside the envelope's deadline.
 * A contract whose outputs would not fit is refused now (OUTPUT_TOO_LARGE,
 * reported NOT_COMPILED) and never stored; one that fits was rendered once
 * already in bounded time, and a read renders the same contract with the
 * same deterministic renderers within the same bytes. So no read path ever
 * meets a contract nobody has rendered.
 *
 * What crosses back to the request thread is bounded: the version the verify
 * reports, the description's datasets as a bounded summary (datasets.ts: at
 * most MAX_LISTED_DATASETS names, a count, and whether the interface's
 * dataset is there) — taken here whether the compiler read the description
 * or refused it and the older reader did (structural hardening round 3) —
 * and the one sliced contract with its digest and sizes (the contract budget
 * caps it). Never the service's whole IR, nor one entry per declared set.
 */

import {
  BudgetExceeded,
  contractLimit,
  documentLimit,
  jsonText,
  kitLimit,
  LIMITS,
  OutputBudget,
  renderCheckpoint,
  type RenderLimits,
  schemaLimit,
  withRenderDeadline,
  writeJson,
} from "@/lib/contracts/budget";
import { contractDigest } from "@/lib/contracts/canonical";
import { compileContract, type CompileRefusal, type CompileResult } from "@/lib/contracts/compile";
import { readDatasets, summarizeDatasets, type DatasetSummary } from "@/lib/contracts/datasets";
import { diffContracts, storedDiff, type Bump, type StoredContractDiff } from "@/lib/contracts/diff";
import type { InterfaceContract, ODataVersion } from "@/lib/contracts/ir";
import { standaloneSchemas } from "@/lib/contracts/json-schema";
import { toTypeName } from "@/lib/contracts/names";
import { buildNorthboundOpenApi, documentJson, type NorthboundDocInput, type OpenApiVersion } from "@/lib/contracts/openapi";
import { renderedRequestSchema } from "@/lib/contracts/request-schema";
import { hydrateJsonTexts } from "@/lib/contracts/render-input";
import { sliceForEntitySet } from "@/lib/contracts/slice";
import { buildScaffold, safeName, type ScaffoldFixture, type ScaffoldInterface, type WithheldFixture } from "@/lib/studio/scaffold";

/** Why the envelope refused a job it could not finish (envelope.ts). */
export type EnvelopeRefusal =
  /** The job ran out of heap, stack or time: the description is built to be expensive, or is simply too much. */
  | "RESOURCE_LIMIT"
  /** Too many compiles at once; the next verify will compile. */
  | "BUSY"
  /** The envelope could not be started; nothing ran. */
  | "UNAVAILABLE"
  /** The job threw: a defect, refused rather than surfaced. */
  | "INTERNAL";

/** The interface a contract is rendered for, as the read paths will render it (scaffold.ts). */
export interface RenderSubject {
  id: string;
  name: string;
  externalId: string;
  sapProduct: string;
  operation: string;
  mode: string;
  entitySet: string;
  version: number;
  solutionName: string;
  status?: string;
}

/** The bytes each read path renders from this contract, measured inside the envelope. */
export interface RenderedSizes {
  schema: number;
  kit: number;
  document: number;
  /** Wall-clock time all of it took, in the envelope. */
  ms: number;
}

export type PreparedContract =
  | { ok: true; contract: InterfaceContract; hash: string; bytes: number; rendered: RenderedSizes }
  | {
      ok: false;
      reason: "NO_SUCH_ENTITY_SET" | "NO_SUCH_ENTITY_TYPE" | "TOO_LARGE" | "OUTPUT_TOO_LARGE";
      detail: string;
      /** Canonical bytes, when the refusal is the contract's own size. */
      bytes?: number;
    };

/** What a verify learns from compiling a description: never the IR itself. */
export type CompiledService =
  | {
      ok: true;
      format: "xml" | "json";
      odataVersion: ODataVersion;
      /** The entity sets it declares (not its singletons: one record is not a dataset), summarised. */
      datasets: DatasetSummary;
      /** The description's length in UTF-16 units. */
      sourceLength: number;
      /** The interface's dataset, sliced, digested and measured; null when none was asked for. */
      dataset: PreparedContract | null;
    }
  | {
      ok: false;
      reason: CompileRefusal | EnvelopeRefusal;
      detail: string;
      /**
       * A description the compiler refused is still read by the older reader,
       * in the same job (compileJob), so the verify answers as it did before
       * the compiler existed; absent when the envelope never ran the job.
       */
      datasets?: DatasetSummary;
    };

export interface CompileJobInput {
  body: string;
  /** The interface's dataset, to slice and prepare; null or "" for none. */
  entitySet: string | null;
  subject: RenderSubject | null;
}

export interface PrepareJobInput {
  contract: InterfaceContract;
  /** The description's length, when the contract was cut from one (the contract budget is in proportion to it). */
  sourceLength?: number;
  subject: RenderSubject | null;
  /** The read paths' budgets; LIMITS (budget.ts) unless a test tightens them. */
  limits?: RenderLimits;
}

export interface DiffJobInput {
  previous: InterfaceContract[];
  next: InterfaceContract;
}

/** One entry per `previous`: the bump, and the diff as a snapshot stores it (bounded, diff.ts). */
export type DiffJobOutput = { bump: Bump | null; stored: StoredContractDiff }[];

/**
 * A read path's render, from what was stored: everything it needs as plain
 * data, so it renders the same on the request thread and in a worker
 * (read-render.ts), under `limit` bytes — the read path's budget, computed
 * by the route from the sizes it stored, exactly as before.
 */
export type RenderJobInput =
  | {
      /** GET /schema: the four schemas, and the write body while its stamp is current (record.ts). */
      path: "schema";
      contract: InterfaceContract;
      entitySet: string;
      snapshotId: string;
      /** The interface's stored requestSchema (its stamp) and contract identity. */
      requestSchema: unknown;
      iface: { version: number; entitySet: string | null };
      limit: number;
    }
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

/**
 * What a read path's render produced: compact JSON texts (schema: the
 * schemas, then the request schema; kit: the files; document: the document
 * as it is downloaded), or the budget that stopped it — its bytes
 * (TOO_LARGE) or its clock (TIME, which the request thread answers by
 * handing the render to the envelope).
 */
export type RenderedForRead = { ok: true; texts: RenderedText[] } | { ok: false; reason: "TOO_LARGE" | "TIME"; limit: number };

/**
 * A rendered text: a string on the request thread; from the envelope, its
 * UTF-8 bytes, encoded in the worker and transferred, not copied
 * (compile.worker.ts), so the request thread never re-reads them.
 */
export type RenderedText = string | Uint8Array<ArrayBuffer>;

export type Job =
  | { kind: "compile"; input: CompileJobInput }
  | { kind: "prepare"; input: PrepareJobInput }
  | { kind: "diff"; input: DiffJobInput }
  | { kind: "render"; input: RenderJobInput };

export type JobOutput<K extends Job["kind"]> = K extends "compile"
  ? CompiledService
  : K extends "prepare"
    ? PreparedContract
    : K extends "diff"
      ? DiffJobOutput
      : RenderedForRead;

/** The kit's base URL while measuring: the length of a real origin's, give or take (the floors cover the rest). */
const MEASURE_BASE_URL = "https://coreedge.example.invalid/api/northbound";

/** A requestSchema stamp's shape (record.ts), at its largest: what /schema adds to a write body. */
const STAMP = {
  snapshotId: "c".repeat(25),
  semver: "999.999.999",
  contentHash: "0".repeat(64),
  interfaceVersion: 999_999,
  entitySet: "e".repeat(200),
  operation: "UPDATE",
};

/** The longest the renders of one contract may take in the envelope, all of them together. */
export const RENDER_TIME_BUDGET_MS = 8000;

/** The longest name an interface (and a solution) may be given (the Studio routes' validation). */
const MAX_INTERFACE_NAME = 200;
const MAX_SOLUTION_NAME = 120;

/**
 * An interface as the record measures it: its own identity, operation and
 * dataset, under the longest names it and its solution may be given — so a
 * rename never takes a read past the budget it was measured against.
 */
export function measuredSubject(iface: {
  id: string;
  externalId: string;
  sapProduct: string;
  operation: string;
  mode: string;
  entitySet: string;
  version: number;
}): RenderSubject {
  return {
    id: iface.id,
    name: "N".repeat(MAX_INTERFACE_NAME),
    externalId: iface.externalId,
    sapProduct: iface.sapProduct,
    operation: iface.operation,
    mode: iface.mode,
    entitySet: iface.entitySet,
    version: iface.version,
    solutionName: "S".repeat(MAX_SOLUTION_NAME),
    status: "DEPRECATED",
  };
}

/** A stand-in interface for a contract recorded without one (a sampled capture, a test). */
const placeholderSubject = (entitySet: string): RenderSubject =>
  measuredSubject({
    id: "c".repeat(25),
    externalId: `custom:/${"x".repeat(200)}`,
    sapProduct: "s4hana",
    operation: "READ",
    mode: "READ",
    entitySet,
    version: 1,
  });

/**
 * Render every read path's output from `contract` under the budget that read
 * path applies, as both a read and a create interface (the operation decides
 * which bodies are drawn); BudgetExceeded when any of them does not fit.
 */
export function renderAndMeasure(
  contract: InterfaceContract,
  bytes: number,
  subject: RenderSubject | null,
  limits: RenderLimits = LIMITS,
): RenderedSizes {
  const started = Date.now();
  const deadline = started + RENDER_TIME_BUDGET_MS;
  const base = subject ?? placeholderSubject(contract.entitySet.name);
  const compiled = { semver: "1.0.0", snapshotId: "c".repeat(25), contentHash: "0".repeat(64), compiledAt: new Date(0).toISOString(), contract };

  // GET /schema: the four schemas and either write body beside them, as the route serializes them.
  const schemas = standaloneSchemas(contract, toTypeName(base.entitySet));
  let schema = 0;
  for (const body of [schemas.create, schemas.update]) {
    const schemaBudget = new OutputBudget("schema", schemaLimit(bytes, limits.schema), deadline);
    writeJson({ schemas, requestSchema: body ? { ...body, "x-contract": STAMP } : null }, schemaBudget, null);
    schema = Math.max(schema, schemaBudget.spent);
  }

  let kit = 0;
  let document = 0;
  for (const [operation, mode] of [
    ["READ", "READ"],
    ["CREATE", "WRITE"],
  ] as const) {
    const iface: ScaffoldInterface = { ...base, operation, mode, compiled };
    // The kit's files, as the route builds them.
    const kitBudget = new OutputBudget("kit", kitLimit(bytes, 0, limits.kit), deadline);
    buildScaffold(iface, MEASURE_BASE_URL, [], [], kitBudget);
    kit = Math.max(kit, kitBudget.spent);
    for (const version of ["3.1.0", "3.0.3"] as OpenApiVersion[]) {
      const docBudget = new OutputBudget("document", documentLimit([bytes], limits.document), deadline);
      documentJson(
        buildNorthboundOpenApi({
          version,
          baseUrl: MEASURE_BASE_URL,
          title: `${safeName(base.solutionName)} — CoreEdge northbound`,
          infoVersion: "1.0.0+000000000000",
          description: "Measured at record time.",
          interfaces: [{ ...base, operation, mode, contract: { source: "metadata" as const, contract, semver: "1.0.0" } }],
          discovery: true,
          safe: safeName,
        }),
        docBudget,
      );
      document = Math.max(document, docBudget.spent);
    }
  }
  return { schema, kit, document, ms: Date.now() - started };
}

/** Digest, then render and measure; the refusals are the budgets that were spent. */
export function prepareContract(input: PrepareJobInput): PreparedContract {
  const { contract } = input;
  const limit = contractLimit(input.sourceLength);
  let digest: { hash: string; bytes: number };
  try {
    digest = contractDigest(contract, new OutputBudget("contract", limit));
  } catch (err) {
    if (err instanceof BudgetExceeded) {
      return {
        ok: false,
        reason: "TOO_LARGE",
        bytes: err.spent,
        detail: `The compiled contract is larger than ${Math.floor(limit / 1024)} KB, so it was not recorded.`,
      };
    }
    throw err;
  }
  try {
    const rendered = renderAndMeasure(contract, digest.bytes, input.subject, input.limits);
    return { ok: true, contract, hash: digest.hash, bytes: digest.bytes, rendered };
  } catch (err) {
    if (err instanceof BudgetExceeded) {
      return {
        ok: false,
        reason: "OUTPUT_TOO_LARGE",
        detail:
          err.budget === "time"
            ? "The documents generated from this contract would take too long to render, so it was not recorded."
            : `The ${err.budget === "kit" ? "starter kit" : err.budget === "document" ? "OpenAPI document" : "schemas"} generated from this contract would be larger than ${Math.floor(err.limit / (1024 * 1024))} MB, so it was not recorded.`,
      };
    }
    throw err;
  }
}

export function compileJob(input: CompileJobInput): CompiledService {
  const r = compileContract(input.body);
  // Refused by the compiler: the older reader lists the datasets, here in the envelope, never on the request thread.
  if (!r.ok) return { ...r, datasets: readDatasets(input.body, input.entitySet || null) };
  return compiledServiceOf(r, input.entitySet, input.subject);
}

/** What a compile result becomes for the verify: the summary, and the dataset sliced, digested and measured. */
export function compiledServiceOf(r: CompileResult, entitySet: string | null, subject: RenderSubject | null): CompiledService {
  if (!r.ok) return r;
  const datasets = summarizeDatasets(
    r.ir.entitySets.filter((e) => e.singleton !== true).map((e) => e.name),
    entitySet || null,
  );
  let dataset: PreparedContract | null = null;
  if (entitySet) {
    const slice = sliceForEntitySet(r.ir, entitySet, r.sourceLength);
    dataset = slice.ok
      ? prepareContract({ contract: slice.contract, sourceLength: r.sourceLength, subject })
      : { ok: false, reason: slice.reason, detail: slice.detail };
  }
  return { ok: true, format: r.format, odataVersion: r.ir.odataVersion, datasets, sourceLength: r.sourceLength, dataset };
}

export function diffJob(stored: DiffJobInput): DiffJobOutput {
  // The IRs cross as their stored text (render-input.ts): parsed here, in the worker.
  const input = hydrateJsonTexts(stored);
  return input.previous.map((prev) => {
    const d = diffContracts(prev, input.next);
    return { bump: d.bump, stored: storedDiff(d) };
  });
}

/**
 * Render one read path's output under its budget, and a deadline when one is
 * given (ms since the epoch): pure, so the request thread and the envelope's
 * worker render the same bytes (read-render.ts). Each text is written by the
 * one budgeted writer, so a render past its budget stops there.
 */
export function renderForRead(stored: RenderJobInput, deadline: number | null = null): RenderedForRead {
  /*
   * On the request thread (a deadline), the whole render runs under it — the
   * stored texts' parse, every build stage and every write (budget.ts, the
   * render clock) — and writes at most LIMITS.inlineRender.outputBytes before
   * it is handed to the envelope (TIME), so no single native write is larger
   * than that (structural hardening round 4).
   */
  const soft = deadline === null ? Number.POSITIVE_INFINITY : LIMITS.inlineRender.outputBytes;
  const budgetFor = (name: "schema" | "kit" | "document") => new OutputBudget(name, stored.limit, deadline, soft);
  try {
    return withRenderDeadline(deadline, () => {
      // Stored JSON carried as its text (render-input.ts) is parsed here, under the clock.
      const input = hydrateJsonTexts(stored);
      renderCheckpoint();
      switch (input.path) {
        case "schema": {
          const budget = budgetFor("schema");
          const schemas = standaloneSchemas(input.contract, toTypeName(input.entitySet));
          renderCheckpoint();
          const requestSchema = renderedRequestSchema(input.requestSchema, input.iface, { id: input.snapshotId, schemas });
          return { ok: true, texts: [jsonText(schemas, budget), jsonText(requestSchema, budget)] };
        }
        case "kit": {
          const budget = budgetFor("kit");
          const files = buildScaffold(input.iface, input.baseUrl, input.fixtures, input.withheld, budget);
          renderCheckpoint();
          // The files' contents were charged as they were written; their JSON escapes are a bounded multiple of them.
          return { ok: true, texts: [JSON.stringify(files)] };
        }
        case "document": {
          const doc = buildNorthboundOpenApi({ ...input.doc, safe: safeName, budget: budgetFor("document") });
          renderCheckpoint();
          return { ok: true, texts: [documentJson(doc, budgetFor("document"))] };
        }
      }
    });
  } catch (err) {
    if (err instanceof BudgetExceeded) return { ok: false, reason: err.budget === "time" ? "TIME" : "TOO_LARGE", limit: stored.limit };
    throw err;
  }
}

export function runJob(job: Job): unknown {
  switch (job.kind) {
    case "compile":
      return compileJob(job.input);
    case "prepare":
      return prepareContract(job.input);
    case "diff":
      return diffJob(job.input);
    case "render":
      return renderForRead(job.input);
  }
}
