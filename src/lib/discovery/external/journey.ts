/**
 * ABeam Workbench — Neutral Process Discovery guest view models.
 *
 * The serializer boundary for /d/* pages, mirroring
 * src/lib/affirm/external/journey.ts. Pages call these and pass the RESULT to
 * components — a Prisma row never reaches a component, and neither does a raw
 * dataset record: everything goes through the PR-1 allowlist mappers.
 *
 * Content comes from the CLIENT dataset only (via client-library). The
 * consultant dataset is unreachable from here, and the dependency-boundary test
 * proves it transitively from every (external) entry point.
 */

import { prisma } from "@/lib/db/prisma";
import {
  clientValueStreams,
  coverageCounts,
  type CoverageCounts,
} from "@/lib/discovery/client-library";
import {
  dominantFit,
  emptyFitMix,
  fitMixDecided,
  isFitStatus,
  type FitMix,
  type FitState,
} from "@/lib/discovery/fit";

// ─── Output shapes ───────────────────────────────────────────────────────────

export interface DiscoveryGuestIdentity {
  /** The engagement's client label — never a fixture. */
  client: string;
  displayName: string;
  roleLabel: string | null;
}

export interface DiscoveryWorkflowCell {
  name: string;
  processCount: number;
  dominant: FitState;
  mix: FitMix;
}

export interface DiscoveryStreamSummary {
  id: string;
  name: string;
  domain: string;
  alias: string;
  processCount: number;
  workflowCount: number;
  decided: number;
  mix: FitMix;
  workflows: DiscoveryWorkflowCell[];
}

export interface DiscoveryHomeView {
  identity: DiscoveryGuestIdentity;
  sealed: boolean;
  coverage: CoverageCounts;
  streams: DiscoveryStreamSummary[];
  totals: FitMix;
  /** Every stream reviewed — drives the brief's teal all-reviewed banner. */
  allReviewed: boolean;
  /** Nothing decided yet — drives the fresh 0% state. */
  fresh: boolean;
}

// ─── Decisions ───────────────────────────────────────────────────────────────

/**
 * All decisions for an engagement, keyed by processId. Read-only in PR-2a; the
 * selector that writes them lands in PR-2b.
 */
export async function decisionsForEngagement(
  engagementId: string,
): Promise<Map<string, FitState>> {
  const rows = await prisma.discoveryDecision.findMany({
    where: { engagementId },
    select: { processId: true, status: true },
  });
  const out = new Map<string, FitState>();
  for (const r of rows) {
    // A row whose status is not a known fit state is ignored rather than
    // trusted — the column is a String, so the DB cannot enforce the union.
    if (isFitStatus(r.status)) out.set(r.processId, r.status);
  }
  return out;
}

// ─── View model ──────────────────────────────────────────────────────────────

/**
 * Build V1. `valueStreamIds` scopes the reviewer's persona: empty means all 10
 * streams (the default), matching the Affirm grant convention.
 */
export async function getDiscoveryHome(args: {
  engagementId: string;
  client: string;
  displayName: string;
  roleLabel: string | null;
  valueStreamIds: string[];
  sealed: boolean;
}): Promise<DiscoveryHomeView> {
  const decisions = await decisionsForEngagement(args.engagementId);

  const scoped =
    args.valueStreamIds.length > 0
      ? clientValueStreams().filter((vs) => args.valueStreamIds.includes(vs.id))
      : clientValueStreams();

  const totals = emptyFitMix();
  const streams: DiscoveryStreamSummary[] = scoped.map((vs) => {
    const streamMix = emptyFitMix();
    const workflows: DiscoveryWorkflowCell[] = vs.workflows.map((wf) => {
      const mix = emptyFitMix();
      for (const p of wf.processes) {
        const state = decisions.get(p.id) ?? "open";
        mix[state] += 1;
        streamMix[state] += 1;
        totals[state] += 1;
      }
      return {
        name: wf.name,
        processCount: wf.processes.length,
        dominant: dominantFit(mix),
        mix,
      };
    });

    return {
      id: vs.id,
      name: vs.name,
      domain: vs.domain,
      alias: vs.alias,
      // Derived from the actual processes, not the declared process_count /
      // workflow_count fields. They agree today (asserted in the unit test), but
      // D6 is the standing lesson: a declared count that disagrees with the
      // content is exactly how 726 nearly reached a client. Compute, never trust.
      processCount: workflows.reduce((n, wf) => n + wf.processCount, 0),
      workflowCount: workflows.length,
      decided: fitMixDecided(streamMix),
      mix: streamMix,
      workflows,
    };
  });

  const decidedTotal = fitMixDecided(totals);

  return {
    identity: {
      client: args.client,
      displayName: args.displayName,
      roleLabel: args.roleLabel,
    },
    sealed: args.sealed,
    // Coverage is computed from the data — never meta, never MANIFEST, never
    // hardcoded. MANIFEST is an integrity anchor, not a display source.
    coverage: coverageCounts(),
    streams,
    totals,
    allReviewed: streams.length > 0 && streams.every((s) => s.decided === s.processCount),
    fresh: decidedTotal === 0,
  };
}
