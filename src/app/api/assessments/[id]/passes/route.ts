/**
 * Phase 5 — Classification Pass list + create.
 *
 * GET  → list passes (newest first) with bucket counts
 * POST → start a new pass (returns { id })
 *
 * Backend for the in-app classification workspace's pass launcher.
 */

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { isAssessmentAccessError, requireAssessmentAccess } from "@/lib/auth/assessment-guard";
import { safeParseJsonBody } from "@/lib/http/safe-json-body";
import { listPasses } from "@/lib/classification/pass-data";

export async function GET(
  _request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: assessmentId } = await ctx.params;
  const access = await requireAssessmentAccess(assessmentId);
  if (isAssessmentAccessError(access)) return access;

  const passes = await listPasses(assessmentId);
  return NextResponse.json({ passes });
}

const createSchema = z.object({
  protocolVersionId: z.string().optional(),
  parentPassId: z.string().optional(),
  actorRole: z.enum(["ai", "consultant", "orchestrator"]).default("consultant"),
});

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: assessmentId } = await ctx.params;
  const access = await requireAssessmentAccess(assessmentId);
  if (isAssessmentAccessError(access)) return access;
  const { user } = access;

  // The shared guard's select doesn't include catalogVersionId; fetch it
  // narrowly here. The assessment is guaranteed to exist by the guard.
  const { catalogVersionId } = (await prisma.assessment.findUniqueOrThrow({
    where: { id: assessmentId },
    select: { catalogVersionId: true },
  }));

  if (!catalogVersionId) {
    return NextResponse.json(
      { error: "Assessment has no catalogVersionId — backfill required (Phase 1 cutover)" },
      { status: 409 },
    );
  }

  // Empty body is OK (all fields optional) → fall through with {}.
  const bodyResult = await safeParseJsonBody(request);
  const rawBody = bodyResult.ok ? bodyResult.data : {};
  const parsed = createSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  }

  // Resolve protocol — explicit override or active default for this catalog
  const protocol = parsed.data.protocolVersionId
    ? await prisma.classificationProtocol.findUnique({ where: { id: parsed.data.protocolVersionId } })
    : await prisma.classificationProtocol.findFirst({
        where: { isActive: true, catalogVersionId },
        orderBy: { createdAt: "desc" },
      });

  if (!protocol) {
    return NextResponse.json(
      { error: "No active ClassificationProtocol for this assessment's catalog version" },
      { status: 409 },
    );
  }

  const pass = await prisma.classificationPass.create({
    data: {
      assessmentId,
      protocolVersionId: protocol.id,
      catalogVersionId,
      actor: user.id,
      actorRole: parsed.data.actorRole,
      parentPassId: parsed.data.parentPassId ?? null,
      summaryJson: { source: "in-app workspace" },
    },
  });

  return NextResponse.json({ id: pass.id, startedAt: pass.startedAt }, { status: 201 });
}
