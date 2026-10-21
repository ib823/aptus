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
 *     request thread's copy is bounded by the cap and not by the input;
 *   - SLOT FIRST (structural hardening round 3): a job takes its slot before
 *     anything is loaded, measured or copied for it — a read path hands in
 *     a loader, not a loaded input (runLoadedInEnvelope) — so a job refused
 *     BUSY has cost the request thread nothing, and waiting for a slot costs
 *     nothing either;
 *   - ONE ISOLATE BUDGET FOR THE INSTANCE (structural hardening round 4):
 *     however many pools hand out slots, at most envelopeIsolateSlots()
 *     isolates live at once, sized so that they, each at its heap cap, and
 *     the server itself fit the instance's memory (instanceMemoryMb) — a
 *     compile pool and a render pool of two each held four, 1.7 GB of
 *     isolates beside a 600 MB server on a 2 GB instance;
 *   - TEXT, NOT OBJECT GRAPHS (structural hardening round 4): stored JSON a
 *     job is handed crosses as its text (render-input.ts), counted by its
 *     length and parsed in the worker, so what the request thread pays to
 *     hand a job over is a copy of strings, not a walk and a structured
 *     clone of everything in them;
 *   - A CALLER'S OWN DEADLINE (structural hardening round 4): a job may be
 *     given the time its request has left (deadlineAt), which bounds its
 *     wait for a slot and its run together, so a verify answers inside the
 *     request's own limit instead of being cut off by the platform;
 *   - AN ALLOWANCE OVER TIME (structural hardening round 5): every job's
 *     worker time is charged to its organisation's hour and day, and to the
 *     deployment's day (envelope-allowance.ts); a job of an organisation
 *     whose allowance is spent is refused BUSY before it takes a slot. And
 *     the isolates live at once leave the request thread a CPU
 *     (envelopeIsolateSlots).
 *
 * Whatever runs past any of them ends as a typed refusal (RESOURCE_LIMIT,
 * BUSY, UNAVAILABLE), which the verify reports as a contract that was not
 * compiled (NOT_COMPILED) while the verify itself answers exactly as it did
 * before the compiler existed. Never an out-of-memory, a crash or a blocked
 * event loop: the request thread only copies the description (or stored
 * texts) in and a bounded result out (pipeline.ts says what crosses).
 *
 * The worker is spawned per job and terminated after it, so its memory goes
 * back when the job ends however the job ended — and the job's slot is free
 * only once the worker has exited (EXIT_GRACE_MS, below).
 *
 * READ PATHS TOO (structural hardening round 2). /schema, the starter kit
 * and the solution document render a stored contract on every read; one too
 * large to render on the request thread (read-render.ts) is rendered here,
 * as a `render` job, in slots of its own (ENVELOPE_RENDER_CONCURRENCY).
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

import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import v8 from "node:v8";
import { Worker } from "node:worker_threads";

import { LIMITS } from "@/lib/contracts/budget";
import { allowanceRefusalDetail, chargeEnvelopeAllowance, checkEnvelopeAllowance } from "@/lib/contracts/envelope-allowance";
import { inputBytesUpTo } from "@/lib/contracts/render-input";
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
  /**
   * A read path's render past what the request thread may render
   * (read-render.ts): at the largest budget (a 32 MiB kit or document) about
   * 1.5 s and a few hundred MB measured, the same order as the record-time
   * renders a compile already does.
   */
  render: { maxOldGenerationSizeMb: 384, maxYoungGenerationSizeMb: 32, stackSizeMb: 4, deadlineMs: 10_000 },
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
 * READ-PATH RENDERS HAVE SLOTS OF THEIR OWN (structural hardening round 2).
 * A render too large for the request thread (read-render.ts) runs here, but
 * never in a compile's slot: a builder's loop of kit downloads must not
 * queue every tenant's verify behind it, nor a burst of verifies every
 * northbound /schema. One running per organisation, as compiles.
 *
 * AND A READ WAITS FOR ITS TURN (structural hardening round 3). With two
 * waiting places per organisation, a consumer fetching /schema for four
 * interfaces at start-up had its fourth answered UNAVAILABLE. A read loads
 * its input only once it has a slot (runLoadedInEnvelope), so waiting costs
 * nothing, and an organisation may keep ENVELOPE_RENDER_TENANT_WAITING reads
 * waiting, each until its deadline.
 */
export const ENVELOPE_RENDER_CONCURRENCY = 2;
export const ENVELOPE_RENDER_QUEUE = 64;
export const ENVELOPE_RENDER_TENANT_WAITING = 16;

/**
 * A VERIFY TAKES A TURN TOO, BEFORE IT READS ANYTHING (structural hardening
 * round 3). A verify reads up to 8 MiB of description from SAP and works on
 * it; nothing stopped one builder sending twenty at once, each doing
 * description-sized work. So a verify holds one of these slots from before
 * it asks SAP for the description until it has answered: one at a time per
 * organisation, ENVELOPE_TENANT_WAITING more waiting at most VERIFY_WAIT_MS,
 * and the next refused at once (service-verify.ts: BUSY) — before any
 * description is read. Across organisations it is no tighter than the
 * compile slots behind it.
 */
export const ENVELOPE_VERIFY_CONCURRENCY = 16;
export const ENVELOPE_VERIFY_QUEUE = 64;
export const VERIFY_WAIT_MS = 20_000;
/**
 * HOW MANY OF ONE ORGANISATION'S VERIFIES MAY READ AT ONCE (structural
 * hardening round 4). Round 3 let one at a time hold the turn — through the
 * SAP read itself — so one interface whose SAP hung for its 30 s timeout made
 * every teammate's verify of a healthy system wait 20 s and answer BUSY,
 * SAP never asked. The turn bounds the descriptions an organisation holds in
 * flight (at most this many × LIMITS.sourceBytes), not one at a time: as
 * many as its compiles can run or wait for (ENVELOPE_TENANT_RUNNING +
 * ENVELOPE_TENANT_WAITING), so a slow system holds one of them and the
 * others still read, and none of them is refused a compile for want of a
 * place in the queue.
 */
export const ENVELOPE_VERIFY_TENANT_RUNNING = 3;

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

/**
 * A SLOT IS FREE WHEN ITS ISOLATE IS GONE (structural hardening round 2).
 * The slot used to be handed on the moment the job's result was in, while
 * the terminated worker — up to its whole heap — was still exiting: a burst
 * of jobs ending at their deadline held three and four isolates against a
 * cap of two. Now a job holds its slot until its worker's 'exit' (and its
 * caller is answered then, so nothing that awaited a job sees its slot
 * still taken); should an exit never come, the slot is handed on after
 * EXIT_GRACE_MS all the same, and that is logged.
 */
const EXIT_GRACE_MS = 5_000;

export type EnvelopeResult<T> =
  | { ok: true; value: T; ms: number }
  /** `cause`: a code or an error's name; INPUT_CAUSE when what the job was handed was past its bound. */
  | { ok: false; reason: EnvelopeRefusal; detail: string; ms: number; cause?: string };

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

/** A set of slots and the queue for them, with each organisation's share (above). */
interface Pool {
  readonly concurrency: number;
  readonly queue: number;
  /** How many of one organisation's jobs may wait at once. */
  readonly tenantWaiting: number;
  /** How many of one organisation's jobs may run at once. */
  readonly tenantRunning: number;
  running: number;
  readonly runningByTenant: Map<string, number>;
  readonly waiting: Waiter[];
}

const pool = (concurrency: number, queue: number, tenantWaiting: number, tenantRunning: number = ENVELOPE_TENANT_RUNNING): Pool => ({
  concurrency,
  queue,
  tenantWaiting,
  tenantRunning,
  running: 0,
  runningByTenant: new Map(),
  waiting: [],
});

/**
 * THE INSTANCE'S MEMORY, AND THE ISOLATES IT HOLDS (structural hardening
 * round 4). Each pool's slots were sized on their own — two compiles, two
 * renders — so one instance could hold four isolates, each allowed its whole
 * heap cap: 4 × 432 MB measured beside a 617 MB server, 2.3 GB, on a Vercel
 * Hobby function instance that has 2 GB and cannot be given more. Past it the
 * platform kills the instance, and every tenant's in-flight request with it:
 * exactly what "the worst a description can do to memory is end its own
 * worker" must exclude.
 *
 * So every job, whatever its pool, also holds one of envelopeIsolateSlots()
 * isolate slots while its worker lives, and that number is DERIVED from the
 * instance's memory: what is left after the server's own headroom, divided by
 * the most one isolate may hold (its heap cap and its overhead). The
 * instance's memory is the deployment's (COREEDGE_INSTANCE_MEMORY_MB), or
 * 2,048 MB — the Hobby plan's fixed instance — and never more than the
 * process's own cgroup limit when Node reports one (process.constrainedMemory).
 * One organisation holds at most one isolate at a time, so another always
 * has one.
 */
export const DEFAULT_INSTANCE_MEMORY_MB = 2048;
/** What the server itself holds beside the isolates: 617 MiB measured (next-server with the contract routes loaded), and margin. */
export const SERVER_HEADROOM_MB = 768;
/** What an isolate holds beyond its heap (its own code, stacks, buffers): about 7 MB measured; this is the allowance. */
export const ISOLATE_OVERHEAD_MB = 32;
const INSTANCE_MB_RANGE = [512, 65_536] as const;

/** The memory the instance has, in MB (see above). */
export function instanceMemoryMb(): number {
  let mb = envInt("COREEDGE_INSTANCE_MEMORY_MB", INSTANCE_MB_RANGE) ?? DEFAULT_INSTANCE_MEMORY_MB;
  const constrained = typeof process.constrainedMemory === "function" ? process.constrainedMemory() : 0;
  if (Number.isFinite(constrained) && constrained > 0) mb = Math.min(mb, Math.floor(constrained / (1024 * 1024)));
  return mb;
}

/** The most memory one isolate may hold, in MB: the largest heap cap of any job kind, and its overhead. */
export function isolateFootprintMb(): number {
  let heap = 0;
  for (const kind of Object.keys(ENVELOPE_LIMITS) as Job["kind"][]) heap = Math.max(heap, heapLimitBytes(envelopeLimitsFor(kind)));
  return Math.ceil(heap / (1024 * 1024)) + ISOLATE_OVERHEAD_MB;
}

/**
 * THE INSTANCE'S CPUS (structural hardening round 5). The isolate budget was
 * memory's alone: two on a 2 GB Hobby instance, which has one vCPU, so two
 * hostile compiles and the request thread shared one CPU and every tenant's
 * requests ran at half speed for as long as the compiles did. Now an isolate
 * also needs a CPU the request thread is not using: at most one fewer
 * isolates than the instance has CPUs, and at least one. The CPUs are the
 * deployment's (COREEDGE_INSTANCE_CPUS — set it where the platform shows the
 * process more CPUs than its quota gives it), or what Node reports
 * (os.availableParallelism).
 */
export function instanceCpus(): number {
  return envInt("COREEDGE_INSTANCE_CPUS", [1, 1024]) ?? Math.max(1, os.availableParallelism());
}

/**
 * How many isolates may live at once in this process: as many as the
 * instance's memory holds beside the server, and as its CPUs leave one for
 * the request thread — at least one.
 */
export function envelopeIsolateSlots(): number {
  const room = instanceMemoryMb() - SERVER_HEADROOM_MB;
  const byMemory = Math.floor(room / isolateFootprintMb());
  const byCpu = instanceCpus() - 1;
  return Math.max(1, Math.min(ENVELOPE_CONCURRENCY + ENVELOPE_RENDER_CONCURRENCY, byMemory, byCpu));
}

/**
 * Compiles, prepares and diffs share one pool; read-path renders have their
 * own; verifies take a turn in a third; and every job's worker holds one of
 * the instance's isolate slots (above) while it lives.
 */
const POOLS = {
  compile: pool(ENVELOPE_CONCURRENCY, ENVELOPE_QUEUE, ENVELOPE_TENANT_WAITING),
  render: pool(ENVELOPE_RENDER_CONCURRENCY, ENVELOPE_RENDER_QUEUE, ENVELOPE_RENDER_TENANT_WAITING),
  verify: pool(ENVELOPE_VERIFY_CONCURRENCY, ENVELOPE_VERIFY_QUEUE, ENVELOPE_TENANT_WAITING, ENVELOPE_VERIFY_TENANT_RUNNING),
  // Every job that holds a compile or a render slot may wait here, so the queue is theirs together.
  isolate: pool(
    envelopeIsolateSlots(),
    ENVELOPE_CONCURRENCY + ENVELOPE_RENDER_CONCURRENCY,
    ENVELOPE_CONCURRENCY + ENVELOPE_RENDER_CONCURRENCY,
  ),
};
export type EnvelopePool = keyof typeof POOLS;
const poolOf = (kind: Job["kind"]): EnvelopePool => (kind === "render" ? "render" : "compile");

/** May a job of this tenant take a slot now (its organisation's share allowing)? */
function withinShare(p: Pool, tenant: string | null): boolean {
  return tenant === null || (p.runningByTenant.get(tenant) ?? 0) < p.tenantRunning;
}

function occupy(p: Pool, tenant: string | null): void {
  p.running += 1;
  if (tenant !== null) p.runningByTenant.set(tenant, (p.runningByTenant.get(tenant) ?? 0) + 1);
}

/** A slot now (true), a place in the queue (the waiter), or neither (false: BUSY). */
function acquire(p: Pool, tenant: string | null): true | false | Waiter {
  if (p.running < p.concurrency && withinShare(p, tenant)) {
    occupy(p, tenant);
    return true;
  }
  if (p.waiting.length >= p.queue) return false;
  if (tenant !== null) {
    let mine = 0;
    for (const w of p.waiting) if (w.tenant === tenant) mine += 1;
    if (mine >= p.tenantWaiting) return false;
  }
  let start!: () => void;
  const turn = new Promise<void>((resolve) => (start = resolve));
  const waiter: Waiter = { tenant, turn, start };
  p.waiting.push(waiter);
  return waiter;
}

/** Hand free slots to the first waiting jobs whose organisations' shares allow them. */
function dispatch(p: Pool): void {
  while (p.running < p.concurrency) {
    const i = p.waiting.findIndex((w) => withinShare(p, w.tenant));
    if (i < 0) return;
    const [next] = p.waiting.splice(i, 1);
    occupy(p, next!.tenant);
    next!.start();
  }
}

function release(p: Pool, tenant: string | null): void {
  p.running -= 1;
  if (tenant !== null) {
    const n = (p.runningByTenant.get(tenant) ?? 1) - 1;
    if (n > 0) p.runningByTenant.set(tenant, n);
    else p.runningByTenant.delete(tenant);
  }
  dispatch(p);
}

/** Leave the queue (a wait that timed out): false when the turn was already given. */
function abandon(p: Pool, waiter: Waiter): boolean {
  const i = p.waiting.indexOf(waiter);
  if (i < 0) return false;
  p.waiting.splice(i, 1);
  return true;
}

/** A pool as it stands, for a test: running, by tenant, and waiting (the compile pool unless asked). */
export function envelopeQueueState(kind: EnvelopePool = "compile"): {
  running: number;
  waiting: number;
  runningByTenant: Record<string, number>;
} {
  const p = POOLS[kind];
  return { running: p.running, waiting: p.waiting.length, runningByTenant: Object.fromEntries(p.runningByTenant) };
}

/** Worker isolates spawned and not yet exited, and the most there were at once since the last look (for a test). */
let liveIsolates = 0;
let peakIsolates = 0;
export function envelopeIsolates(): { live: number; peak: number } {
  const r = { live: liveIsolates, peak: peakIsolates };
  peakIsolates = liveIsolates;
  return r;
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
  liveIsolates += 1;
  peakIsolates = Math.max(peakIsolates, liveIsolates);
  worker.once("exit", () => (liveIsolates -= 1));
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
 * never reaches the worker. A render's input is bounded the same way, by
 * LIMITS.renderInput, which every input a read path stores fits by
 * construction. A description (compile) is a string, copied whole in one
 * step, and the reader already capped it (LIMITS.sourceBytes). Measured only
 * once the job holds its slot, so a refused job is never measured. Stored
 * JSON handed in as its text (render-input.ts) is counted by its length,
 * never walked: the walk covers only the job's own structure.
 */
function overInputBound(job: Job): boolean {
  const cap = LIMITS.contract.cap;
  if (job.kind === "prepare") return inputBytesUpTo(job.input.contract, cap) > cap;
  if (job.kind === "render") return inputBytesUpTo(job.input, LIMITS.renderInput.bytes) > LIMITS.renderInput.bytes;
  if (job.kind === "diff") {
    // A stored IR crosses as its jsonb text, at most twice its canonical bytes (render-input.ts).
    const n = (Array.isArray(job.input.previous) ? job.input.previous.length : 0) + 1;
    return inputBytesUpTo(job.input, 2 * n * cap) > 2 * n * cap;
  }
  return false;
}

/** The cause of a refusal for what the job was handed, not for what it did (read-render.ts tells the two apart). */
export const INPUT_CAUSE = "input";

/** How a job past the input bound is answered: a prepared contract that is too large, or a refusal saying so. */
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
  return refuse("RESOURCE_LIMIT", job.kind, since, INPUT_CAUSE);
}

export interface EnvelopeOptions {
  /** The organisation the job is for: its share of the slots and the queue (ENVELOPE_TENANT_*). */
  tenant?: string | null;
  /**
   * The time (ms since the epoch) by which the caller must have its answer —
   * its request's own limit (structural hardening round 4). The wait for a
   * slot and the run together end by then; a job cut short by it is BUSY
   * (cause REQUEST_DEADLINE_CAUSE), never a description that needs too much.
   */
  deadlineAt?: number | null;
}

/** The cause of a refusal because the caller's own deadline (deadlineAt) came first. */
export const REQUEST_DEADLINE_CAUSE = "request-deadline";

/** The cause of a refusal because the organisation's (or the deployment's) allowance is spent (envelope-allowance.ts). */
export const ALLOWANCE_CAUSE = "allowance";

/**
 * Hold one of a pool's slots while `body` runs, waiting for one at most
 * `waitMs`: the body's value, or BUSY — at once when the organisation's share
 * of the queue (or the queue) is full, or when the wait ends with no slot.
 * Nothing of the body runs before it has its slot, so a refusal costs the
 * caller nothing. Released however the body ends.
 */
export async function withEnvelopeSlot<R>(
  name: EnvelopePool,
  tenant: string | null,
  waitMs: number,
  body: () => Promise<R>,
): Promise<{ ok: true; value: R } | { ok: false; reason: "BUSY" }> {
  const p = POOLS[name];
  const turn = acquire(p, tenant);
  if (turn === false) return { ok: false, reason: "BUSY" };
  if (turn !== true) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timedOut = await Promise.race([
      turn.turn.then(() => false),
      new Promise<boolean>((resolve) => (timer = setTimeout(() => resolve(true), waitMs))),
    ]);
    clearTimeout(timer);
    // Out of the queue the moment the wait ends, so a stale waiter never holds a place;
    // a turn given just as the wait ended is handed straight on.
    if (timedOut) {
      if (!abandon(p, turn)) release(p, tenant);
      return { ok: false, reason: "BUSY" };
    }
  }
  try {
    return { ok: true, value: await body() };
  } finally {
    release(p, tenant);
  }
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
  const r = await runLoadedInEnvelope(job.kind, () => Promise.resolve<Job>(job), limits, opts);
  // The loader always hands the job over, so there is always a result.
  return r as EnvelopeResult<JobOutput<J["kind"]>>;
}

/**
 * runInEnvelope for a job whose input is loaded only once it has a slot: a
 * read path's render, whose contract, schema and fixtures are read from the
 * database, measured and copied into the worker only when it is its turn —
 * never for a read that is refused or still waiting. `load` answering null
 * declines the job (its caller found it need not run); the slot is handed on
 * and null is answered.
 */
export async function runLoadedInEnvelope<K extends Job["kind"]>(
  kind: K,
  load: () => Promise<Job | null>,
  limits: EnvelopeLimits = envelopeLimitsFor(kind),
  opts: EnvelopeOptions = {},
): Promise<EnvelopeResult<JobOutput<K>> | null> {
  const queuedAt = Date.now();
  const tenant = opts.tenant ?? null;
  const deadlineAt = opts.deadlineAt ?? null;
  /** What is left of the caller's own time, capped at `ms`. */
  const within = (ms: number) => (deadlineAt === null ? ms : Math.min(ms, deadlineAt - Date.now()));
  // A job waits for its slot at most its own deadline (and never past the caller's), then runs at most its deadline.
  const wait = within(limits.deadlineMs);
  if (wait <= 0) return refuse("BUSY", kind, queuedAt, REQUEST_DEADLINE_CAUSE);
  // The organisation's time over the hour and the day, and the deployment's (envelope-allowance.ts): before any slot.
  if (tenant !== null) {
    const allowance = await checkEnvelopeAllowance(tenant);
    if (!allowance.ok) return refuse("BUSY", kind, queuedAt, ALLOWANCE_CAUSE, allowanceRefusalDetail(allowance));
  }
  const charge = (ms: number) => {
    if (tenant !== null) void chargeEnvelopeAllowance(tenant, ms);
  };
  const r = await withEnvelopeSlot(poolOf(kind), tenant, wait, async () => {
    const job = await load();
    if (job === null) return null;
    if (overInputBound(job)) return inputRefusal(job, queuedAt) as EnvelopeResult<JobOutput<K>>;
    // Then one of the instance's isolates (envelopeIsolateSlots), waited for within the same time.
    const isolateWait = within(limits.deadlineMs - (Date.now() - queuedAt));
    if (isolateWait <= 0) return refuse<JobOutput<K>>("BUSY", kind, queuedAt, deadlineAt === null ? undefined : REQUEST_DEADLINE_CAUSE);
    const ran = await withEnvelopeSlot("isolate", tenant, isolateWait, () => {
      const runMs = within(limits.deadlineMs);
      if (runMs <= 0) return Promise.resolve(refuse<JobOutput<K>>("BUSY", kind, queuedAt, REQUEST_DEADLINE_CAUSE));
      // Answered once its worker has exited, so neither slot is free while its isolate lives (EXIT_GRACE_MS).
      return runWorker<JobOutput<K>>(job, { ...limits, deadlineMs: runMs }, queuedAt, runMs < limits.deadlineMs, charge);
    });
    return ran.ok ? ran.value : refuse<JobOutput<K>>("BUSY", kind, queuedAt);
  });
  return r.ok ? r.value : refuse("BUSY", kind, queuedAt, deadlineAt !== null && deadlineAt <= Date.now() ? REQUEST_DEADLINE_CAUSE : undefined);
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
  deadlineAt: number | null = null,
): Promise<CompiledService> {
  const r = await runInEnvelope({ kind: "compile", input: { body, entitySet, subject } }, undefined, { tenant, deadlineAt });
  if (r.ok) return r.value;
  if (r.reason === "INTERNAL") {
    console.error("[contracts] compile failed", { error: "INTERNAL" });
    return { ok: false, reason: "INVALID_CSDL", detail: r.detail };
  }
  return { ok: false, reason: r.reason, detail: r.detail };
}

/** `cause`: what ended the job, as a code or an error's name — never a message, which can quote the description. */
function refuse<T>(reason: EnvelopeRefusal, kind: Job["kind"], since: number, cause?: string, detail?: string): EnvelopeResult<T> {
  const ms = Date.now() - since;
  console.error("[contracts] envelope refused", { job: kind, reason, ms, ...(cause ? { cause } : {}) });
  return { ok: false, reason, detail: detail ?? DETAIL[reason], ms, ...(cause ? { cause } : {}) };
}

/**
 * `cutByCaller`: the run's deadline is the caller's (deadlineAt), shorter than
 * the job's own — a job that meets it was not given its time, so it is BUSY,
 * not RESOURCE_LIMIT.
 *
 * `charge`: told once, when the job ends, the worker time it used — the CPU
 * time its thread measured, or, for a worker ended before it could say, the
 * time it ran (envelope-allowance.ts).
 */
function runWorker<T>(
  job: Job,
  limits: EnvelopeLimits,
  since: number,
  cutByCaller = false,
  charge: (ms: number) => void = () => {},
): Promise<EnvelopeResult<T>> {
  return new Promise((resolve) => {
    let result: EnvelopeResult<T> | null = null;
    let worker: Worker | undefined;
    /** When the worker was made, and the CPU time it reported. */
    let runningSince: number | null = null;
    let reportedCpuMs: number | null = null;
    /** The isolate is gone: it exited, or it was never made. */
    let gone = false;
    let grace: ReturnType<typeof setTimeout> | undefined;
    let answered = false;
    // Answered once there is a result AND its isolate is gone; the caller frees the slot right after.
    const answer = () => {
      if (answered || result === null || !gone) return;
      answered = true;
      clearTimeout(grace);
      resolve(result);
    };
    const settle = (r: EnvelopeResult<T>) => {
      if (result !== null) return;
      result = r;
      clearTimeout(timer);
      charge(reportedCpuMs ?? (runningSince === null ? 0 : Date.now() - runningSince));
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
        runningSince = Date.now();
        w.once("exit", (code) => {
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
          if (typeof m.cpuMs === "number" && Number.isFinite(m.cpuMs)) reportedCpuMs = m.cpuMs;
          if (m.ok) settle({ ok: true, value: m.value as T, ms: Date.now() - since });
          else if (m.error === HEAP_NOT_CAPPED) settle(refuse("UNAVAILABLE", job.kind, since, HEAP_NOT_CAPPED));
          else settle(refuse(isResourceError(m.error, undefined) ? "RESOURCE_LIMIT" : "INTERNAL", job.kind, since, m.error));
        });
        w.once("error", (err: Error & { code?: string }) => {
          settle(
            refuse(
              isResourceError(err.name, err.code) ? "RESOURCE_LIMIT" : isLoadError(err.code) ? "UNAVAILABLE" : "INTERNAL",
              job.kind,
              since,
              err.code ?? err.name,
            ),
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
        answer();
      },
    );
  });
}
