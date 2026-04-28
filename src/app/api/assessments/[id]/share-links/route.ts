/**
 * Phase 12 — share-link issuance.
 *
 * GET → list active share links for an assessment.
 * POST → issue a new share link (returns the token + URL).
 *
 * Org-scoped auth (consultant + above).
 */

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/session";
import { generateShareLinkToken } from "@/lib/auth/share-link";

const POSITIVE_INT = z.number().int().positive();

const createSchema = z.object({
  expiresInDays: POSITIVE_INT.max(365).optional(), // null = never expires
  scope: z.record(z.string(), z.unknown()).optional(),
});

export async function GET(
  _request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: assessmentId } = await ctx.params;

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const assessment = await prisma.assessment.findUnique({
    where: { id: assessmentId, deletedAt: null },
    select: { id: true, organizationId: true },
  });
  if (!assessment) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (user.organizationId !== assessment.organizationId && user.role !== "platform_admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const links = await prisma.assessmentShareLink.findMany({
    where: { assessmentId, revokedAt: null },
    orderBy: { createdAt: "desc" },
    select: {
      id: true, createdAt: true, createdBy: true, expiresAt: true,
      lastAccessedAt: true, accessCount: true, scopeJson: true,
      // token deliberately omitted from list — fetch on individual request
    },
  });

  return NextResponse.json({ links });
}

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: assessmentId } = await ctx.params;

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const assessment = await prisma.assessment.findUnique({
    where: { id: assessmentId, deletedAt: null },
    select: { id: true, organizationId: true },
  });
  if (!assessment) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (user.organizationId !== assessment.organizationId && user.role !== "platform_admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown = {};
  try { body = await request.json(); } catch { /* empty OK */ }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  }

  const expiresAt = parsed.data.expiresInDays
    ? new Date(Date.now() + parsed.data.expiresInDays * 24 * 60 * 60 * 1000)
    : null;

  const token = generateShareLinkToken();
  const link = await prisma.assessmentShareLink.create({
    data: {
      assessmentId,
      token,
      createdBy: user.id,
      expiresAt,
      scopeJson: parsed.data.scope
        ? (parsed.data.scope as Prisma.InputJsonValue)
        : Prisma.JsonNull,
    },
  });

  return NextResponse.json({
    id: link.id,
    token,
    expiresAt: link.expiresAt,
    url: `/assessments/${token}`, // (portal-customer) base path
  }, { status: 201 });
}
