/**
 * THE CONTRACT COMPILER'S ENVELOPE: every job that parses tenant-supplied
 * bytes or renders a Studio download runs here, in a worker thread, through
 * ONE fair gate (P1.3).
 *
 * The description, the sampled rows and the fixture body a job reads come
 * from a customer's SAP system, which a builder with a free BTP trial
 * controls. So a job (jobs.ts) never runs on a request's own thread; it runs
 * in a worker spawned for it, with
 *
 *   - its own capped heap and stack (CONTRACT_JOB_LIMITS), so the worst an
 *     input can do to memory is end its own worker;
 *   - a wall-clock deadline (10 s from spawn, or less when the caller's own
 *     deadline is nearer), after which V8 stops it wherever it is;
 *   - ONE GATE for the process: COREEDGE_CONTRACT_ISOLATES workers at once
 *     (default 1; 0 turns the compiler off); per organisation at most one
 *     running and three waiting, at most 32 waiting in all, and past either
 *     a job is BUSY at once, before anything is loaded for it; a freed slot
 *     goes to the waiting job whose organisation was served least recently,
 *     so a job waits behind at most one job per other organisation; a waiter
 *     leaves the queue when its wait (at most 10 s) ends;
 *   - SLOT FIRST: a job's inputs are loaded only once it holds its slot
 *     (runContractJob's loader), so a job refused or still waiting has cost
 *     the request thread nothing;
 *   - its organisation's daily allowance (contract-time.ts): checked and
 *     the job's deadline reserved in one statement before the job is queued
 *     (the gate is per process; the reservation holds across instances), and
 *     settled to the job's wall time from spawn to exit once the worker has
 *     gone.
 *
 * Whatever runs past a limit ends as a typed refusal (EnvelopeRefusal), never
 * an out-of-memory, a crash or a blocked event loop. A job's slot is free only
 * once its worker has exited (EXIT_GRACE_MS), so the isolates alive at once
 * never pass COREEDGE_CONTRACT_ISOLATES.
 *
 * WHY A WORKER, NOT A COOPERATIVE BUDGET. A budget threaded through every
 * loop bounds only the loops someone remembered to thread it through, which
 * is what six hostile reviews kept finding. A worker's limits are enforced by
 * V8 whatever the code does.
 *
 * LOADING. `new Worker(new URL("./compile.worker.ts", import.meta.url))` is
 * the form webpack (Next's server build) recognises: it bundles the worker as
 * its own chunk (chunks/contract-compiler-worker.js, traced into the routes
 * that spawn it by next.config.ts and checked after every build by
 * scripts/check-runtime-assets.mjs). Run from source (vitest, tsx scripts)
 * there is no bundle, and the worker loads the TypeScript file through tsx.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import v8 from "node:v8";
import { Worker } from "node:worker_threads";

import { LIMITS } from "@/lib/contracts/budget";
import { chargeContractTime, checkContractTime, reserveContractTime } from "@/lib/contracts/contract-time";
import type { EnvelopeRefusal, Job, JobOutput } from "@/lib/contracts/jobs";
import { inputBytesUpTo } from "@/lib/contracts/render-input";
import { HEAP_NOT_CAPPED, type WorkerInput, type WorkerReply } from "@/lib/contracts/worker-protocol";

declare const __webpack_require__: unknown;
// webpack's publicPath, as a bundled module reads and writes it (see construct).
// eslint-disable-next-line no-var
declare var __webpack_public_path__: string;

/** True inside a webpack bundle (the Next build), where the worker is a bundled chunk. */
const BUNDLED = typeof __webpack_require__ !== "undefined";

export interface EnvelopeLimits {
  /** V8 old generation (MB). */
  maxOldGenerationSizeMb: number;
  /** V8 young generation (MB). */
  maxYoungGenerationSizeMb: number;
  /** Stack (MB). */
  stackSizeMb: number;
  /** Wall-clock deadline (ms), from the worker's spawn. */
  deadlineMs: number;
}

/**
 * ONE SET OF LIMITS FOR EVERY JOB. Measured: an 8 MB V2 description of 400
 * entity types compiles in 1-2 s holding about 70 MB; a 32 MiB kit renders
 * in about 1.5 s; the most expensive description found (8 MB of CSDL JSON
 * members) is stopped by these limits. A worker at its cap is 402-472 MB of
 * RSS.
 */
export const CONTRACT_JOB_LIMITS: Readonly<EnvelopeLimits> = {
  maxOldGenerationSizeMb: 384,
  maxYoungGenerationSizeMb: 32,
  stackSizeMb: 4,
  deadlineMs: 10_000,
};

/** The gate's sizes (see the header). */
export const GATE = { perOrgRunning: 1, perOrgWaiting: 3, maxWaiting: 32, maxWaitMs: 10_000 } as const;

/** Workers at once (COREEDGE_CONTRACT_ISOLATES): default 1, 0 turns the compiler off. */
export function contractIsolates(): number {
  const raw = process.env.COREEDGE_CONTRACT_ISOLATES?.trim();
  return raw !== undefined && /^\d{1,2}$/.test(raw) ? Number(raw) : 1;
}

/** A job's slot is handed on this long after its worker was told to stop, should its 'exit' never come (logged). */
const EXIT_GRACE_MS = 5_000;

// ---------------------------------------------------------------- the gate

interface Waiter {
  readonly tenant: string | null;
  readonly start: (release: () => void) => void;
}

/**
 * THE ONE GATE: slots, each organisation's running and waiting jobs, and
 * least-recently-served dispatch (see the header). A job with no
 * organisation (a test, a script) has no per-organisation share and is
 * served first in turn.
 */
export class ContractGate {
  private running = 0;
  private readonly runningByOrg = new Map<string, number>();
  private readonly waiting: Waiter[] = [];
  /** When each organisation was last served: an order (a counter) for dispatch, and a time for pruning. */
  private readonly served = new Map<string, { order: number; at: number }>();
  private order = 0;
  private prunedAt = 0;

  constructor(private readonly slots: () => number = contractIsolates) {}

  /** A slot within `waitMs` — the function that frees it — or null (BUSY). */
  acquire(tenant: string | null, waitMs: number): Promise<(() => void) | null> {
    if (this.waiting.length === 0 && this.running < this.slots() && this.mayRun(tenant)) return Promise.resolve(this.occupy(tenant));
    if (this.waiting.length >= GATE.maxWaiting) return Promise.resolve(null);
    if (tenant !== null && this.waiting.filter((w) => w.tenant === tenant).length >= GATE.perOrgWaiting) return Promise.resolve(null);
    return new Promise((resolve) => {
      const waiter: Waiter = {
        tenant,
        start: (release) => {
          clearTimeout(timer);
          resolve(release);
        },
      };
      const timer = setTimeout(() => {
        const i = this.waiting.indexOf(waiter);
        if (i >= 0) this.waiting.splice(i, 1);
        resolve(null);
      }, Math.max(0, waitMs));
      this.waiting.push(waiter);
      // A slot may be free for this one (its organisation's job ahead of others).
      this.dispatch();
    });
  }

  /** For a test: the gate as it stands. */
  state(): { running: number; waiting: number; runningByOrg: Record<string, number> } {
    return { running: this.running, waiting: this.waiting.length, runningByOrg: Object.fromEntries(this.runningByOrg) };
  }

  private mayRun(tenant: string | null): boolean {
    return tenant === null || (this.runningByOrg.get(tenant) ?? 0) < GATE.perOrgRunning;
  }

  private occupy(tenant: string | null): () => void {
    this.running += 1;
    if (tenant !== null) {
      this.runningByOrg.set(tenant, (this.runningByOrg.get(tenant) ?? 0) + 1);
      const now = Date.now();
      this.served.set(tenant, { order: ++this.order, at: now });
      if (now - this.prunedAt > 60_000) {
        this.prunedAt = now;
        for (const [k, v] of this.served) if (now - v.at > 3_600_000) this.served.delete(k);
      }
    }
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.running -= 1;
      if (tenant !== null) {
        const n = (this.runningByOrg.get(tenant) ?? 1) - 1;
        if (n > 0) this.runningByOrg.set(tenant, n);
        else this.runningByOrg.delete(tenant);
      }
      this.dispatch();
    };
  }

  /** Free slots to the waiting jobs whose organisations were served least recently (first in, first out on a tie). */
  private dispatch(): void {
    while (this.running < this.slots()) {
      let best = -1;
      let bestOrder = Number.POSITIVE_INFINITY;
      for (let i = 0; i < this.waiting.length; i++) {
        const w = this.waiting[i]!;
        if (!this.mayRun(w.tenant)) continue;
        const order = w.tenant === null ? 0 : (this.served.get(w.tenant)?.order ?? 0);
        if (order < bestOrder) {
          best = i;
          bestOrder = order;
        }
      }
      if (best < 0) return;
      const [next] = this.waiting.splice(best, 1);
      next!.start(this.occupy(next!.tenant));
    }
  }
}

const gate = new ContractGate();

/** For a test: the process's gate as it stands. */
export function contractGateState(): ReturnType<ContractGate["state"]> {
  return gate.state();
}

/** Worker isolates spawned and not yet exited, and the most there were at once since the last look (for a test). */
let liveIsolates = 0;
let peakIsolates = 0;
export function envelopeIsolates(): { live: number; peak: number } {
  const r = { live: liveIsolates, peak: peakIsolates };
  peakIsolates = liveIsolates;
  return r;
}

// ---------------------------------------------------------------- a job

export type EnvelopeResult<T> =
  | { ok: true; value: T; ms: number }
  /**
   * `cause`: a code or an error's name; INPUT_CAUSE when what the job was
   * handed was past its bound. `retryAfterMs`: for ALLOWANCE, until 00:00 UTC.
   */
  | { ok: false; reason: EnvelopeRefusal; detail: string; ms: number; cause?: string; retryAfterMs?: number };

const DETAIL: Record<EnvelopeRefusal, string> = {
  RESOURCE_LIMIT: "It needs more memory or time than one contract compiler job may use, so it was not processed.",
  BUSY: "The contract compiler is busy, possibly with your organisation's other verifies, captures or downloads. Try again in a few seconds.",
  ALLOWANCE: "Your organisation has used its contract compile time for today.",
  DISABLED: "The contract compiler is turned off on this deployment (compiler disabled).",
  UNAVAILABLE: "The contract compiler could not be started, so nothing was processed.",
  INTERNAL: "It could not be read.",
};

/** The cause of a refusal for what the job was handed, not for what it did. */
export const INPUT_CAUSE = "input";
/** The cause of a refusal because the caller's own deadline (deadlineAt) came first. */
export const REQUEST_DEADLINE_CAUSE = "request-deadline";

export interface EnvelopeOptions {
  /** The organisation the job is for: its share of the gate, and its allowance. Null: a test or a script. */
  tenant?: string | null;
  /** When the caller must have its answer (ms since the epoch): the wait and the run end by then. */
  deadlineAt?: number | null;
  /** The limits (a test tightens them). */
  limits?: EnvelopeLimits;
}

/**
 * Run one job in a fresh worker, in order: the allowance (its deadline
 * reserved), the gate, `load` (only once the slot is held; null declines the
 * job, and null is answered), the worker, its exit, the slot freed, the
 * reservation settled to the wall time (0 for a job that never ran).
 */
export async function runContractJob<K extends Job["kind"]>(
  kind: K,
  load: () => Promise<Extract<Job, { kind: K }> | null>,
  opts: EnvelopeOptions = {},
): Promise<EnvelopeResult<JobOutput<K>> | null> {
  const queuedAt = Date.now();
  const tenant = opts.tenant ?? null;
  const deadlineAt = opts.deadlineAt ?? null;
  const limits = opts.limits ?? CONTRACT_JOB_LIMITS;
  const left = (ms: number) => (deadlineAt === null ? ms : Math.min(ms, deadlineAt - Date.now()));
  if (contractIsolates() === 0) return refuse("DISABLED", kind, queuedAt);
  // The allowance, checked and this job's deadline reserved in one statement
  // (contract-time.ts): the per-process gate below cannot see other instances.
  const reserved = tenant === null ? null : await reserveContractTime(tenant, limits.deadlineMs);
  if (reserved !== null && !reserved.ok) return refuse("ALLOWANCE", kind, queuedAt, "allowance", reserved.detail, reserved.retryAfterMs);
  let wallMs = 0;
  try {
    const wait = left(GATE.maxWaitMs);
    const release = wait > 0 ? await gate.acquire(tenant, wait) : null;
    if (!release) return refuse("BUSY", kind, queuedAt, deadlineAt !== null && deadlineAt <= Date.now() ? REQUEST_DEADLINE_CAUSE : undefined);
    try {
      const job = await load();
      if (job === null) return null;
      const runMs = left(limits.deadlineMs);
      if (job.kind === "render" && inputBytesUpTo(job.input, LIMITS.renderInput.bytes) > LIMITS.renderInput.bytes) {
        return refuse("RESOURCE_LIMIT", kind, queuedAt, INPUT_CAUSE);
      }
      if (runMs <= 0) return refuse("BUSY", kind, queuedAt, REQUEST_DEADLINE_CAUSE);
      const ran = await runWorker<JobOutput<K>>(job, { ...limits, deadlineMs: runMs }, queuedAt, runMs < limits.deadlineMs);
      wallMs = ran.wallMs;
      return ran.result;
    } finally {
      release();
    }
  } finally {
    // Settled to the wall time from spawn to exit; a job that never ran gives its reservation back.
    if (tenant !== null && reserved?.ok && (wallMs > 0 || reserved.reservation.ms > 0)) await chargeContractTime(tenant, wallMs, reserved.reservation.at, reserved.reservation.ms);
  }
}

/**
 * Whether a job of this organisation may start at all: DISABLED while the
 * compiler is off, ALLOWANCE once the organisation has used its day; null
 * when it may. A read that reserves nothing: the verify asks it BEFORE it
 * fetches a description (service-verify.ts), so an organisation whose time is
 * spent, or a deployment with the compiler off, costs no 8 MiB fetch and no
 * read of it on the request thread (consolidated review round 1); the record
 * job then reserves its own time as every job does (runContractJob).
 */
export async function contractJobAdmission<T = never>(kind: Job["kind"], tenant: string | null): Promise<EnvelopeResult<T> | null> {
  const since = Date.now();
  if (contractIsolates() === 0) return refuse("DISABLED", kind, since);
  if (tenant !== null) {
    const allowance = await checkContractTime(tenant);
    if (!allowance.ok) return refuse("ALLOWANCE", kind, since, "allowance", allowance.detail, allowance.retryAfterMs);
  }
  return null;
}

/** runContractJob for a job already in hand. */
export async function runJobInEnvelope<J extends Job>(job: J, opts: EnvelopeOptions = {}): Promise<EnvelopeResult<JobOutput<J["kind"]>>> {
  const r = await runContractJob(job.kind, () => Promise.resolve(job as unknown as Extract<Job, { kind: J["kind"] }>), opts);
  return r as EnvelopeResult<JobOutput<J["kind"]>>;
}

/** `cause`: what ended the job, as a code or an error's name — never a message, which can quote the input. */
function refuse<T>(reason: EnvelopeRefusal, kind: Job["kind"], since: number, cause?: string, detail?: string, retryAfterMs?: number): EnvelopeResult<T> {
  const ms = Date.now() - since;
  console.error("[contracts] envelope refused", { job: kind, reason, ms, ...(cause ? { cause } : {}) });
  return { ok: false, reason, detail: detail ?? DETAIL[reason], ms, ...(cause ? { cause } : {}), ...(retryAfterMs !== undefined ? { retryAfterMs } : {}) };
}

// ---------------------------------------------------------------- the worker

/** Errors that mean the job hit a limit rather than a defect. */
function isResourceError(name: string | undefined, code: string | undefined): boolean {
  return code === "ERR_WORKER_OUT_OF_MEMORY" || name === "RangeError";
}

/** Errors that mean the worker never loaded. */
function isLoadError(code: string | undefined): boolean {
  return code === "ERR_MODULE_NOT_FOUND" || code === "MODULE_NOT_FOUND" || code === "ERR_WORKER_PATH" || code === "ERR_WORKER_INIT_FAILED";
}

/**
 * THE HEAP CAP MUST HOLD WHATEVER THE PROCESS WAS STARTED WITH. V8 lets a
 * process-wide --max-old-space-size (NODE_OPTIONS commonly sets it) override
 * a worker's own resource limits, and --max-semi-space-size its young
 * generation: a worker asked for 384 MB got the process's 8 GB. So both
 * flags are set to the worker's caps while its isolate is created — each
 * spawn waits for the previous one to come online, so no two ask at once —
 * and put back the moment it is online (or has exited): the request
 * thread's own heap was sized at start and is not touched. And the worker
 * checks the heap it was given before it runs anything (compile.worker.ts):
 * one past its cap refuses the job (UNAVAILABLE), so nothing ever runs
 * uncapped.
 */
const OLD_SPACE_FLAG = /^--max[-_]old[-_]space[-_]size=(\d+)$/;
const SEMI_SPACE_FLAG = /^--max[-_]semi[-_]space[-_]size=(\d+)$/;

/** A size flag the process was started with, in MB; 0 when none (V8's "not set"). */
function startupFlagMb(flag: RegExp): number {
  let mb = 0;
  for (const f of [...(process.env.NODE_OPTIONS ?? "").split(/\s+/), ...process.execArgv]) {
    const m = flag.exec(f);
    if (m) mb = Number(m[1]);
  }
  return mb;
}

const STARTUP_OLD_SPACE_MB = startupFlagMb(OLD_SPACE_FLAG);
const STARTUP_SEMI_SPACE_MB = startupFlagMb(SEMI_SPACE_FLAG);

/** The heap a worker with these limits can at most be given: V8's limit is old generation plus young generation space. */
export function heapLimitBytes(limits: EnvelopeLimits): number {
  return (limits.maxOldGenerationSizeMb + 3 * limits.maxYoungGenerationSizeMb + 16) * 1024 * 1024;
}

let spawning: Promise<void> = Promise.resolve();

/** Spawn with the V8 flags set to the worker's caps until its isolate exists (see above). */
async function spawn(job: Job, limits: EnvelopeLimits): Promise<Worker> {
  const previous = spawning;
  let done!: () => void;
  spawning = new Promise((resolve) => (done = resolve));
  await previous;
  v8.setFlagsFromString(`--max-old-space-size=${limits.maxOldGenerationSizeMb}`);
  v8.setFlagsFromString("--max-semi-space-size=0");
  let restored = false;
  const restore = () => {
    // Once: a later exit must not reset the flags while the next spawn has them set.
    if (restored) return;
    restored = true;
    v8.setFlagsFromString(`--max-old-space-size=${STARTUP_OLD_SPACE_MB}`);
    v8.setFlagsFromString(`--max-semi-space-size=${STARTUP_SEMI_SPACE_MB}`);
    done();
  };
  let worker: Worker;
  try {
    worker = construct({ job, heapLimitBytes: heapLimitBytes(limits) }, limits);
  } catch (err) {
    restore();
    throw err;
  }
  liveIsolates += 1;
  peakIsolates = Math.max(peakIsolates, liveIsolates);
  worker.once("exit", () => (liveIsolates -= 1));
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
     * webpack resolves this URL as publicPath + chunk file against the
     * server's chunks directory; Next's server bundle carries the CLIENT's
     * publicPath ("/_next/"), which made it file:///_next/<chunk>.js. Empty
     * for exactly this expression, and put back before anything else can
     * run, it resolves to the chunk beside the server's own.
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
 * Run one job in a worker: its result, answered once the worker has exited
 * (or EXIT_GRACE_MS after it was told to stop), and the wall time from its
 * spawn to its exit — what the organisation is charged, a job killed at its
 * deadline or heap included. `cutByCaller`: the deadline is the caller's,
 * shorter than the job's own, so a job that meets it is BUSY, not
 * RESOURCE_LIMIT.
 */
function runWorker<T>(job: Job, limits: EnvelopeLimits, since: number, cutByCaller: boolean): Promise<{ result: EnvelopeResult<T>; wallMs: number }> {
  return new Promise((resolve) => {
    let result: EnvelopeResult<T> | null = null;
    let worker: Worker | undefined;
    let spawnedAt: number | null = null;
    let exitedAt: number | null = null;
    let gone = false;
    let grace: ReturnType<typeof setTimeout> | undefined;
    const answer = () => {
      if (result === null || !gone) return;
      clearTimeout(grace);
      const wallMs = spawnedAt === null ? 0 : (exitedAt ?? Date.now()) - spawnedAt;
      resolve({ result, wallMs });
    };
    const settle = (r: EnvelopeResult<T>) => {
      if (result !== null) return;
      result = r;
      clearTimeout(timer);
      // Its memory goes back now, however the job ended; the slot once it has.
      void worker?.terminate().catch(() => {});
      if (!gone) {
        grace = setTimeout(() => {
          console.error("[contracts] envelope worker did not exit", { job: job.kind, graceMs: EXIT_GRACE_MS });
          gone = true;
          answer();
        }, EXIT_GRACE_MS);
      }
      answer();
    };
    const timer = setTimeout(
      () => settle(cutByCaller ? refuse("BUSY", job.kind, since, REQUEST_DEADLINE_CAUSE) : refuse("RESOURCE_LIMIT", job.kind, since, "deadline")),
      limits.deadlineMs,
    );
    spawn(job, limits).then(
      (w) => {
        worker = w;
        spawnedAt = Date.now();
        w.once("exit", (code) => {
          exitedAt = Date.now();
          // An exit before any message: killed by a limit V8 enforces without an error event, or a crash.
          if (result === null) settle(refuse(code === 0 ? "INTERNAL" : "RESOURCE_LIMIT", job.kind, since, `exit ${code}`));
          gone = true;
          answer();
        });
        // The deadline passed while it was being spawned: it never runs.
        if (result !== null) {
          void w.terminate().catch(() => {});
          return;
        }
        w.once("message", (m: WorkerReply) => {
          if (m.ok) settle({ ok: true, value: m.value as T, ms: Date.now() - since });
          else if (m.error === HEAP_NOT_CAPPED) settle(refuse("UNAVAILABLE", job.kind, since, HEAP_NOT_CAPPED));
          else settle(refuse(isResourceError(m.error, undefined) ? "RESOURCE_LIMIT" : "INTERNAL", job.kind, since, m.error));
        });
        w.once("error", (err: Error & { code?: string }) => {
          settle(
            refuse(isResourceError(err.name, err.code) ? "RESOURCE_LIMIT" : isLoadError(err.code) ? "UNAVAILABLE" : "INTERNAL", job.kind, since, err.code ?? err.name),
          );
        });
      },
      (err: unknown) => {
        // Never made: nothing to wait for.
        gone = true;
        const code = (err as { code?: string } | null)?.code;
        settle(
          refuse(
            code === "ERR_WORKER_INVALID_EXEC_ARGV" || isLoadError(code) ? "UNAVAILABLE" : "INTERNAL",
            job.kind,
            since,
            code ?? (err instanceof Error ? err.name : "unknown"),
          ),
        );
      },
    );
  });
}
