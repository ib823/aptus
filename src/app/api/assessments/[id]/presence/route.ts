import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";

type PresencePayload = { currentPage?: string; entityId?: string };

function isRequestAbortError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const code = (error as Error & { code?: unknown }).code;
  return code === "ECONNRESET" || error.message.toLowerCase() === "aborted";
}

function isUnexpectedEndOfJsonError(error: unknown): boolean {
  return error instanceof SyntaxError && error.message.includes("Unexpected end of JSON input");
}

async function parsePresencePayload(req: Request): Promise<PresencePayload> {
  try {
    const body = (await req.json()) as { currentPage?: unknown; entityId?: unknown };
    const payload: PresencePayload = {};
    if (typeof body.currentPage === "string") {
      payload.currentPage = body.currentPage;
    }
    if (typeof body.entityId === "string") {
      payload.entityId = body.entityId;
    }
    return payload;
  } catch (error) {
    if (isRequestAbortError(error) || isUnexpectedEndOfJsonError(error)) {
      return {};
    }
    throw error;
  }
}

/**
 * Presence Heartbeat API
 * Handles real-time active user tracking for an assessment.
 */

// POST: Upsert current user presence
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  const { id: assessmentId } = await params;

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { currentPage, entityId } = await parsePresencePayload(req);

    const now = new Date();

    // Upsert the presence record
    await prisma.presenceRecord.upsert({
      where: {
        assessmentId_userId: {
          assessmentId,
          userId: user.id,
        },
      },
      update: {
        userName: user.name || user.email,
        userRole: user.role,
        userImage: user.image ?? null,
        currentPage: currentPage ?? null,
        entityId: entityId ?? null,
        lastSeenAt: now,
      },
      create: {
        assessmentId,
        userId: user.id,
        userName: user.name || user.email,
        userRole: user.role,
        userImage: user.image ?? null,
        currentPage: currentPage ?? null,
        entityId: entityId ?? null,
        lastSeenAt: now,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Presence Heartbeat Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

// GET: Retrieve all active users for the assessment
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  const { id: assessmentId } = await params;

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const STALE_THRESHOLD_MS = 15000; // 15 seconds
    const staleTime = new Date(Date.now() - STALE_THRESHOLD_MS);

    // 1. Prune stale records for this assessment
    await prisma.presenceRecord.deleteMany({
      where: {
        assessmentId,
        lastSeenAt: { lt: staleTime },
      },
    });

    // 2. Fetch remaining active records
    const activeUsers = await prisma.presenceRecord.findMany({
      where: { assessmentId },
      orderBy: { lastSeenAt: 'desc' },
    });

    return NextResponse.json({ data: activeUsers });
  } catch (error) {
    console.error("Presence Retrieval Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
