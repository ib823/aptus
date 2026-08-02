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
  attributeCalls,
  collapseColumn,
  deriveSolution,
  grantConfersAccess,
  deriveConnection,
  deriveCredential,
  deriveGrant,
  grantKey,
  observeEdge,
  pairKey,
  routeFor,
  tallyOf,
  type Lens,
  type Tally,
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
      by: [
        "solutionId",
        "interfaceId",
        "connectionId",
        "clientTokenId",
        "externalId",
        "operation",
        "environment",
        "status",
      ],
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
   *
   * EVERY EDGE COUNT COMES FROM A PAIRING, never from one end's total. The row
   * names both ends — `clientTokenId` with the grant tuple, `interfaceId` with
   * `connectionId` — so a line is drawn only between two things a recorded call
   * actually joined.
   */
  const attributed = attributeCalls(
    audit.map((row) => ({
      solutionId: row.solutionId,
      interfaceId: row.interfaceId,
      connectionId: row.connectionId,
      clientTokenId: row.clientTokenId,
      externalId: row.externalId,
      operation: row.operation,
      environment: row.environment,
      status: row.status,
      count: row._count._all,
    })),
  );

  /** An edge, with its observation derived from the pair's own tally. */
  const edge = (from: string, to: string, t: Tally, inert: boolean): TopologyEdge => ({
    from,
    to,
    calls: t.calls,
    failures: t.failures,
    observed: observeEdge(t.calls, t.failures),
    inert,
  });

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
    const seen = tallyOf(attributed.byCredential, c.id);
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
        derived: `SolutionClient in ${c.environment}; ${seen.calls} call(s) recorded against this token in the window; last observed use ${c.lastUsedAt ? c.lastUsedAt.toISOString() : "never recorded"}.`,
        observedAt: c.lastUsedAt?.toISOString() ?? null,
        cannotTell:
          "Whether this credential is dormant, and which application holds it. Last-observed use is written fire-and-forget and often does not land, so a blank is an absent observation rather than an absent call.",
      },
      ...(d.incidentId ? { incidentId: d.incidentId } : {}),
    });
    // The only edge the caller column can carry: N calls arrived presenting
    // this token. It still says nothing about WHO presented it.
    edges.push(edge("caller", `cred:${c.id}`, seen, d.ended != null));
  }

  /*
   * Column 2 — solutions.
   *
   * THE SPINE. A solution owns the credential, the grants and the interfaces,
   * so a graph without it shows a token and a list of permissions and nothing
   * that says whose they are. It also closes a hole in the defect vocabulary:
   * "a solution with an empty owner slot" is one of the four defects this
   * module declares, and until there was a solution node it could never render.
   */
  for (const s of solutions) {
    const missing = missingOwners(s);
    const seen = tallyOf(attributed.bySolution, s.id);
    /*
     * The PROD test is the incident rule's condition, not the defect's. An
     * empty owner slot is a defect wherever it occurs; only the ones holding
     * PROD access are watched by anything.
     *
     * THIS MIRRORS `unaccountable-prod-grant`'S OWN PREDICATE, deliberately
     * including the part that looks wrong. That rule counts a grant on decision
     * and environment alone — it filters neither revoked nor expired rows — so
     * a solution whose only PROD grant was revoked yesterday IS still counted
     * by it. Adding a revocation check here would be the more defensible rule
     * and the wrong answer to the question this node is asking, which is not
     * "should something watch this" but "does anything". A node that claims to
     * be unmonitored while an incident is open about it is a worse lie than one
     * that inherits a rule's odd edges.
     */
    const holdsProdGrant = grants.some(
      (g) =>
        g.solutionId === s.id &&
        g.environment.toUpperCase() === "PROD" &&
        grantConfersAccess(g.decision),
    );
    const d = deriveSolution({ missingOwnerCount: missing.length, recordedCalls: seen.calls, holdsProdGrant });

    nodes.push({
      id: `sol:${s.id}`,
      kind: "solution",
      column: 2,
      label: s.name,
      state: d.state,
      ended: d.ended,
      quiet: d.quiet,
      badge: d.badge ?? s.status,
      href: routeFor(lens, "solution", "/studio/solutions"),
      provenance: {
        derived: missing.length
          ? `Solution ${s.status}; no ${missing.join(", no ")} assigned.`
          : `Solution ${s.status}; all three owners assigned; ${seen.calls} call(s) recorded across its grants in the window.`,
        observedAt: null,
        cannotTell: `Which deployment is calling as this solution — the platform sees one credential, not the applications holding it. ${FEED_CAVEAT}`,
        ...(d.noRule ? { noRule: d.noRule } : {}),
      },
      ...(d.incidentId ? { incidentId: d.incidentId } : {}),
    });

    /*
     * One credential per solution in v1 (`SolutionClient.solutionId` is
     * unique), so this pairing is a foreign key rather than an inference — but
     * the COUNT still comes from the observed pair, because a structural link
     * says the two are wired and says nothing about what ran.
     */
    for (const c of credentials.filter((x) => x.solutionId === s.id)) {
      edges.push(
        edge(
          `cred:${c.id}`,
          `sol:${s.id}`,
          tallyOf(attributed.byCredentialSolution, pairKey(c.id, s.id)),
          c.revokedAt != null,
        ),
      );
    }
  }

  /* Column 3 — grants. */
  for (const g of grants) {
    const gk = grantKey(g.solutionId, g.externalId, g.operation, g.environment);
    const grantTally = tallyOf(attributed.byGrant, gk);
    const recordedCalls = grantTally.calls;
    const d = deriveGrant({ ...g, recordedCalls }, now);
    nodes.push({
      id: `grant:${g.id}`,
      kind: "grant",
      column: 3,
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
    /*
     * A grant hangs off exactly one solution, by foreign key, so this edge is
     * one-to-one and the grant's own tally IS the pair's tally — no fan-out and
     * nothing repeated. The credential reaches the grant THROUGH the solution
     * now; a direct credential→grant line would jump a column and draw the same
     * traffic twice on one canvas.
     */
    edges.push(edge(`sol:${g.solutionId}`, `grant:${g.id}`, grantTally, d.ended != null));
  }

  /* Column 4 — interfaces. */
  for (const i of interfaces) {
    const seen = tallyOf(attributed.byInterface, i.id);
    const calls = seen.calls;
    const noEntitySet = !i.entitySet;
    nodes.push({
      id: `iface:${i.id}`,
      kind: "interface",
      column: 4,
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
    /*
     * OPERATION IS PART OF THE MATCH, and leaving it out was a fabrication.
     *
     * `access.ts` states the rule this drawing has to respect: "A READ grant
     * does not authorise a write, even for the same service in the same
     * environment — that distinction is the entire reason `operation` is
     * recorded on a grant." Matching on solution + service alone drew a line
     * from a READ grant to a CREATE interface, asserting an authorisation the
     * broker refuses on every call.
     *
     * Environment is deliberately NOT in the match: an interface has none, and
     * the same capability legitimately holds separate grants per landscape.
     */
    for (const g of grants.filter(
      (x) =>
        x.solutionId === i.solutionId &&
        x.externalId === i.externalId &&
        x.operation === i.operation,
    )) {
      const gk = grantKey(g.solutionId, g.externalId, g.operation, g.environment);
      edges.push(
        edge(
          `grant:${g.id}`,
          `iface:${i.id}`,
          tallyOf(attributed.byGrantInterface, pairKey(gk, i.id)),
          g.revokedAt != null,
        ),
      );
    }
  }

  /* Column 5 — connections. */
  for (const c of connections) {
    const d = deriveConnection(c);
    const seen = tallyOf(attributed.byConnection, c.id);
    nodes.push({
      id: `conn:${c.id}`,
      kind: "connection",
      column: 5,
      label: c.label,
      state: d.state,
      ended: d.ended,
      quiet: d.quiet,
      badge: d.badge ?? c.environment ?? null,
      href: routeFor(lens, "connection", "/operations/connections"),
      provenance: {
        derived: c.lastValidatedAt
          ? `last successful probe ${c.lastValidatedAt.toISOString()}, status ${c.lastValidationStatus ?? "unknown"}; ${seen.calls} call(s) recorded through it in the window.`
          : `No probe has ever been recorded against this connection; ${seen.calls} call(s) recorded through it in the window.`,
        observedAt: c.lastValidatedAt?.toISOString() ?? null,
        cannotTell:
          "Whether it is answering right now. The timestamp moves only on a real success, so a failure beside an old success date is the truth, not an inconsistency.",
      },
      ...(d.incidentId ? { incidentId: d.incidentId } : {}),
    });

    /*
     * OBSERVED PAIRINGS ONLY. There is no schema link between an interface and
     * a connection — the broker resolves the binding per call from the declared
     * environment — so "which interface uses this connection" is answerable
     * only from rows that named both. Drawing every interface into every
     * connection, which is what this did before, invents a wiring diagram.
     */
    for (const i of interfaces) {
      const pair = attributed.byInterfaceConnection.get(pairKey(i.id, c.id));
      if (pair) edges.push(edge(`iface:${i.id}`, `conn:${c.id}`, pair, false));
    }
    edges.push(edge(`conn:${c.id}`, "tenant", seen, !c.isActive));
  }

  /* Column 6 — the customer's SAP. */
  nodes.push({
    id: "tenant",
    kind: "tenant",
    column: 6,
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
    provenance: {
      feedIsAFloor: FEED_CAVEAT,
      grantAttribution:
        "Calls are attributed to a grant by matching solution, service, operation and environment — there is no grant id on an audit row.",
      binding:
        "A line between an interface and a connection is drawn only where a recorded call named both. The broker resolves that binding per call from the declared environment, so an unused pairing is not a fact and is not shown.",
      noSummary:
        "This view carries no totals worth copying. Every number with an authoritative screen stays on that screen.",
    },
  });
}
