/**
 * Phase 6 — Provenance API for the per-row trust panel.
 *
 * GET → full provenance trail for a requirement's current verdict:
 *   - actor + source + protocol version + catalog version + cited scope items
 *     (with names, looked up against the catalog)
 *   - vendor's submitted verdict (if any)
 *   - full edit history (every prior verdict)
 */

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/session";

export async function GET(
  _request: NextRequest,
  ctx: { params: Promise<{ id: string; reqId: string }> },
): Promise<NextResponse> {
  const { id: assessmentId, reqId } = await ctx.params;

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const requirement = await prisma.clientRequirement.findUnique({
    where: { id: reqId },
    select: {
      id: true, assessmentId: true, module: true, code: true, requirementText: true,
      assessment: { select: { id: true, organizationId: true, status: true, companyName: true } },
      verdicts: {
        orderBy: { createdAt: "desc" },
        include: {
          scopeCitations: {
            include: { scopeItem: { select: { id: true, name: true, nameClean: true } } },
          },
          protocolVersion: { select: { id: true, name: true, version: true, catalogVersion: { select: { version: true, edition: true } } } },
          pass: { select: { id: true, startedAt: true, actor: true, actorRole: true } },
        },
      },
      vendorResponses: {
        orderBy: { importedAt: "desc" },
        include: {
          submission: { select: { id: true, vendorName: true, submittedAt: true } },
        },
      },
    },
  });

  if (!requirement || requirement.assessmentId !== assessmentId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (user.organizationId !== requirement.assessment.organizationId && user.role !== "platform_admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const current = requirement.verdicts[0];
  const history = requirement.verdicts.slice(1);

  return NextResponse.json({
    requirement: {
      id: requirement.id,
      module: requirement.module,
      code: requirement.code,
      requirementText: requirement.requirementText,
      assessment: {
        id: requirement.assessment.id,
        companyName: requirement.assessment.companyName,
        status: requirement.assessment.status,
      },
    },
    currentVerdict: current ?? null,
    verdictHistory: history,
    vendorResponses: requirement.vendorResponses,
  });
}
