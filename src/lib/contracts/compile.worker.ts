/**
 * The Contract Compiler's worker: runs ONE job (jobs.ts) from workerData,
 * posts its result, and is terminated (envelope.ts). Nothing else runs here,
 * so the heap cap and the deadline the envelope sets bound exactly the
 * job's own work.
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
 *
 * TEXT GOES BACK TRANSFERRED. Every text a job sends back (jobs.ts, Text) is
 * a Uint8Array owning its whole buffer, and its buffer is transferred, not
 * copied: the request thread receives it without a copy or a re-read.
 */

import v8 from "node:v8";
import { parentPort, workerData } from "node:worker_threads";

import { runJob } from "@/lib/contracts/jobs";
import { HEAP_NOT_CAPPED, type WorkerInput, type WorkerReply } from "@/lib/contracts/worker-protocol";

/** The buffers of every Uint8Array in a reply (it is a small tree of plain values around them). */
function buffers(v: unknown, out: Set<ArrayBuffer>, depth = 0): Set<ArrayBuffer> {
  if (v instanceof Uint8Array) {
    if (v.byteOffset === 0 && v.byteLength === v.buffer.byteLength) out.add(v.buffer as ArrayBuffer);
  } else if (v !== null && typeof v === "object" && depth < 6) {
    for (const x of Array.isArray(v) ? v : Object.values(v)) buffers(x, out, depth + 1);
  }
  return out;
}

function reply(message: WorkerReply): void {
  parentPort?.postMessage(message, [...buffers(message.value, new Set())]);
}

const input = workerData as WorkerInput;
if (v8.getHeapStatistics().heap_size_limit > input.heapLimitBytes) {
  reply({ ok: false, error: HEAP_NOT_CAPPED });
} else {
  try {
    reply({ ok: true, value: runJob(input.job) });
  } catch (err) {
    reply({ ok: false, error: err instanceof Error ? err.name : "unknown" });
  }
}
