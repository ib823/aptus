/**
 * ABeam Workbench — the two-lane export (brief §9.3).
 *
 * "Two-lane export in C9: 'Client pack (neutral)' and 'Internal pack (with
 * product map)' — never one toggle that could ship the wrong thing; distinct
 * buttons, distinct confirm copy."
 *
 * TWO SERIALIZERS, NOT ONE WITH A FLAG. That is the entire design. A single
 * builder with `includeProductMap: boolean` would put the client's safety one
 * inverted boolean away from a vendor name in a client's inbox. Here, the client
 * pack has no code path to the product map: `buildClientPack` does not import it,
 * cannot read it, and its return type has nowhere to put it.
 *
 * The client pack is built from the PR-1 allowlist mappers, so it carries what
 * /d already renders and nothing else. Everything consultant-only — the product
 * map, the capture register, notes, park detail — exists only in
 * `buildInternalPack`, behind the fence.
 */

import { prisma } from "@/lib/db/prisma";
import { clientValueStreams, coverageCounts } from "@/lib/discovery/client-library";
import { toDiscoveryProcess } from "@/lib/discovery/serializers";
import { PROVENANCE_CLIENT } from "@/lib/discovery/copy";
import {
  emptyFitMix,
  fitMixDecided,
  isDecisionComplete,
  isFitStatus,
  type FitMix,
  type FitState,
} from "@/lib/discovery/fit";
import { effectiveStreamIds } from "@/lib/discovery/external/scope";

// ─── The client pack (neutral) ───────────────────────────────────────────────

export interface ClientPackProcess {
  id: string;
  name: string;
  description: string;
  completeness: string | null;
  hasFlow: boolean;
  steps: number;
  decision: FitState;
  /** The client's own words, back to the client — theirs to see. */
  reason: string | null;
  complete: boolean;
}

export interface ClientPackStream {
  id: string;
  name: string;
  mix: FitMix;
  decided: number;
  processCount: number;
  processes: ClientPackProcess[];
}

export interface ClientPack {
  lane: "client";
  client: string;
  generated: string;
  draft: boolean;
  scoped: boolean;
  provenance: string;
  coverage: { processes: number; withFlow: number; industrySpecific: number };
  totals: FitMix;
  decided: number;
  processCount: number;
  incomplete: number;
  streams: ClientPackStream[];
}

/**
 * Build the client pack. Product-neutral by construction: this function has no
 * reference to the product map, the capture register, or notes — not a filter
 * against them, no reference at all.
 */
export async function buildClientPack(engagementId: string): Promise<ClientPack | null> {
  const e = await prisma.discoveryEngagement.findUnique({
    where: { id: engagementId },
    select: { id: true, client: true, state: true, valueStreamIds: true },
  });
  if (!e) return null;

  const decisions = await prisma.discoveryDecision.findMany({
    where: { engagementId },
    select: { processId: true, status: true, reason: true },
  });
  const byProcess = new Map(decisions.map((d) => [d.processId, d]));

  const scope = effectiveStreamIds({ engagementStreamIds: e.valueStreamIds, grantStreamIds: [] });
  const streams: ClientPackStream[] = [];
  const totals = emptyFitMix();
  let incomplete = 0;
  let processCount = 0;

  for (const vs of clientValueStreams()) {
    if (scope !== null && !scope.includes(vs.id)) continue;
    const mix = emptyFitMix();
    const processes: ClientPackProcess[] = [];

    for (const wf of vs.workflows) {
      for (const p of wf.processes) {
        // Through the PR-1 allowlist — a raw dataset record never reaches a pack.
        const dp = toDiscoveryProcess(p);
        const d = byProcess.get(p.id);
        const state: FitState = d && isFitStatus(d.status) ? d.status : "open";
        mix[state] += 1;
        totals[state] += 1;
        processCount += 1;
        const complete = d ? isDecisionComplete(state as never, d.reason) : true;
        if (d && !complete) incomplete += 1;
        if (!d) continue; // the register lists decided processes (D13)
        processes.push({
          id: dp.id,
          name: dp.name,
          description: dp.description,
          completeness: dp.completeness,
          hasFlow: dp.hasFlow,
          steps: dp.flow.length,
          decision: state,
          reason: d.reason,
          complete,
        });
      }
    }
    streams.push({
      id: vs.id,
      name: vs.name,
      mix,
      decided: fitMixDecided(mix),
      processCount: vs.workflows.reduce((n, wf) => n + wf.processes.length, 0),
      processes,
    });
  }

  const decided = fitMixDecided(totals);
  const cov = coverageCounts();

  return {
    lane: "client",
    client: e.client,
    generated: new Date().toISOString().slice(0, 10),
    // Honest by default: a pack of a half-finished review says so (invariant 4).
    draft: e.state === "issued" || decided < processCount,
    scoped: scope !== null,
    provenance: PROVENANCE_CLIENT,
    coverage: {
      processes: cov.processes,
      withFlow: cov.withFlow,
      industrySpecific: cov.industrySpecific,
    },
    totals,
    decided,
    processCount,
    incomplete,
    streams,
  };
}

// ─── The internal pack (with the product map) ────────────────────────────────

export interface InternalPackMapRow {
  scopeId: string;
  sap: string | null;
  oracle: string | null;
  netsuite: string | null;
  other: string | null;
}

export interface InternalPackCapture {
  type: string;
  rawText: string;
  clientRef: string | null;
  linkedProcessId: string | null;
  status: string;
  promotedAs: string | null;
}

export interface InternalPack {
  lane: "internal";
  /** Everything the client pack has… */
  client: ClientPack;
  /** …plus the fence. */
  productMap: InternalPackMapRow[];
  captureRegister: InternalPackCapture[];
  notes: Array<{ processId: string | null; body: string }>;
  parked: string[];
  guard: string;
}

const INTERNAL_GUARD =
  "Consultant only — never send this file to the client. It contains the product-mapping table and the internal capture register.";

/**
 * Build the internal pack. It COMPOSES the client pack and adds the fenced
 * material — it does not rebuild it. So the two lanes can never drift about what
 * a decision says, while the fenced material exists only on this side.
 */
export async function buildInternalPack(engagementId: string): Promise<InternalPack | null> {
  const client = await buildClientPack(engagementId);
  if (!client) return null;

  const [maps, captures, notes, parked] = await Promise.all([
    prisma.discoveryProductMap.findMany({
      select: { processId: true, oracleRef: true, netsuiteRef: true, otherRef: true },
    }),
    prisma.discoveryCapture.findMany({
      where: { engagementId },
      select: {
        type: true,
        rawText: true,
        clientRef: true,
        linkedProcessId: true,
        status: true,
        promotedAs: true,
      },
    }),
    prisma.discoveryNote.findMany({
      where: { engagementId },
      select: { processId: true, body: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.discoveryDecision.findMany({
      where: { engagementId, status: "discuss" },
      select: { processId: true },
    }),
  ]);

  const { libraryRows } = await import("./library");
  const originById = new Map(libraryRows().map((r) => [r.scope_id, r.origin]));
  const stored = new Map(maps.map((m) => [m.processId, m]));

  const productMap: InternalPackMapRow[] = [...originById.keys()].map((scopeId) => {
    const s = stored.get(scopeId);
    return {
      scopeId,
      // Derived, exactly as C6 does: base-catalogue processes reference
      // themselves; overlay processes have no base reference.
      sap: originById.get(scopeId) === "sap-base" ? scopeId : null,
      oracle: s?.oracleRef ?? null,
      netsuite: s?.netsuiteRef ?? null,
      other: s?.otherRef ?? null,
    };
  });

  return {
    lane: "internal",
    client,
    productMap,
    captureRegister: captures,
    notes,
    parked: parked.map((p) => p.processId),
    guard: INTERNAL_GUARD,
  };
}
