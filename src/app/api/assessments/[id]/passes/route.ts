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
import { getCurrentUser } from "@/lib/auth/session";
import { listPasses } from "@/lib/classification/pass-data";

async function authorize(assessmentId: string) {
  const user = await getCurrentUser();
  if (!user) return { error: "Unauthorized", status: 401 } as const;

  const assessment = await prisma.assessment.findUnique({
    where: { id: assessmentId, deletedAt: null },
    select: { id: true, organizationId: true, catalogVersionId: true },
  });
  if (!assessment) return { error: "Not found", status: 404 } as const;
  if (user.organizationId !== assessment.organizationId && user.role !== "platform_admin") {
    return { error: "Forbidden", status: 403 } as const;
  }
  return { user, assessment } as const;
}

export async function GET(
  _request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: assessmentId } = await ctx.params;
  const auth = await authorize(assessmentId);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status as number });

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
  const auth = await authorize(assessmentId);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status as number });

  if (!auth.assessment.catalogVersionId) {
    return NextResponse.json(
      { error: "Assessment has no catalogVersionId — backfill required (Phase 1 cutover)" },
      { status: 409 },
    );
  }

  let body: unknown = {};
  try { body = await request.json(); } catch { /* empty body OK */ }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  }

  // Resolve protocol — explicit override or active default for this catalog
  const protocol = parsed.data.protocolVersionId
    ? await prisma.classificationProtocol.findUnique({ where: { id: parsed.data.protocolVersionId } })
    : await prisma.classificationProtocol.findFirst({
        where: { isActive: true, catalogVersionId: auth.assessment.catalogVersionId },
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
      catalogVersionId: auth.assessment.catalogVersionId,
      actor: auth.user.id,
      actorRole: parsed.data.actorRole,
      parentPassId: parsed.data.parentPassId ?? null,
      summaryJson: { source: "in-app workspace" },
    },
  });

  return NextResponse.json({ id: pass.id, startedAt: pass.startedAt }, { status: 201 });
}
