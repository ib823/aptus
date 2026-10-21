/**
 * THE HARD RESOURCE ENVELOPE around the Contract Compiler (P1.3, structural
 * containment).
 *
 * The description the compiler reads comes from a customer's SAP system,
 * which an attacker may control, and three reviews in a row found a new way
 * for one to make the compile superlinear in time or memory. Each was fixed;
 * the next one nobody has found yet would still have run on the server's own
 * thread, where it blocks every other request, or exhausted the process's
 * heap and taken every request with it. So the whole compile — parse, IR,
 * annotate, slice, canonical digest, the diff against earlier snapshots,
 * and every render and measurement taken at record time (pipeline.ts) — runs
 * HERE, in a worker thread with:
 *
 *   - a heap of its own, capped (resourceLimits: old and young generation),
 *     so the worst a description can do to memory is end its own worker;
 *   - a stack of its own, capped, so recursion ends in a RangeError there;
 *   - a wall-clock deadline, after which the worker is terminated — V8
 *     stops it wherever it is, in a loop with no await or not;
 *   - a concurrency cap, so a burst of verifies queues instead of
 *     multiplying the heaps — shared fairly between organisations, so one
 *     builder's hostile SAP cannot hold every slot and queue place and have
 *     every other tenant's compile refused (structural hardening round 1);
 *   - an input bound: a contract handed in (prepare, diff) is measured, up to
 *     its cap and no further, before it is copied into the worker, so the
 *     request thread's copy is bounded by the cap and not by the input.
 *
 * Whatever runs past any of them ends as a typed refusal (RESOURCE_LIMIT,
 * BUSY, UNAVAILABLE), which the verify reports as a contract that was not
 * compiled (NOT_COMPILED) while the verify itself answers exactly as it did
 * before the compiler existed. Never an out-of-memory, a crash or a blocked
 * event loop: the request thread only copies the description in and a
 * bounded result out (pipeline.ts says what crosses).
 *
 * The worker is spawned per job and terminated after it, so its memory goes
 * back when the job ends however the job ended.
 *
 * WHY A WORKER, NOT A COOPERATIVE BUDGET. A budget threaded through every
 * loop bounds only the loops someone remembered to thread it through, which
 * is the property the reviews kept finding missing. A worker's limits are
 * enforced by V8 whatever the code does.
 *
 * LOADING. `new Worker(new URL("./compile.worker.ts", import.meta.url))` is
 * the form webpack (Next's server build) recognises: it bundles the worker as
 * its own chunk (chunks/contract-compiler-worker.js, traced into the routes
 * that spawn it by next.config.ts and checked after every build by
 * scripts/check-runtime-assets.mjs), and the routes that spawn it run on the
 * Node.js runtime. Run from source (vitest, tsx scripts) there is no bundle,
 * and the worker loads the TypeScript file through tsx's require hook.
 *
 * PROVED IN A PRODUCTION BUILD (`pnpm build`, `pnpm start`, a real POST
 * verify-service against a local SAP stub): see the runbook,
 * docs/runbooks/coreedge-contract-compiler.md, "Structural containment".
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import v8 from "node:v8";
import { Worker } from "node:worker_threads";

import { jsonBytesUpTo, LIMITS } from "@/lib/contracts/budget";
import { HEAP_NOT_CAPPED, type WorkerInput, type WorkerReply } from "@/lib/contracts/worker-protocol";
import type { CompiledService, EnvelopeRefusal, Job, JobOutput, RenderSubject } from "@/lib/contracts/pipeline";

declare const __webpack_require__: unknown;
// webpack's publicPath, as a bundled module reads and writes it (see construct).
// eslint-disable-next-line no-var
declare var __webpack_public_path__: string;

/** True inside a webpack bundle (the Next build), where the worker is a bundled chunk. */
const BUNDLED = typeof __webpack_require__ !== "undefined";

export interface EnvelopeLimits {
  /** V8 old generation (MB): the heap a compile may hold. */
  maxOldGenerationSizeMb: number;
  /** V8 young generation (MB). */
  maxYoungGenerationSizeMb: number;
  /** Stack (MB). */
  stackSizeMb: number;
  /** Wall-clock deadline (ms), from the moment the job starts running. */
  deadlineMs: number;
}

/**
 * THE ENVELOPE'S SIZE. Measured on a loaded 4-CPU runner: an 8 MB V2
 * description of 400 entity types compiles in 1-2 s holding about 70 MB of
 * heap, and every render of one of its slices takes tens of milliseconds; a
 * real service's description is a fraction of that. The most expensive
 * description found — 8 MB of CSDL JSON members, refused by the member cap
 * once read — takes 8-15 s and about 360 MB: the limits are what such a
 * description meets, not what a real one does.
 */
export const ENVELOPE_LIMITS: Readonly<Record<Job["kind"], EnvelopeLimits>> = {
  compile: { maxOldGenerationSizeMb: 384, maxYoungGenerationSizeMb: 32, stackSizeMb: 4, deadlineMs: 15_000 },
  prepare: { maxOldGenerationSizeMb: 256, maxYoungGenerationSizeMb: 32, stackSizeMb: 4, deadlineMs: 10_000 },
  diff: { maxOldGenerationSizeMb: 256, maxYoungGenerationSizeMb: 32, stackSizeMb: 4, deadlineMs: 10_000 },
};

/**
 * A deployment may set its own heap cap and deadline
 * (COREEDGE_CONTRACT_HEAP_MB, COREEDGE_CONTRACT_DEADLINE_MS), within these
 * bounds; anything else unset or unreadable is the default above.
 */
const HEAP_MB_RANGE = [16, 1024] as const;
const DEADLINE_MS_RANGE = [100, 60_000] as const;

function envInt(name: string, [min, max]: readonly [number, number]): number | null {
  const raw = process.env[name];
  if (raw === undefined || !/^\d+$/.test(raw.trim())) return null;
  const n = Number(raw.trim());
  return n >= min && n <= max ? n : null;
}

/** The limits a job of this kind runs under here: the defaults, as the deployment configures them. */
export function envelopeLimitsFor(kind: Job["kind"]): EnvelopeLimits {
  const base = ENVELOPE_LIMITS[kind];
  const heap = envInt("COREEDGE_CONTRACT_HEAP_MB", HEAP_MB_RANGE);
  const deadline = envInt("COREEDGE_CONTRACT_DEADLINE_MS", DEADLINE_MS_RANGE);
  return {
    ...base,
    ...(heap !== null ? { maxOldGenerationSizeMb: heap } : {}),
    ...(deadline !== null ? { deadlineMs: deadline } : {}),
  };
}

/** Jobs running at once in this process, and how many more may wait for a turn. */
export const ENVELOPE_CONCURRENCY = 2;
export const ENVELOPE_QUEUE = 16;

/**
 * ONE ORGANISATION'S SHARE. The slots and the queue are the process's, and
 * verify-service is a builder's to call: with no share, one builder whose
 * SAP serves a description that takes seconds to compile kept eighteen
 * verifies in flight, and every other organisation's compile on the
 * instance was refused BUSY (NOT_COMPILED). So an organisation runs at most
 * ENVELOPE_TENANT_RUNNING job at a time and keeps at most
 * ENVELOPE_TENANT_WAITING waiting; past that its next job is refused BUSY at
 * once, before it can take a shared place, and a free slot goes to the
 * first waiting job whose organisation has none running. With fewer running
 * per organisation than there are slots, a slot is always left for another.
 * A job with no tenant (a test, a script) is outside the shares.
 */
export const ENVELOPE_TENANT_RUNNING = 1;
export const ENVELOPE_TENANT_WAITING = 2;

export type EnvelopeResult<T> = { ok: true; value: T; ms: number } | { ok: false; reason: EnvelopeRefusal; detail: string; ms: number };

const DETAIL: Record<EnvelopeRefusal, string> = {
  RESOURCE_LIMIT:
    "The service description needs more memory or time to compile than a description may use, so it was not compiled.",
  BUSY: "Too many service descriptions are being compiled at once. Verify again in a moment.",
  UNAVAILABLE: "The contract compiler could not be started, so the description was not compiled.",
  INTERNAL: "The service description could not be read as a service description.",
};

interface Waiter {
  tenant: string | null;
  turn: Promise<void>;
  start: () => void;
}

let running = 0;
const runningByTenant = new Map<string, number>();
const waiting: Waiter[] = [];

/** May a job of this tenant take a slot now (its organisation's share allowing)? */
function withinShare(tenant: string | null): boolean {
  return tenant === null || (runningByTenant.get(tenant) ?? 0) < ENVELOPE_TENANT_RUNNING;
}

function occupy(tenant: string | null): void {
  running += 1;
  if (tenant !== null) runningByTenant.set(tenant, (runningByTenant.get(tenant) ?? 0) + 1);
}

/** A slot now (true), a place in the queue (the waiter), or neither (false: BUSY). */
function acquire(tenant: string | null): true | false | Waiter {
  if (running < ENVELOPE_CONCURRENCY && withinShare(tenant)) {
    occupy(tenant);
    return true;
  }
  if (waiting.length >= ENVELOPE_QUEUE) return false;
  if (tenant !== null) {
    let mine = 0;
    for (const w of waiting) if (w.tenant === tenant) mine += 1;
    if (mine >= ENVELOPE_TENANT_WAITING) return false;
  }
  let start!: () => void;
  const turn = new Promise<void>((resolve) => (start = resolve));
  const waiter: Waiter = { tenant, turn, start };
  waiting.push(waiter);
  return waiter;
}

/** Hand free slots to the first waiting jobs whose organisations' shares allow them. */
function dispatch(): void {
  while (running < ENVELOPE_CONCURRENCY) {
    const i = waiting.findIndex((w) => withinShare(w.tenant));
    if (i < 0) return;
    const [next] = waiting.splice(i, 1);
    occupy(next!.tenant);
    next!.start();
  }
}

function release(tenant: string | null): void {
  running -= 1;
  if (tenant !== null) {
    const n = (runningByTenant.get(tenant) ?? 1) - 1;
    if (n > 0) runningByTenant.set(tenant, n);
    else runningByTenant.delete(tenant);
  }
  dispatch();
}

/** Leave the queue (a wait that timed out): false when the turn was already given. */
function abandon(waiter: Waiter): boolean {
  const i = waiting.indexOf(waiter);
  if (i < 0) return false;
  waiting.splice(i, 1);
  return true;
}

/** The queue as it stands, for a test: running, by tenant, and waiting. */
export function envelopeQueueState(): { running: number; waiting: number; runningByTenant: Record<string, number> } {
  return { running, waiting: waiting.length, runningByTenant: Object.fromEntries(runningByTenant) };
}

/** Errors that mean the job hit a limit rather than a defect. */
function isResourceError(name: string | undefined, code: string | undefined): boolean {
  return code === "ERR_WORKER_OUT_OF_MEMORY" || name === "RangeError";
}

/** Errors that mean the worker never loaded. */
function isLoadError(code: string | undefined): boolean {
  return code === "ERR_MODULE_NOT_FOUND" || code === "MODULE_NOT_FOUND" || code === "ERR_WORKER_PATH" || code === "ERR_WORKER_INIT_FAILED";
}

/**
 * THE HEAP CAP MUST HOLD WHATEVER THE PROCESS WAS STARTED WITH. A process
 * started with --max-old-space-size (NODE_OPTIONS commonly sets it, and this
 * one's build does) has that V8 flag, and V8 lets the flag override every
 * isolate's own resource limits: a worker asked for 384 MB got the whole
 * process's 8 GB, and a hostile description could use all of it. So the flag
 * is set to the worker's cap while its isolate is created — each spawn waits
 * for the previous one to come online, so no two ask at once — and put back
 * the moment it is online: the request thread's own heap was sized at start
 * and is not touched. And the worker checks the heap it was given before it
 * runs anything (compile.worker.ts): one past its cap refuses the job
 * (UNAVAILABLE), so a compile never runs uncapped.
 */
const OLD_SPACE_FLAG = /^--max[-_]old[-_]space[-_]size=(\d+)$/;
/**
 * THE YOUNG GENERATION TOO. --max-semi-space-size (a common GC tuning,
 * NODE_OPTIONS="--max-semi-space-size=64") overrides a worker's
 * maxYoungGenerationSizeMb the same way: the worker got 3 × 64 MB of young
 * generation, passed its cap check, and every compile was refused
 * UNAVAILABLE (structural hardening round 1). So it is set to 0 — "not set",
 * deferring to the worker's resourceLimits — for the same moment, and put
 * back to what the process started with.
 */
const SEMI_SPACE_FLAG = /^--max[-_]semi[-_]space[-_]size=(\d+)$/;

/** A size flag the process was started with, in MB; 0 when none (V8's "not set"). */
function startupFlagMb(flag: RegExp): number {
  const flags = [...(process.env.NODE_OPTIONS ?? "").split(/\s+/), ...process.execArgv];
  let mb = 0;
  for (const f of flags) {
    const m = flag.exec(f);
    if (m) mb = Number(m[1]);
  }
  return mb;
}

const STARTUP_OLD_SPACE_MB = startupFlagMb(OLD_SPACE_FLAG);
const STARTUP_SEMI_SPACE_MB = startupFlagMb(SEMI_SPACE_FLAG);

/** The process-wide heap flags while a worker's isolate is created, and back. */
function capHeapFlags(limits: EnvelopeLimits): void {
  v8.setFlagsFromString(`--max-old-space-size=${limits.maxOldGenerationSizeMb}`);
  v8.setFlagsFromString("--max-semi-space-size=0");
}

function restoreHeapFlags(): void {
  v8.setFlagsFromString(`--max-old-space-size=${STARTUP_OLD_SPACE_MB}`);
  v8.setFlagsFromString(`--max-semi-space-size=${STARTUP_SEMI_SPACE_MB}`);
}

/** The heap a worker with these limits can at most be given: V8's limit is old generation plus young generation space. */
export function heapLimitBytes(limits: EnvelopeLimits): number {
  return (limits.maxOldGenerationSizeMb + 3 * limits.maxYoungGenerationSizeMb + 16) * 1024 * 1024;
}

let spawning: Promise<void> = Promise.resolve();

/** Spawn with the V8 flag set to the worker's cap until its isolate exists (see above). */
async function spawn(job: Job, limits: EnvelopeLimits): Promise<Worker> {
  const previous = spawning;
  let done!: () => void;
  spawning = new Promise((resolve) => (done = resolve));
  await previous;
  capHeapFlags(limits);
  let worker: Worker;
  try {
    worker = construct({ job, heapLimitBytes: heapLimitBytes(limits) }, limits);
  } catch (err) {
    restoreHeapFlags();
    done();
    throw err;
  }
  let restored = false;
  const restore = () => {
    // Once: a later exit must not reset the flag while the next spawn has it set.
    if (restored) return;
    restored = true;
    restoreHeapFlags();
    done();
  };
  worker.once("online", restore);
  worker.once("exit", restore); // never came online: restore all the same
  return worker;
}

function construct(input: WorkerInput, limits: EnvelopeLimits): Worker {
  const options = {
    workerData: input,
    resourceLimits: {
      maxOldGenerationSizeMb: limits.maxOldGenerationSizeMb,
      maxYoungGenerationSizeMb: limits.maxYoungGenerationSizeMb,
      stackSizeMb: limits.stackSizeMb,
    },
    // Never the parent's own flags: a worker refuses process-wide ones.
    execArgv: [],
    stdout: false,
    stderr: false,
  };
  if (BUNDLED) {
    /*
     * webpack bundles the worker as its own chunk and resolves this URL as
     * publicPath + chunk file against the server's chunks directory. Next's
     * server bundle carries the CLIENT's publicPath ("/_next/"), which made
     * it file:///_next/<chunk>.js — a file that does not exist, so every
     * compile in a production build was UNAVAILABLE. Empty for exactly this
     * expression, and put back before anything else can run, it resolves to
     * the chunk beside the server's own.
     */
    const publicPath = __webpack_public_path__;
    __webpack_public_path__ = "";
    try {
      return new Worker(/* webpackChunkName: "contract-compiler-worker" */ new URL("./compile.worker.ts", import.meta.url), /* @vite-ignore */ options);
    } finally {
      __webpack_public_path__ = publicPath;
    }
  }
  // From source: the TypeScript worker, through tsx's loader (which reads the tsconfig's paths).
  const file = path.join(path.dirname(fileURLToPath(import.meta.url)), "compile.worker.ts");
  return new Worker(`require("tsx/cjs"); require(${JSON.stringify(file)});`, { ...options, eval: true });
}

/**
 * WHAT CROSSES INTO THE WORKER IS BOUNDED. A contract handed to a job is
 * copied into workerData on this thread, in proportion to its size; a
 * sampled capture of 358,000 fields blocked the event loop for 287 ms doing
 * it, only for the worker to refuse the contract at once. So a contract is
 * measured first, by the budgeted size walk, which stops at the cap — at
 * most the cap's worth of work, whatever the input — and one past the cap
 * never reaches the worker. A description (compile) is a string, copied
 * whole in one step, and the reader already capped it (LIMITS.sourceBytes).
 */
function overInputBound(job: Job): boolean {
  const cap = LIMITS.contract.cap;
  if (job.kind === "prepare") return jsonBytesUpTo(job.input.contract, cap) > cap;
  if (job.kind === "diff") {
    const n = (Array.isArray(job.input.previous) ? job.input.previous.length : 0) + 1;
    return jsonBytesUpTo(job.input, n * cap) > n * cap;
  }
  return false;
}

/** How a job past the input bound is answered: a prepared contract that is too large, or a refusal. */
function inputRefusal<J extends Job>(job: J, since: number): EnvelopeResult<JobOutput<J["kind"]>> {
  if (job.kind === "prepare") {
    const value: JobOutput<"prepare"> = {
      ok: false,
      reason: "TOO_LARGE",
      bytes: LIMITS.contract.cap + 1,
      detail: `The compiled contract is larger than ${Math.floor(LIMITS.contract.cap / 1024)} KB, so it was not recorded.`,
    };
    return { ok: true, value: value as JobOutput<J["kind"]>, ms: Date.now() - since };
  }
  return refuse("RESOURCE_LIMIT", job, since, "input");
}

export interface EnvelopeOptions {
  /** The organisation the job is for: its share of the slots and the queue (ENVELOPE_TENANT_*). */
  tenant?: string | null;
}

/**
 * Run one job in a fresh worker under its limits. Resolves, never rejects:
 * the value, or the refusal that ended it.
 */
export async function runInEnvelope<J extends Job>(
  job: J,
  limits: EnvelopeLimits = envelopeLimitsFor(job.kind),
  opts: EnvelopeOptions = {},
): Promise<EnvelopeResult<JobOutput<J["kind"]>>> {
  const queuedAt = Date.now();
  if (overInputBound(job)) return inputRefusal(job, queuedAt);
  const tenant = opts.tenant ?? null;
  const turn = acquire(tenant);
  if (turn === false) return refuse("BUSY", job, queuedAt);
  if (turn !== true) {
    // Waiting counts against the deadline too: a verify never waits longer than a compile may run.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timedOut = await Promise.race([
      turn.turn.then(() => false),
      new Promise<boolean>((resolve) => (timer = setTimeout(() => resolve(true), limits.deadlineMs))),
    ]);
    clearTimeout(timer);
    // Out of the queue the moment the wait ends, so a stale waiter never holds a place;
    // a turn given just as the wait ended is handed straight on.
    if (timedOut) {
      if (!abandon(turn)) release(tenant);
      return refuse("BUSY", job, queuedAt);
    }
  }
  try {
    return await runWorker(job, limits, queuedAt);
  } finally {
    release(tenant);
  }
}

/**
 * Compile a description in the envelope, as the verify does: what comes
 * back is the bounded summary (pipeline.ts) with the dataset, when one is
 * named, already sliced, digested and measured for every read path — or a
 * refusal. A job that threw (a defect) is refused as a description that
 * could not be read, logged by name only (P1 wave A review); one that ran out
 * of memory, stack or time is RESOURCE_LIMIT.
 */
export async function compileInEnvelope(
  body: string,
  entitySet: string | null,
  subject: RenderSubject | null,
  tenant: string | null = null,
): Promise<CompiledService> {
  const r = await runInEnvelope({ kind: "compile", input: { body, entitySet, subject } }, undefined, { tenant });
  if (r.ok) return r.value;
  if (r.reason === "INTERNAL") {
    console.error("[contracts] compile failed", { error: "INTERNAL" });
    return { ok: false, reason: "INVALID_CSDL", detail: r.detail };
  }
  return { ok: false, reason: r.reason, detail: r.detail };
}

/** `cause`: what ended the job, as a code or an error's name — never a message, which can quote the description. */
function refuse<T>(reason: EnvelopeRefusal, job: Job, since: number, cause?: string): EnvelopeResult<T> {
  const ms = Date.now() - since;
  console.error("[contracts] envelope refused", { job: job.kind, reason, ms, ...(cause ? { cause } : {}) });
  return { ok: false, reason, detail: DETAIL[reason], ms };
}

function runWorker<T>(job: Job, limits: EnvelopeLimits, since: number): Promise<EnvelopeResult<T>> {
  return new Promise((resolve) => {
    let settled = false;
    let worker: Worker | undefined;
    const settle = (r: EnvelopeResult<T>) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      // Its memory goes back now, however the job ended.
      void worker?.terminate().catch(() => {});
      resolve(r);
    };
    const timer = setTimeout(() => settle(refuse("RESOURCE_LIMIT", job, since, "deadline")), limits.deadlineMs);
    spawn(job, limits).then(
      (w) => {
        worker = w;
        // The deadline passed while it was being spawned: it never runs.
        if (settled) {
          void w.terminate().catch(() => {});
          return;
        }
        w.once("message", (m: WorkerReply) => {
          if (m.ok) settle({ ok: true, value: m.value as T, ms: Date.now() - since });
          else if (m.error === HEAP_NOT_CAPPED) settle(refuse("UNAVAILABLE", job, since, HEAP_NOT_CAPPED));
          else settle(refuse(isResourceError(m.error, undefined) ? "RESOURCE_LIMIT" : "INTERNAL", job, since, m.error));
        });
        w.once("error", (err: Error & { code?: string }) => {
          settle(
            refuse(
              isResourceError(err.name, err.code) ? "RESOURCE_LIMIT" : isLoadError(err.code) ? "UNAVAILABLE" : "INTERNAL",
              job,
              since,
              err.code ?? err.name,
            ),
          );
        });
        w.once("exit", (code) => {
          // An exit before any message: killed by a limit V8 enforces without an error event, or a crash.
          if (!settled) settle(refuse(code === 0 ? "INTERNAL" : "RESOURCE_LIMIT", job, since, `exit ${code}`));
        });
      },
      (err: unknown) => {
        const code = (err as { code?: string } | null)?.code;
        settle(
          refuse(
            code === "ERR_WORKER_INVALID_EXEC_ARGV" || isLoadError(code) ? "UNAVAILABLE" : "INTERNAL",
            job,
            since,
            code ?? (err instanceof Error ? err.name : "unknown"),
          ),
        );
      },
    );
  });
}
