/** GET: List votes for session, POST: Submit a vote */

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { isMfaRequired } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";
import { ERROR_CODES } from "@/types/api";

const VoteSchema = z.object({
  processStepId: z.string().min(1),
  classification: z.enum(["FIT", "CONFIGURE", "GAP", "NA"]),
  confidence: z.enum(["high", "medium", "low"]).optional(),
  notes: z.string().max(2000).optional(),
});
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; sessionId: string }> },
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.UNAUTHORIZED, message: "Not authenticated" } },
      { status: 401 },
    );
  }

  if (isMfaRequired(user)) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.MFA_REQUIRED, message: "MFA verification required" } },
      { status: 403 },
    );
  }

  const { id: assessmentId, sessionId } = await params;

  const session = await prisma.workshopSession.findFirst({
    where: { id: sessionId, assessmentId },
    select: { id: true },
  });

  if (!session) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.NOT_FOUND, message: "Workshop session not found" } },
      { status: 404 },
    );
  }

  const votes = await prisma.workshopVote.findMany({
    where: { sessionId },
    orderBy: { votedAt: "desc" },
  });

  return NextResponse.json({ data: votes });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; sessionId: string }> },
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.UNAUTHORIZED, message: "Not authenticated" } },
      { status: 401 },
    );
  }

  if (isMfaRequired(user)) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.MFA_REQUIRED, message: "MFA verification required" } },
      { status: 403 },
    );
  }

  const { id: assessmentId, sessionId } = await params;

  const session = await prisma.workshopSession.findFirst({
    where: { id: sessionId, assessmentId },
    select: { id: true, status: true },
  });

  if (!session) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.NOT_FOUND, message: "Workshop session not found" } },
      { status: 404 },
    );
  }

  if (session.status !== "in_progress") {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Voting is only allowed during an active workshop" } },
      { status: 400 },
    );
  }

  const body: unknown = await request.json();
  const parsed = VoteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Validation failed" } },
      { status: 400 },
    );
  }

  const vote = await prisma.workshopVote.upsert({
    where: {
      sessionId_processStepId_userId: {
        sessionId,
        processStepId: parsed.data.processStepId,
        userId: user.id,
      },
    },
    update: {
      classification: parsed.data.classification,
      confidence: parsed.data.confidence ?? null,
      notes: parsed.data.notes ?? null,
      votedAt: new Date(),
    },
    create: {
      sessionId,
      processStepId: parsed.data.processStepId,
      userId: user.id,
      classification: parsed.data.classification,
      confidence: parsed.data.confidence ?? null,
      notes: parsed.data.notes ?? null,
    },
  });

  return NextResponse.json({ data: vote }, { status: 201 });
}
