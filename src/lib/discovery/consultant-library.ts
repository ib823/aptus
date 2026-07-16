/**
 * ABeam Workbench — Neutral Process Discovery CONSULTANT library loader.
 *
 * ⚠ CONSULTANT-ONLY. This module reads discovery-library.consultant.json, which
 * carries origin, APQC, full provenance and the 18 parked vendor enablers —
 * i.e. vendor terms. It must be reachable ONLY from (workbench) routes. No
 * (external) module may import it, directly or transitively; the
 * dependency-boundary test proves that from every (external) entry point.
 *
 * Data is frozen and hash-pinned (626f605fc732f494). See BUILD-LOG.md.
 */

import raw from "@/data/discovery/discovery-library.consultant.json";
import { allClientProcesses } from "./client-library";
import {
  ConsultantLibrarySchema,
  type Completeness,
  type ConsultantLibrary,
  type ConsultantProcess,
  type ConsultantValueStream,
} from "./schema";

let cached: ConsultantLibrary | null = null;

export function loadConsultantLibrary(): ConsultantLibrary {
  if (cached) return cached;
  cached = ConsultantLibrarySchema.parse(raw);
  return cached;
}

export function allConsultantProcesses(): ConsultantProcess[] {
  const out: ConsultantProcess[] = [];
  for (const vs of loadConsultantLibrary().value_streams) {
    for (const wf of vs.workflows) out.push(...wf.processes);
  }
  return out;
}

export function consultantValueStreams(): ConsultantValueStream[] {
  return loadConsultantLibrary().value_streams;
}

export function findConsultantProcess(scopeId: string): ConsultantProcess | null {
  return allConsultantProcesses().find((p) => p.scope_id === scopeId) ?? null;
}

/**
 * D2 — the consultant dataset carries no `completeness`, but invariant 4 wants a
 * completeness badge everywhere a process renders, including the C2 library
 * grid. Rather than edit frozen data, derive it across the join: consultant
 * `scope_id` → client `id` (742/742, no orphans).
 */
let completenessByScopeId: ReadonlyMap<string, Completeness | null> | null = null;

export function completenessIndex(): ReadonlyMap<string, Completeness | null> {
  if (completenessByScopeId) return completenessByScopeId;
  const index = new Map<string, Completeness | null>();
  for (const p of allClientProcesses()) index.set(p.id, p.completeness);
  completenessByScopeId = index;
  return index;
}

/**
 * Completeness for a consultant process, via the join. Returns null for the 16
 * processes with no flow — render the fallback badge, never a guess.
 */
export function completenessFor(scopeId: string): Completeness | null {
  return completenessIndex().get(scopeId) ?? null;
}

/** A consultant process with its joined completeness — the C2 grid row shape. */
export interface ConsultantProcessWithCompleteness extends ConsultantProcess {
  completeness: Completeness | null;
}

export function allConsultantProcessesWithCompleteness(): ConsultantProcessWithCompleteness[] {
  const index = completenessIndex();
  return allConsultantProcesses().map((p) => ({
    ...p,
    completeness: index.get(p.scope_id) ?? null,
  }));
}
