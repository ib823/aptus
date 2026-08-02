/**
 * GET /api/console/topology — what is wired to what, for one tenant.
 *
 * WHY /api/console AND NOT /api/ops. This is the first endpoint that serves all
 * three workspaces. The graph is one graph; the lens over it differs. Filing it
 * under one workspace's namespace would make the other two look like guests in
 * somebody else's route.
 *
 * EACH LENS IS GATED BY ITS OWN WORKSPACE PREDICATE. The lens arrives as a query
 * parameter, so it MUST NOT be treated as a display hint: a `support` user is
 * entitled to the Operations Center and not to Control Tower, and must not be
 * able to reach the governance lens by editing a URL. The guard is selected from
 * the lens before anything is read.
 *
 * THE MOST DISCLOSURE-DENSE READ IN THE PRODUCT. It assembles five tables at
 * once — solutions, interfaces, grants, credentials, connections — which is
 * precisely the shape that makes an unscoped query catastrophic rather than
 * merely wrong. Every query below goes through `opsWhere`, which cannot be
 * called without an actor and which refuses a non-admin with no tenant before
 * this route runs.
 *
 * WHAT IT REFUSES TO COMPUTE. No health score, no uptime, no totals worth
 * copying. The Operations home already argues why: a second copy of a number is
 * a thing that disagrees with the screen that owns it. This returns structure,
 * five honest states, and the provenance for each.
 */

import type { NextRequest } from "next/server";

import { prisma } from "@/lib/db/prisma";
import {
  opsWhere,
  opsWindowHours,
  requireControlTower,
  requireOperations,
  requireStudio,
  type OpsActor,
} from "@/lib/ops/guard";
import { studioError, studioOk } from "@/lib/studio/api";
import { missingOwners } from "@/lib/studio/solutions";
import {
  collapseColumn,
  deriveConnection,
  deriveCredential,
  deriveGrant,
  routeFor,
  type Lens,
  type TopologyEdge,
  type TopologyNode,
} from "@/lib/ops/topology";

export const dynamic = "force-dynamic";

const LENS_GUARD: Record<Lens, () => Promise<Awaited<ReturnType<typeof requireStudio>>>> = {
  "developer-studio": requireStudio,
  "operations-center": requireOperations,
  "control-tower": requireControlTower,
};

function parseLens(raw: string | null): Lens | null {
  return raw === "developer-studio" || raw === "operations-center" || raw === "control-tower"
    ? raw
    : null;
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);

  // An unrecognised lens is refused rather than defaulted. Defaulting would
  // pick a workspace for the caller and then gate on that choice.
  const lens = parseLens(url.searchParams.get("lens"));
  if (!lens) {
    return studioError("VALIDATION_ERROR", "lens must be developer-studio, operations-center or control-tower.");
  }

  const guard = await LENS_GUARD[lens]();
  if (!guard.ok) return guard.response;
  const actor: OpsActor = guard.actor;

  const hours = opsWindowHours(url.searchParams.get("hours"));
  const since = new Date(Date.now() - hours * 3_600_000);
  const now = new Date();

  const [solutions, interfaces, grants, credentials, connections, audit] = await Promise.all([
    prisma.solution.findMany({
      where: opsWhere(actor, {}),
      select: {
        id: true,
        name: true,
        status: true,
        technicalOwnerId: true,
        businessOwnerId: true,
        supportOwnerId: true,
      },
    }),
    prisma.interface.findMany({
      where: opsWhere(actor, {}),
      select: {
        id: true,
        solutionId: true,
        name: true,
        externalId: true,
        operation: true,
        entitySet: true,
        mode: true,
      },
    }),
    prisma.apiAccessGrant.findMany({
      where: opsWhere(actor, {}),
      select: {
        id: true,
        solutionId: true,
        externalId: true,
        operation: true,
        environment: true,
        decision: true,
        expiresAt: true,
        revokedAt: true,
        revokedReason: true,
      },
    }),
    prisma.solutionClient.findMany({
      where: opsWhere(actor, {}),
      select: {
        id: true,
        solutionId: true,
        label: true,
        environment: true,
        isActive: true,
        expiresAt: true,
        revokedAt: true,
        lastUsedAt: true,
      },
    }),
    prisma.sapConnection.findMany({
      where: opsWhere(actor, {}),
      select: {
        id: true,
        label: true,
        product: true,
        environment: true,
        isActive: true,
        lastValidatedAt: true,
        lastValidationStatus: true,
      },
    }),
    /*
     * The audit feed, aggregated in the database rather than pulled row by row.
     *
     * THIS IS A FLOOR, NOT A CENSUS, and every count derived from it inherits
     * that. Calls throttled at the edge persist no record at all; a call that
     * times out before its audit write leaves none either; and the write itself
     * can fail, which means the feed thins exactly when the system is
     * struggling. Nothing below may present these numbers as totals.
     */
    prisma.northboundAuditEvent.groupBy({
      by: ["solutionId", "interfaceId", "connectionId", "externalId", "operation", "environment"],
      where: opsWhere(actor, { at: { gte: since } }),
      _count: { _all: true },
    }),
  ]);

  const nodes: TopologyNode[] = [];
  const edges: TopologyEdge[] = [];

  /*
   * Calls per grant are INFERRED, not joined.
   *
   * `NorthboundAuditEvent` carries no grantId — a call records the solution,
   * the externalId, the operation and the environment, and the grant that
   * authorised it is whichever row matches that tuple. If two grants overlap on
   * it, this attribution is ambiguous, and the provenance on every grant node
   * says so rather than presenting the count as certain.
   */
  const grantKey = (s: string, e: string, o: string, env: string) =>
    `${s}|${e}|${o}|${env}`.toUpperCase();
  const callsByGrant = new Map<string, number>();
  const callsByInterface = new Map<string, number>();
  const callsByConnection = new Map<string, number>();
  for (const row of audit) {
    const n = row._count._all;
    callsByGrant.set(
      grantKey(row.solutionId, row.externalId, row.operation, row.environment),
      (callsByGrant.get(grantKey(row.solutionId, row.externalId, row.operation, row.environment)) ?? 0) + n,
    );
    if (row.interfaceId) {
      callsByInterface.set(row.interfaceId, (callsByInterface.get(row.interfaceId) ?? 0) + n);
    }
    if (row.connectionId) {
      callsByConnection.set(row.connectionId, (callsByConnection.get(row.connectionId) ?? 0) + n);
    }
  }

  const FEED_CAVEAT =
    "The audit feed is a floor, not a census: calls refused at the throttle leave no record, and an audit write can itself fail.";

  /* Column 0 — the caller. One node; the platform cannot enumerate callers. */
  nodes.push({
    id: "caller",
    kind: "caller",
    column: 0,
    label: "Client applications",
    state: "unobservable",
    ended: null,
    quiet: false,
    badge: null,
    href: routeFor(lens, "caller", "/operations/traffic"),
    provenance: {
      derived: "Nothing. A caller is identified only by the credential it presents.",
      observedAt: null,
      cannotTell:
        "How many applications exist, or who runs them. The platform sees credentials, not deployments.",
      noRule:
        "No incident rule watches callers. Rate limiting is reportable only against a credential we can attribute; the edge buckets are keyed by an address that cannot be enumerated.",
    },
  });

  /* Column 1 — credentials. */
  for (const c of credentials) {
    const d = deriveCredential(c, now);
    nodes.push({
      id: `cred:${c.id}`,
      kind: "credential",
      column: 1,
      label: c.label,
      state: d.state,
      ended: d.ended,
      quiet: d.quiet,
      badge: d.badge ?? c.environment,
      href: routeFor(lens, "credential", "/control-tower/tokens"),
      provenance: {
        derived: `SolutionClient in ${c.environment}; last observed use ${c.lastUsedAt ? c.lastUsedAt.toISOString() : "never recorded"}.`,
        observedAt: c.lastUsedAt?.toISOString() ?? null,
        cannotTell:
          "Whether this credential is dormant. Last-observed use is written fire-and-forget and often does not land, so a blank is an absent observation rather than an absent call.",
      },
      ...(d.incidentId ? { incidentId: d.incidentId } : {}),
    });
    edges.push({ from: "caller", to: `cred:${c.id}`, calls: 0, inert: d.ended != null });
  }

  /* Column 2 — grants. */
  for (const g of grants) {
    const recordedCalls =
      callsByGrant.get(grantKey(g.solutionId, g.externalId, g.operation, g.environment)) ?? 0;
    const d = deriveGrant({ ...g, recordedCalls }, now);
    nodes.push({
      id: `grant:${g.id}`,
      kind: "grant",
      column: 2,
      label: `${g.externalId} · ${g.operation}`,
      state: d.state,
      ended: d.ended,
      quiet: d.quiet,
      badge: d.badge ?? g.decision,
      href: routeFor(lens, "grant", "/control-tower/grants"),
      provenance: {
        derived: `decision ${g.decision} in ${g.environment}; ${recordedCalls} call(s) recorded in the window, matched on solution + service + operation + environment.`,
        observedAt: null,
        cannotTell: `Which grant authorised a given call, when two grants overlap on that tuple — there is no grant id on an audit row. ${FEED_CAVEAT}`,
        ...(d.quiet
          ? {
              noRule:
                "No incident rule watches this. The decision label and the environment contradict each other, so the permission is the intersection, which is empty — the broker refusing it is the control working, not a fault.",
            }
          : {}),
      },
      ...(d.incidentId ? { incidentId: d.incidentId } : {}),
    });
    for (const c of credentials.filter((x) => x.solutionId === g.solutionId)) {
      edges.push({
        from: `cred:${c.id}`,
        to: `grant:${g.id}`,
        calls: recordedCalls,
        inert: d.ended != null || c.revokedAt != null,
      });
    }
  }

  /* Column 3 — interfaces. */
  for (const i of interfaces) {
    const calls = callsByInterface.get(i.id) ?? 0;
    const noEntitySet = !i.entitySet;
    nodes.push({
      id: `iface:${i.id}`,
      kind: "interface",
      column: 3,
      label: i.name,
      state: noEntitySet ? "defect" : calls > 0 ? "observed-good" : "never-observed",
      ended: null,
      quiet: false,
      badge: noEntitySet ? "NO ENTITY SET" : i.operation,
      href: routeFor(lens, "interface", "/studio/interfaces"),
      provenance: {
        derived: noEntitySet
          ? "No entity set is declared, so the broker refuses every read with a 400."
          : `entity set ${i.entitySet}; ${calls} call(s) recorded in the window.`,
        observedAt: null,
        cannotTell: `Whether the capability is permitted — that is decided by a grant and enforced per call. ${FEED_CAVEAT}`,
      },
    });
    for (const g of grants.filter(
      (x) => x.solutionId === i.solutionId && x.externalId === i.externalId,
    )) {
      edges.push({ from: `grant:${g.id}`, to: `iface:${i.id}`, calls, inert: g.revokedAt != null });
    }
  }

  /* Column 4 — connections. */
  for (const c of connections) {
    const d = deriveConnection(c);
    const calls = callsByConnection.get(c.id) ?? 0;
    nodes.push({
      id: `conn:${c.id}`,
      kind: "connection",
      column: 4,
      label: c.label,
      state: d.state,
      ended: d.ended,
      quiet: d.quiet,
      badge: d.badge ?? c.environment ?? null,
      href: routeFor(lens, "connection", "/operations/connections"),
      provenance: {
        derived: c.lastValidatedAt
          ? `last successful probe ${c.lastValidatedAt.toISOString()}, status ${c.lastValidationStatus ?? "unknown"}.`
          : "No probe has ever been recorded against this connection.",
        observedAt: c.lastValidatedAt?.toISOString() ?? null,
        cannotTell:
          "Whether it is answering right now. The timestamp moves only on a real success, so a failure beside an old success date is the truth, not an inconsistency.",
      },
      ...(d.incidentId ? { incidentId: d.incidentId } : {}),
    });
    for (const i of interfaces) {
      if (calls > 0) edges.push({ from: `iface:${i.id}`, to: `conn:${c.id}`, calls, inert: false });
    }
    edges.push({ from: `conn:${c.id}`, to: "tenant", calls, inert: !c.isActive });
  }

  /* Column 5 — the customer's SAP. */
  nodes.push({
    id: "tenant",
    kind: "tenant",
    column: 5,
    label: "Client SAP tenant",
    state: "unobservable",
    ended: null,
    quiet: false,
    badge: null,
    href: routeFor(lens, "tenant", "/operations/connections"),
    provenance: {
      derived: "Nothing. The platform observes its own calls, not the system answering them.",
      observedAt: null,
      cannotTell:
        "Anything about the SAP system itself — its load, its other clients, or whether a read reflected committed data.",
    },
  });

  // Collapse per column, reporting what was folded rather than truncating.
  const byColumn = new Map<number, TopologyNode[]>();
  for (const n of nodes) byColumn.set(n.column, [...(byColumn.get(n.column) ?? []), n]);
  const kept: TopologyNode[] = [];
  const collapsed: { column: number; count: number }[] = [];
  for (const [column, list] of [...byColumn.entries()].sort((a, b) => a[0] - b[0])) {
    const r = collapseColumn(list);
    kept.push(...r.kept);
    if (r.collapsedCount > 0) collapsed.push({ column, count: r.collapsedCount });
  }
  const keptIds = new Set(kept.map((n) => n.id));

  return studioOk({
    lens,
    windowHours: hours,
    nodes: kept,
    edges: edges.filter((e) => keptIds.has(e.from) && keptIds.has(e.to)),
    collapsed,
    unownedSolutions: solutions.filter((s) => missingOwners(s).length > 0).length,
    provenance: {
      feedIsAFloor: FEED_CAVEAT,
      grantAttribution:
        "Calls are attributed to a grant by matching solution, service, operation and environment — there is no grant id on an audit row.",
      noSummary:
        "This view carries no totals worth copying. Every number with an authoritative screen stays on that screen.",
    },
  });
}
