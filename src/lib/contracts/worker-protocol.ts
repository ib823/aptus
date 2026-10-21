/**
 * What the envelope (envelope.ts) and its worker (compile.worker.ts) say to
 * each other. Its own module so the request thread never imports the worker's
 * entry, whose top level runs a job.
 */

import type { Job } from "@/lib/contracts/pipeline";

/** What the worker is handed: its job, and the most heap it may have been given to run it. */
export interface WorkerInput {
  job: Job;
  heapLimitBytes: number;
}

export interface WorkerReply {
  ok: boolean;
  value?: unknown;
  /** The thrown error's name, or HEAP_NOT_CAPPED, when !ok. */
  error?: string;
  /** The CPU time the job's thread used, in ms, when Node measures it (compile.worker.ts). */
  cpuMs?: number | undefined;
}

/** The worker found its heap larger than its cap, and ran nothing. */
export const HEAP_NOT_CAPPED = "HeapNotCapped";
