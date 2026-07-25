/**
 * Solutions + Canvas — /studio/solutions
 *
 * The register of what this organization is building against SAP, and who is
 * accountable for each one.
 */

import type { Metadata } from "next";

import { SolutionsClient, type StudioSolution } from "@/components/studio/SolutionsClient";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { canMutateStudio } from "@/lib/studio/rbac";
import type { SolutionStatus } from "@/lib/studio/solutions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Solutions" };

export default async function StudioSolutionsPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const organizationId = user.organizationId;
  const rows = organizationId
    ? await prisma.solution.findMany({
        where: { organizationId },
        select: {
          id: true,
          name: true,
          slug: true,
          classification: true,
          businessProblem: true,
          status: true,
          dataClass: true,
          technicalOwnerId: true,
          businessOwnerId: true,
          supportOwnerId: true,
          repoUrl: true,
          packagingNote: true,
          reuseIntent: true,
          _count: { select: { interfaces: true, grants: true } },
        },
        orderBy: { name: "asc" },
      })
    : [];

  const solutions: StudioSolution[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    classification: r.classification,
    businessProblem: r.businessProblem,
    status: r.status as SolutionStatus,
    dataClass: r.dataClass,
    technicalOwnerId: r.technicalOwnerId,
    businessOwnerId: r.businessOwnerId,
    supportOwnerId: r.supportOwnerId,
    repoUrl: r.repoUrl,
    packagingNote: r.packagingNote,
    reuseIntent: r.reuseIntent,
    interfaceCount: r._count.interfaces,
    grantCount: r._count.grants,
  }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 24, lineHeight: "32px", fontWeight: 700, letterSpacing: "-0.01em" }}>
          Solutions
        </h1>
        <p style={{ margin: "4px 0 0", fontSize: 14, lineHeight: "22px", color: "var(--ink-secondary)", maxWidth: 760 }}>
          What this organization is building against SAP, and who answers for it. A solution
          cannot be ACTIVE without a technical, business and support owner — and if it loses
          one, it drops to RESTRICTED.
        </p>
      </div>

      <SolutionsClient
        solutions={solutions}
        canAuthor={canMutateStudio(user.role)}
        currentUserId={user.id}
      />
    </div>
  );
}
