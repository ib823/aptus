/**
 * GET /api/control-tower/audit — the governance trail.
 *
 * READS `ConfigAudit`. Never writes, never updates, never deletes: the table is
 * append-only and this module is a consumer of it. A trail that can be edited
 * from the screen that displays it is not a trail.
 *
 * `before` AND `after` ARE NOT RETURNED. They are `Json?` columns holding whole
 * entity snapshots — which, for a Solution or a Connection, can include fields
 * this workspace has no business projecting to a viewer, and which no amount of
 * careful rendering would reliably redact. What is returned is what changed:
 * the entity, the action, the actor and the time. An operator who needs the
 * shape of a specific change has the id to ask for it deliberately.
 *
 * That is a real limitation rather than a hidden one, so it is stated in the
 * payload instead of leaving a reader to assume the diff was empty.
 */

import type { NextRequest } from "next/server";

import { prisma } from "@/lib/db/prisma";
import { opsLimit, opsWhere, opsWindowHours, requireControlTower } from "@/lib/ops/guard";
import { studioOk } from "@/lib/studio/api";

export const dynamic = "force-dynamic";

/** The actions the platform actually writes. Anything else is shown verbatim. */
// ISSUE and ROTATE exist because minting a runtime credential used to be filed
// as "Solution / UPDATE" — a live SAP token indistinguishable from a rename, and
// with no entity to filter on when asking what a departing consultant issued.
const KNOWN_ACTIONS = ["CREATE", "UPDATE", "PROMOTE", "DECISION", "TEST_CONNECT", "ISSUE", "ROTATE"];

export async function GET(request: NextRequest) {
  const guard = await requireControlTower();
  if (!guard.ok) return guard.response;

  const params = request.nextUrl.searchParams;
  const hours = opsWindowHours(params.get("hours"), 24 * 30);
  const limit = opsLimit(params.get("limit"));
  const entityType = params.get("entityType");
  const action = params.get("action");
  const actorId = params.get("actorId");

  const since = new Date(Date.now() - hours * 60 * 60 * 1000);

  const where = opsWhere(guard.actor, {
    at: { gte: since },
    ...(entityType ? { entityType } : {}),
    ...(action ? { action } : {}),
    ...(actorId ? { actorId } : {}),
  });

  const [total, rows, byAction, byEntity] = await Promise.all([
    prisma.configAudit.count({ where }),
    prisma.configAudit.findMany({
      where,
      // `before` / `after` deliberately absent — see the header.
      select: {
        id: true,
        actorId: true,
        entityType: true,
        entityId: true,
        action: true,
        at: true,
      },
      orderBy: { at: "desc" },
      take: limit,
    }),
    prisma.configAudit.groupBy({ by: ["action"], where, _count: { _all: true } }),
    prisma.configAudit.groupBy({ by: ["entityType"], where, _count: { _all: true } }),
  ]);

  /*
   * RESOLVE THE IDS TO NAMES.
   *
   * The trail answered "who changed what" with raw cuids — actor
   * cmoe2ii0y0008k504q2j3pr01 changed entity cms6nposp0003jm0415ps93ey. Both
   * facts are correct and neither is usable: in an audit or a client dispute
   * nobody can say who that was without a database session.
   *
   * The id is KEPT alongside the label, not replaced by it. The id is the
   * evidence — stable, unique, and unaffected by someone later renaming a
   * solution or changing their display name. The label is the affordance.
   * Reporting only the label would make the trail readable and unciteable.
   *
   * Resolved at READ time rather than denormalised at write time, deliberately:
   * a name copied into the audit row at write time would freeze a person's old
   * name into the record forever, and ConfigAudit has no update path to fix it.
   *
   * Two queries, both bounded by the page that was just read.
   */
  const actorIds = [...new Set(rows.map((r) => r.actorId).filter(Boolean))];
  const solutionIds = [
    ...new Set(rows.filter((r) => r.entityType === "Solution").map((r) => r.entityId)),
  ];
  const [actors, solutions] = await Promise.all([
    actorIds.length > 0
      ? prisma.user.findMany({
          where: { id: { in: actorIds } },
          select: { id: true, name: true, email: true },
        })
      : Promise.resolve([]),
    solutionIds.length > 0
      ? prisma.solution.findMany({
          where: { id: { in: solutionIds } },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
  ]);
  const actorBy = new Map(actors.map((a) => [a.id, a.name?.trim() || a.email || null]));
  const solutionBy = new Map(solutions.map((s) => [s.id, s.name]));

  const actionCounts: Record<string, number> = {};
  for (const g of byAction) actionCounts[g.action] = g._count._all;
  const entityCounts: Record<string, number> = {};
  for (const g of byEntity) entityCounts[g.entityType] = g._count._all;

  return studioOk({
    windowHours: hours,
    since: since.toISOString(),
    scope: guard.actor.kind,
    counts: { total, byAction: actionCounts, byEntity: entityCounts },
    knownActions: KNOWN_ACTIONS,
    filters: { entityType, action, actorId },
    truncated: total > rows.length,
    provenance: {
      appendOnly:
        "ConfigAudit has no update or delete path anywhere in the platform. Entries cannot be amended, including from here.",
      diffsNotReturned:
        "The before/after snapshots are stored but not returned. They hold whole entity records, which can carry fields this view has no business projecting — so the trail reports WHAT changed and WHO changed it, not the shape of the change.",
      idsAreTheEvidence:
        "actorLabel and entityLabel are resolved at read time for legibility; actorId and entityId are the record. A label can change when someone is renamed — the id cannot, which is why both are returned and why a citation should use the id. A null label means the id resolved to nothing, not that the entry is incomplete.",
      coversGovernedConfigOnly:
        "This records governed configuration — solutions, interfaces, connections, grants. It is not an application log and does not record reads.",
      entriesAreAPage: { returned: rows.length, limit, of: total },
    },
    entries: rows.map((r) => ({
      id: r.id,
      at: r.at.toISOString(),
      actorId: r.actorId,
      /*
       * NULL means the id resolved to nothing — a deleted user, or a row from
       * another tenant. Stated as null rather than filled with the id again, so
       * a screen can say "unknown actor" instead of showing a cuid that looks
       * like a name.
       */
      actorLabel: actorBy.get(r.actorId) ?? null,
      entityType: r.entityType,
      entityId: r.entityId,
      entityLabel: r.entityType === "Solution" ? (solutionBy.get(r.entityId) ?? null) : null,
      action: r.action,
    })),
  });
}
