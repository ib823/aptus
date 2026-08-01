/**
 * GET /api/control-tower/portfolio — every solution, and whether it is governed.
 *
 * THE QUESTION THIS ANSWERS is not "what exists" but "what is accountable". A
 * solution with no owners is not a gap in a form; it is a runtime credential
 * nobody can be asked about, and the product already refuses to issue one for
 * it. So ownership completeness is reported per solution and per portfolio,
 * with the three slots named individually — "2 of 3 owners" tells an operator
 * nothing about who to chase.
 *
 * `dataClass` IS A DECLARATION, NOT A CONTROL, and the response says so. It is a
 * free-text string that gates nothing anywhere in the system. Rendered beside
 * governed fields without that caveat it would read as an enforced
 * classification, which is precisely the kind of borrowed authority this
 * console exists not to lend.
 */

import type { NextRequest } from "next/server";

import { prisma } from "@/lib/db/prisma";
import { opsWhere, requireControlTower } from "@/lib/ops/guard";
import { studioOk } from "@/lib/studio/api";
import { missingOwners } from "@/lib/studio/solutions";

export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest) {
  const guard = await requireControlTower();
  if (!guard.ok) return guard.response;

  const [rows, interfaceGroups, credentialGroups] = await Promise.all([
    prisma.solution.findMany({
      where: opsWhere(guard.actor, {}),
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        classification: true,
        dataClass: true,
        technicalOwnerId: true,
        businessOwnerId: true,
        supportOwnerId: true,
        createdAt: true,
      },
      orderBy: [{ status: "asc" }, { name: "asc" }],
    }),
    // Counted per solution rather than joined: Interface has no relation back to
    // Solution that a nested select could use, and a per-row query would be N+1.
    prisma.interface.groupBy({
      by: ["solutionId"],
      where: opsWhere(guard.actor, {}),
      _count: { _all: true },
    }),
    prisma.solutionClient.groupBy({
      by: ["solutionId"],
      where: opsWhere(guard.actor, { isActive: true, revokedAt: null }),
      _count: { _all: true },
    }),
  ]);

  const interfacesBy = new Map(interfaceGroups.map((g) => [g.solutionId, g._count._all]));
  const credentialsBy = new Map(credentialGroups.map((g) => [g.solutionId, g._count._all]));

  const solutions = rows.map((s) => {
    const missing = missingOwners(s);
    return {
      id: s.id,
      name: s.name,
      slug: s.slug,
      status: s.status,
      classification: s.classification,
      /** Declared, never enforced. See the header and `provenance`. */
      dataClass: s.dataClass,
      ownership: {
        technicalOwnerId: s.technicalOwnerId,
        businessOwnerId: s.businessOwnerId,
        supportOwnerId: s.supportOwnerId,
        // Named individually: "2 of 3" does not tell anyone who to chase.
        missing,
        complete: missing.length === 0,
      },
      interfaces: interfacesBy.get(s.id) ?? 0,
      hasLiveCredential: (credentialsBy.get(s.id) ?? 0) > 0,
      createdAt: s.createdAt.toISOString(),
    };
  });

  const byStatus: Record<string, number> = {};
  for (const s of solutions) byStatus[s.status] = (byStatus[s.status] ?? 0) + 1;

  return studioOk({
    scope: guard.actor.kind,
    counts: {
      total: solutions.length,
      byStatus,
      unowned: solutions.filter((s) => !s.ownership.complete).length,
      withLiveCredential: solutions.filter((s) => s.hasLiveCredential).length,
    },
    provenance: {
      dataClassIsNotEnforced:
        "dataClass is now a controlled vocabulary — it was free text, which is how the value `czxgvz` reached this register. Closing the list makes the field comparable across solutions; it does NOT make it a control. Nothing in the platform gates on it yet, so it is still shown as what a team declared about their solution, never as something the runtime checks. Rows registered before the vocabulary closed read as UNCLASSIFIED rather than being mapped onto a class nobody chose.",
      ownershipGatesIssuance:
        "A solution cannot be promoted to ACTIVE, and no runtime credential can be issued for it, until all three owner slots are filled. Owners are claimed by the person accountable — they cannot be assigned to someone else.",
      countsAreComplete:
        "Unlike the broker feeds, this is a census: every solution in scope is listed. There is no sampling and no page.",
    },
    solutions,
  });
}
