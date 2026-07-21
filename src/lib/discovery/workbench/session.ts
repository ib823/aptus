/**
 * ABeam Workbench — C7/C8 session view models (CONSULTANT-SIDE).
 *
 * ⚠ This module reads DiscoveryNote. It is the notes' ONLY reader, and it lives
 * under lib/discovery/workbench/ — which the wall test asserts is unreachable
 * from every (external) entry point, transitively.
 *
 * The privacy contract asserted since PR-3 finally has its consumer here. Note
 * the shape of it: notes reach a consultant view model, and there is deliberately
 * no function in this file that a /d page could call to get them, because /d
 * cannot import this file at all. The wall is the enforcement; these types just
 * make the intent legible.
 */

import { prisma } from "@/lib/db/prisma";
import { clientValueStreams } from "@/lib/discovery/client-library";
import {
  dominantFit,
  emptyFitMix,
  fitMixDecided,
  isFitStatus,
  type FitMix,
  type FitState,
} from "@/lib/discovery/fit";
import { effectiveStreamIds } from "@/lib/discovery/external/scope";

export interface ReviewerRow {
  id: string;
  email: string;
  displayName: string;
  roleLabel: string | null;
  /** Derived from the grant's own lifecycle — never a stored status string. */
  status: "invited" | "acknowledged" | "verified" | "revoked" | "superseded";
  lastAccessAt: Date | null;
  streamIds: string[];
}

export interface SessionSummary {
  id: string;
  client: string;
  state: string;
  scopedStreamIds: string[];
  live: boolean;
  drivenProcessId: string | null;
  reviewers: ReviewerRow[];
  decidedCount: number;
  processCount: number;
}

/**
 * Reviewer status, derived. The .dc hardcodes "Verified"/"Invited"/"In progress"
 * onto three fabricated people with working-looking emails; these come from the
 * grant's real lifecycle.
 */
function reviewerStatus(g: {
  revokedAt: Date | null;
  supersededByGrantId: string | null;
  ackAt: Date | null;
  otpVerifiedUaHashes: string[];
}): ReviewerRow["status"] {
  if (g.revokedAt) return "revoked";
  if (g.supersededByGrantId) return "superseded";
  if (g.otpVerifiedUaHashes.length > 0) return "verified";
  if (g.ackAt) return "acknowledged";
  return "invited";
}

export async function getSession(engagementId: string): Promise<SessionSummary | null> {
  // Guard the lookup: a blank or absent id is a miss, not a query. findUnique
  // already returns null for any non-matching string (so it never throws on a
  // malformed id), but treating "no id" as notFound() up front keeps a bad or
  // deleted session link a clean 404 on both hard nav and RSC prefetch — never
  // a 500/503 — and avoids a pointless round-trip.
  if (typeof engagementId !== "string" || engagementId.trim() === "") return null;

  const e = await prisma.discoveryEngagement.findUnique({
    where: { id: engagementId },
    select: {
      id: true,
      client: true,
      state: true,
      valueStreamIds: true,
      liveAt: true,
      drivenProcessId: true,
      grants: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          email: true,
          displayName: true,
          roleLabel: true,
          revokedAt: true,
          supersededByGrantId: true,
          ackAt: true,
          otpVerifiedUaHashes: true,
          lastAccessAt: true,
          valueStreamIds: true,
        },
      },
      _count: { select: { decisions: true } },
    },
  });
  if (!e) return null;

  const scope = effectiveStreamIds({ engagementStreamIds: e.valueStreamIds, grantStreamIds: [] });
  const processCount = clientValueStreams()
    .filter((vs) => scope === null || scope.includes(vs.id))
    .reduce((n, vs) => n + vs.workflows.reduce((m, wf) => m + wf.processes.length, 0), 0);

  return {
    id: e.id,
    client: e.client,
    state: e.state,
    scopedStreamIds: e.valueStreamIds,
    live: e.liveAt != null,
    drivenProcessId: e.drivenProcessId,
    reviewers: e.grants.map((g) => ({
      id: g.id,
      email: g.email,
      displayName: g.displayName,
      roleLabel: g.roleLabel,
      status: reviewerStatus(g),
      lastAccessAt: g.lastAccessAt,
      streamIds: g.valueStreamIds,
    })),
    decidedCount: e._count.decisions,
    processCount,
  };
}

// ─── C8 · the facilitation console ───────────────────────────────────────────

export interface ConsoleNote {
  id: string;
  processId: string | null;
  body: string;
  createdAt: Date;
}

export interface ParkedProcess {
  id: string;
  name: string;
}

export interface ConsoleView {
  session: SessionSummary;
  /** The tally the room watches — real decisions, never seeded. */
  mix: FitMix;
  decided: number;
  streamMixes: Array<{ id: string; name: string; mix: FitMix; dominant: FitState }>;
  parked: ParkedProcess[];
  /** ⚠ CONSULTANT-ONLY. Never serialized to a client payload. */
  notes: ConsoleNote[];
  /** Reading order across the session's scope — drives prev/next and jump-to. */
  order: Array<{ id: string; name: string; streamName: string }>;
}

export async function getConsole(engagementId: string): Promise<ConsoleView | null> {
  const session = await getSession(engagementId);
  if (!session) return null;

  const scope = effectiveStreamIds({
    engagementStreamIds: session.scopedStreamIds,
    grantStreamIds: [],
  });
  const streams = clientValueStreams().filter((vs) => scope === null || scope.includes(vs.id));

  const [decisions, notes] = await Promise.all([
    prisma.discoveryDecision.findMany({
      where: { engagementId },
      select: { processId: true, status: true },
    }),
    prisma.discoveryNote.findMany({
      where: { engagementId },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, processId: true, body: true, createdAt: true },
    }),
  ]);

  const byProcess = new Map<string, FitState>();
  for (const d of decisions) if (isFitStatus(d.status)) byProcess.set(d.processId, d.status);

  const mix = emptyFitMix();
  const streamMixes: ConsoleView["streamMixes"] = [];
  const order: ConsoleView["order"] = [];
  const parked: ParkedProcess[] = [];

  for (const vs of streams) {
    const sm = emptyFitMix();
    for (const wf of vs.workflows) {
      for (const p of wf.processes) {
        const state = byProcess.get(p.id) ?? "open";
        mix[state] += 1;
        sm[state] += 1;
        order.push({ id: p.id, name: p.name, streamName: vs.name });
        // Park is not a fifth state (§9) — it sets `discuss`. The park LIST is
        // therefore just the discuss decisions, which is why parking in Present
        // and choosing Discuss on /d land in the same place.
        if (state === "discuss") parked.push({ id: p.id, name: p.name });
      }
    }
    streamMixes.push({ id: vs.id, name: vs.name, mix: sm, dominant: dominantFit(sm) });
  }

  return {
    session,
    mix,
    decided: fitMixDecided(mix),
    streamMixes,
    parked,
    notes,
    order,
  };
}
