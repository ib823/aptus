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
  hasFlow,
  type CoverageCounts,
} from "@/lib/discovery/client-library";
import {
  dominantFit,
  emptyFitMix,
  fitMixDecided,
  fitMixTotal,
  isDecisionComplete,
  isFitStatus,
  type FitMix,
  type FitState,
  type FitStatus,
} from "@/lib/discovery/fit";
import { toDiscoveryProcess, type DiscoveryProcess } from "@/lib/discovery/serializers";
import { isStreamInScope } from "./scope";
import type { ClientProcess, Completeness } from "@/lib/discovery/schema";

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
  /** The session is scoped to a subset of streams — drives V1's honest note. */
  scoped: boolean;
}

export interface DiscoveryDecisionView {
  status: FitStatus;
  reason: string | null;
  complete: boolean;
}

export interface DiscoveryProcessCard {
  id: string;
  name: string;
  description: string;
  completeness: Completeness | null;
  hasFlow: boolean;
  mainSteps: number;
  subSteps: number;
  state: FitState;
}

export interface DiscoveryWorkflowSection {
  name: string;
  processCount: number;
  processes: DiscoveryProcessCard[];
}

export interface DiscoveryStreamView {
  identity: DiscoveryGuestIdentity;
  sealed: boolean;
  id: string;
  name: string;
  domain: string;
  mix: FitMix;
  decided: number;
  processCount: number;
  complete: boolean;
  workflows: DiscoveryWorkflowSection[];
}

export interface DiscoveryProcessView {
  identity: DiscoveryGuestIdentity;
  sealed: boolean;
  process: DiscoveryProcess;
  streamId: string;
  streamName: string;
  workflowName: string;
  decision: DiscoveryDecisionView | null;
  prevId: string | null;
  nextId: string | null;
}

export interface DiscoverySummaryBucketItem {
  id: string;
  name: string;
  reason: string | null;
}

export interface DiscoverySummaryView {
  identity: DiscoveryGuestIdentity;
  sealed: boolean;
  mix: FitMix;
  total: number;
  /** Differ decisions with no reason — brief §9's honest gap capture. */
  incomplete: number;
  buckets: {
    standard: DiscoverySummaryBucketItem[];
    discuss: DiscoverySummaryBucketItem[];
    differ: DiscoverySummaryBucketItem[];
  };
  streams: Array<{ id: string; name: string; mix: FitMix }>;
}

// ─── Decisions ───────────────────────────────────────────────────────────────

/**
 * All decisions for an engagement, keyed by processId.
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

/** Full decisions (status + reason) for an engagement, keyed by processId. */
export async function decisionDetailsForEngagement(
  engagementId: string,
): Promise<Map<string, DiscoveryDecisionView>> {
  const rows = await prisma.discoveryDecision.findMany({
    where: { engagementId },
    select: { processId: true, status: true, reason: true },
  });
  const out = new Map<string, DiscoveryDecisionView>();
  for (const r of rows) {
    if (!isFitStatus(r.status)) continue;
    out.set(r.processId, {
      status: r.status,
      reason: r.reason,
      complete: isDecisionComplete(r.status, r.reason),
    });
  }
  return out;
}

/**
 * Persist one decision. Upsert on the [engagementId, processId] unique key — the
 * reviewer edits in place rather than accumulating rows.
 *
 * `reason` is stored even when empty for a `differ`: brief §9 makes the reason a
 * COMPLETENESS rule, not a validation rule. Refusing the write would lose the
 * reviewer's selection; storing it incomplete and saying so on V4 is the honest
 * behaviour. Callers must have already refused a sealed engagement — this
 * function does not check, and the route is the authority.
 */
export async function saveDecision(args: {
  engagementId: string;
  grantId: string;
  processId: string;
  status: FitStatus;
  reason: string | null;
}): Promise<void> {
  // Only `differ` carries a reason. Clearing it on the other states stops a
  // stale reason resurfacing if the reviewer changes their mind twice.
  const reason = args.status === "differ" ? (args.reason?.trim() || null) : null;
  await prisma.discoveryDecision.upsert({
    where: {
      engagementId_processId: { engagementId: args.engagementId, processId: args.processId },
    },
    create: {
      engagementId: args.engagementId,
      grantId: args.grantId,
      processId: args.processId,
      status: args.status,
      reason,
    },
    update: { status: args.status, reason, grantId: args.grantId },
  });
}

// ─── View model ──────────────────────────────────────────────────────────────

/**
 * Build V1. `scope` is the EFFECTIVE scope (engagement ∩ grant) computed by
 * ./scope.ts; null means all 10 streams.
 */
export async function getDiscoveryHome(args: {
  engagementId: string;
  client: string;
  displayName: string;
  roleLabel: string | null;
  /** Effective scope (engagement ∩ grant); null = all streams. See ./scope.ts. */
  scope: string[] | null;
  sealed: boolean;
}): Promise<DiscoveryHomeView> {
  const decisions = await decisionsForEngagement(args.engagementId);

  const scoped = clientValueStreams().filter((vs) => isStreamInScope(vs.id, args.scope));

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
    scoped: args.scope !== null,
  };
}

// ─── V2 · stream index ───────────────────────────────────────────────────────

function countSteps(p: ClientProcess): { mainSteps: number; subSteps: number } {
  const flow = p.flow ?? [];
  return {
    mainSteps: flow.length,
    subSteps: flow.reduce((n, s) => n + (s.substeps?.length ?? 0), 0),
  };
}

export async function getDiscoveryStream(args: {
  engagementId: string;
  client: string;
  displayName: string;
  roleLabel: string | null;
  /** Effective scope (engagement ∩ grant); null = all streams. See ./scope.ts. */
  scope: string[] | null;
  sealed: boolean;
  streamId: string;
}): Promise<DiscoveryStreamView | null> {
  // Scope is enforced here, not in the page: a reviewer scoped to two streams
  // must not reach a third by editing the URL.
  if (!isStreamInScope(args.streamId, args.scope)) return null;

  const vs = clientValueStreams().find((s) => s.id === args.streamId);
  if (!vs) return null;

  const decisions = await decisionsForEngagement(args.engagementId);
  const mix = emptyFitMix();

  const workflows: DiscoveryWorkflowSection[] = vs.workflows.map((wf) => ({
    name: wf.name,
    processCount: wf.processes.length,
    processes: wf.processes.map((p) => {
      const state = decisions.get(p.id) ?? "open";
      mix[state] += 1;
      const { mainSteps, subSteps } = countSteps(p);
      return {
        id: p.id,
        name: p.name,
        description: p.description,
        completeness: p.completeness,
        hasFlow: hasFlow(p),
        mainSteps,
        subSteps,
        state,
      };
    }),
  }));

  const processCount = workflows.reduce((n, wf) => n + wf.processCount, 0);
  const decided = fitMixDecided(mix);

  return {
    identity: { client: args.client, displayName: args.displayName, roleLabel: args.roleLabel },
    sealed: args.sealed,
    id: vs.id,
    name: vs.name,
    domain: vs.domain,
    mix,
    decided,
    processCount,
    complete: processCount > 0 && decided === processCount,
    workflows,
  };
}

// ─── V3 · process detail ─────────────────────────────────────────────────────

/** Flattened reading order within a stream — drives prev/next. */
function streamProcessOrder(streamId: string): ClientProcess[] {
  const vs = clientValueStreams().find((s) => s.id === streamId);
  if (!vs) return [];
  return vs.workflows.flatMap((wf) => wf.processes);
}

function locateProcess(
  processId: string,
): { vsId: string; vsName: string; wfName: string; process: ClientProcess } | null {
  for (const vs of clientValueStreams()) {
    for (const wf of vs.workflows) {
      const p = wf.processes.find((x) => x.id === processId);
      if (p) return { vsId: vs.id, vsName: vs.name, wfName: wf.name, process: p };
    }
  }
  return null;
}

export async function getDiscoveryProcess(args: {
  engagementId: string;
  client: string;
  displayName: string;
  roleLabel: string | null;
  /** Effective scope (engagement ∩ grant); null = all streams. See ./scope.ts. */
  scope: string[] | null;
  sealed: boolean;
  processId: string;
}): Promise<DiscoveryProcessView | null> {
  const found = locateProcess(args.processId);
  if (!found) return null;
  if (!isStreamInScope(found.vsId, args.scope)) return null;

  const decisions = await decisionDetailsForEngagement(args.engagementId);
  const order = streamProcessOrder(found.vsId);
  const i = order.findIndex((p) => p.id === args.processId);

  return {
    identity: { client: args.client, displayName: args.displayName, roleLabel: args.roleLabel },
    sealed: args.sealed,
    // Through the PR-1 allowlist — a raw dataset record never reaches a component.
    process: toDiscoveryProcess(found.process),
    streamId: found.vsId,
    streamName: found.vsName,
    workflowName: found.wfName,
    decision: decisions.get(args.processId) ?? null,
    prevId: i > 0 ? (order[i - 1]?.id ?? null) : null,
    nextId: i >= 0 && i < order.length - 1 ? (order[i + 1]?.id ?? null) : null,
  };
}

// ─── V4 · summary ────────────────────────────────────────────────────────────

export async function getDiscoverySummary(args: {
  engagementId: string;
  client: string;
  displayName: string;
  roleLabel: string | null;
  /** Effective scope (engagement ∩ grant); null = all streams. See ./scope.ts. */
  scope: string[] | null;
  sealed: boolean;
}): Promise<DiscoverySummaryView> {
  const decisions = await decisionDetailsForEngagement(args.engagementId);

  const scoped = clientValueStreams().filter((vs) => isStreamInScope(vs.id, args.scope));

  const mix = emptyFitMix();
  let incomplete = 0;
  const buckets: DiscoverySummaryView["buckets"] = { standard: [], discuss: [], differ: [] };
  const streams: DiscoverySummaryView["streams"] = [];

  for (const vs of scoped) {
    const streamMix = emptyFitMix();
    for (const wf of vs.workflows) {
      for (const p of wf.processes) {
        const d = decisions.get(p.id);
        const state: FitState = d?.status ?? "open";
        mix[state] += 1;
        streamMix[state] += 1;
        if (!d) continue;
        if (!d.complete) incomplete += 1;
        const item: DiscoverySummaryBucketItem = { id: p.id, name: p.name, reason: d.reason };
        if (d.status === "standard") buckets.standard.push(item);
        else if (d.status === "discuss") buckets.discuss.push(item);
        else if (d.status === "differ") buckets.differ.push(item);
        // `na` is counted in the stat strip but has no bucket — brief §7 V4
        // lists three buckets: Standard / Discuss / We differ.
      }
    }
    streams.push({ id: vs.id, name: vs.name, mix: streamMix });
  }

  return {
    identity: { client: args.client, displayName: args.displayName, roleLabel: args.roleLabel },
    sealed: args.sealed,
    mix,
    total: fitMixTotal(mix),
    incomplete,
    buckets,
    streams,
  };
}
