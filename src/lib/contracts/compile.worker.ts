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

import { runJob } from "@/lib/contracts/pipeline";
import { HEAP_NOT_CAPPED, type WorkerInput, type WorkerReply } from "@/lib/contracts/worker-protocol";

function reply(message: WorkerReply): void {
  parentPort?.postMessage(message);
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
