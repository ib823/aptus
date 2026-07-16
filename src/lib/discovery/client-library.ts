/**
 * ABeam Workbench — Neutral Process Discovery CLIENT library loader.
 *
 * THIS MODULE IS THE ONLY CONTENT SOURCE FOR /d/* SURFACES.
 *
 * It imports discovery-library.client.json and nothing else. The client dataset
 * is vendor-term free by construction (verified: 0 hits against all 23 terms in
 * vendor-term-guard.json) — that property is what makes the product-agnostic
 * wall hold, so this file must never import the consultant dataset, the parked
 * enablers, or the raw SAP/BPD sources. The dependency-boundary test asserts
 * this transitively from every (external) entry point.
 *
 * Data is frozen and hash-pinned (71d5a13aa7ca59de). See BUILD-LOG.md.
 */

import raw from "@/data/discovery/discovery-library.client.json";
import {
  ClientLibrarySchema,
  type ClientLibrary,
  type ClientProcess,
  type ClientValueStream,
  type FlowStep,
} from "./schema";

/** The brief's lane for steps the dataset leaves unattributed (1400 of 3035). */
export const SYSTEM_LANE = "System / Automatic";

let cached: ClientLibrary | null = null;

/**
 * Parse + validate the client dataset once per process. Throws on drift — a
 * malformed dataset should fail at boot, not render wrong.
 */
export function loadClientLibrary(): ClientLibrary {
  if (cached) return cached;
  cached = ClientLibrarySchema.parse(raw);
  return cached;
}

/** Every process, flattened across value streams and workflows. */
export function allClientProcesses(): ClientProcess[] {
  const out: ClientProcess[] = [];
  for (const vs of loadClientLibrary().value_streams) {
    for (const wf of vs.workflows) out.push(...wf.processes);
  }
  return out;
}

export function clientValueStreams(): ClientValueStream[] {
  return loadClientLibrary().value_streams;
}

export function findClientProcess(id: string): ClientProcess | null {
  return allClientProcesses().find((p) => p.id === id) ?? null;
}

export function findClientValueStream(id: string): ClientValueStream | null {
  return clientValueStreams().find((vs) => vs.id === id) ?? null;
}

/**
 * The lane a flow step belongs to. The dataset leaves `role` empty on 46% of
 * steps; the brief (which wins over the .dc, whose `{{ lane.role }}` has no
 * fallback) puts those in a "System / Automatic" lane. Never render step.role
 * directly — an empty lane header is the exact honesty failure the brief's
 * fallback rules exist to prevent.
 */
export function laneForRole(role: string): string {
  const trimmed = role.trim();
  return trimmed.length > 0 ? trimmed : SYSTEM_LANE;
}

/** Ordered, de-duplicated lanes for a process's flow — the swimlane rail. */
export function lanesForFlow(flow: readonly FlowStep[]): string[] {
  const seen = new Set<string>();
  const lanes: string[] = [];
  for (const step of flow) {
    const lane = laneForRole(step.role);
    if (!seen.has(lane)) {
      seen.add(lane);
      lanes.push(lane);
    }
  }
  return lanes;
}

/**
 * True when a process has no catalogued flow (16 of 742). The brief: show a
 * "no step flow catalogued" fallback — never a fabricated flow.
 */
export function hasFlow(p: ClientProcess): boolean {
  return Array.isArray(p.flow) && p.flow.length > 0;
}
