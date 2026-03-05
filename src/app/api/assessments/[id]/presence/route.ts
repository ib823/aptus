import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";

type PresencePayload = { currentPage?: string; entityId?: string };
type AuthenticatedUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;
type PresenceResponseRow = {
  userId: string;
  userName: string;
  userRole: string;
  userImage: string | null;
  currentPage: string | null;
  entityId: string | null;
  lastSeenAt: Date;
};

function isMissingOptionalPresenceColumnsError(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2022") {
    return false;
  }

  const column = (error.meta as { column?: unknown } | undefined)?.column;
  const combined = `${typeof column === "string" ? column : ""} ${error.message}`.toLowerCase();
  return combined.includes("userimage") || combined.includes("entityid");
}

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

async function upsertPresenceRecord(params: {
  assessmentId: string;
  user: AuthenticatedUser;
  currentPage: string | undefined;
  entityId: string | undefined;
  now: Date;
}): Promise<void> {
  const { assessmentId, user, currentPage, entityId, now } = params;
  const sharedData = {
    userName: user.name || user.email,
    userRole: user.role,
    currentPage: currentPage ?? null,
    lastSeenAt: now,
  };

  try {
    await prisma.presenceRecord.upsert({
      where: {
        assessmentId_userId: {
          assessmentId,
          userId: user.id,
        },
      },
      update: {
        ...sharedData,
        userImage: user.image ?? null,
        entityId: entityId ?? null,
      },
      create: {
        assessmentId,
        userId: user.id,
        ...sharedData,
        userImage: user.image ?? null,
        entityId: entityId ?? null,
      },
      select: { id: true },
    });
  } catch (error) {
    if (!isMissingOptionalPresenceColumnsError(error)) {
      throw error;
    }

    await prisma.presenceRecord.upsert({
      where: {
        assessmentId_userId: {
          assessmentId,
          userId: user.id,
        },
      },
      update: sharedData,
      create: {
        assessmentId,
        userId: user.id,
        ...sharedData,
      },
      select: { id: true },
    });
  }
}

async function listActivePresenceUsers(assessmentId: string): Promise<PresenceResponseRow[]> {
  try {
    return await prisma.presenceRecord.findMany({
      where: { assessmentId },
      orderBy: { lastSeenAt: "desc" },
      select: {
        userId: true,
        userName: true,
        userRole: true,
        userImage: true,
        currentPage: true,
        entityId: true,
        lastSeenAt: true,
      },
    });
  } catch (error) {
    if (!isMissingOptionalPresenceColumnsError(error)) {
      throw error;
    }

    const users = await prisma.presenceRecord.findMany({
      where: { assessmentId },
      orderBy: { lastSeenAt: "desc" },
      select: {
        userId: true,
        userName: true,
        userRole: true,
        currentPage: true,
        lastSeenAt: true,
      },
    });

    return users.map((user) => ({
      ...user,
      userImage: null,
      entityId: null,
    }));
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
    await upsertPresenceRecord({
      assessmentId,
      user,
      currentPage,
      entityId,
      now: new Date(),
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
    const activeUsers = await listActivePresenceUsers(assessmentId);

    return NextResponse.json({ data: activeUsers });
  } catch (error) {
    console.error("Presence Retrieval Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
