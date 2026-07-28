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
const KNOWN_ACTIONS = ["CREATE", "UPDATE", "PROMOTE", "DECISION", "TEST_CONNECT"];

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
      coversGovernedConfigOnly:
        "This records governed configuration — solutions, interfaces, connections, grants. It is not an application log and does not record reads.",
      entriesAreAPage: { returned: rows.length, limit, of: total },
    },
    entries: rows.map((r) => ({
      id: r.id,
      at: r.at.toISOString(),
      actorId: r.actorId,
      entityType: r.entityType,
      entityId: r.entityId,
      action: r.action,
    })),
  });
}
