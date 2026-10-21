/**
 * The Contract Compiler's worker: runs ONE job (pipeline.ts) from workerData,
 * posts its result, and is terminated (envelope.ts). Nothing else runs here,
 * so the heap cap and the deadline the envelope sets bound exactly the
 * compiler's own work.
 *
 * FIRST, THE HEAP IT WAS GIVEN. V8 lets a process-wide --max-old-space-size
 * override a worker's own resource limits; the envelope sets that flag to the
 * worker's cap while it is created (envelope.ts), and this checks that it
 * took: a heap larger than the cap runs nothing and says so (HEAP_NOT_CAPPED,
 * refused as UNAVAILABLE), so no job ever runs uncapped.
 *
 * A job that throws posts what it was, by name only: a RangeError (the stack
 * exhausted, a string past V8's limit) is the envelope's RESOURCE_LIMIT; any
 * other error is a defect, refused as INTERNAL. Never the message, which can
 * quote the description.
 */

import v8 from "node:v8";
import { parentPort, workerData } from "node:worker_threads";

import { threadCpuMs } from "@/lib/contracts/budget";
import { replyOf, runJob, type Job, type RenderedForRead } from "@/lib/contracts/pipeline";
import { HEAP_NOT_CAPPED, type WorkerInput, type WorkerReply } from "@/lib/contracts/worker-protocol";

function reply(message: WorkerReply, transfer: ArrayBuffer[] = []): void {
  parentPort?.postMessage(message, transfer);
}

/**
 * A read path's rendered texts go back as UTF-8 bytes, encoded here and
 * TRANSFERRED (structural hardening round 3): the request thread receives
 * the buffers without copying them, and writes them into the answer as they
 * are (read-render.ts, RawJson), never decoding or re-encoding the text.
 */
function withTransfer(job: Job, value: unknown): { value: unknown; transfer: ArrayBuffer[] } {
  const rendered = value as RenderedForRead;
  if (job.kind !== "render" || !rendered.ok) return { value, transfer: [] };
  const encoder = new TextEncoder();
  // Each text owns its whole buffer, so transferring one never takes another's bytes with it.
  const own = (u: Uint8Array): Uint8Array => (u.byteOffset === 0 && u.byteLength === u.buffer.byteLength ? u : u.slice());
  const texts = rendered.texts.map((t) => own(typeof t === "string" ? encoder.encode(t) : t));
  return { value: { ok: true, texts }, transfer: [...new Set(texts.map((t) => t.buffer as ArrayBuffer))] };
}

/**
 * The CPU time this job's thread used (structural hardening round 5): what
 * the envelope charges the organisation's allowance (envelope-allowance.ts).
 * Null where Node has no per-thread measure; the envelope then charges the
 * time the job ran. All of the thread's time, its start and loading
 * included: every job pays for its own isolate.
 */
const cpuSpent = (): number | undefined => threadCpuMs() ?? undefined;

const input = workerData as WorkerInput;
if (v8.getHeapStatistics().heap_size_limit > input.heapLimitBytes) {
  reply({ ok: false, error: HEAP_NOT_CAPPED });
} else {
  try {
    // What only gets stored crosses back as its text (replyOf, pipeline.ts); a render's texts as bytes.
    const out = withTransfer(input.job, replyOf(input.job, runJob(input.job)));
    reply({ ok: true, value: out.value, cpuMs: cpuSpent() }, out.transfer);
  } catch (err) {
    reply({ ok: false, error: err instanceof Error ? err.name : "unknown", cpuMs: cpuSpent() });
  }
}
