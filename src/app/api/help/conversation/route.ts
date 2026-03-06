import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";

const PutMessageSchema = z.object({
  sessionId: z.string().min(1),
  message: z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string().min(1).max(10000),
  }),
});

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { assessmentId } = await req.json();

    // Re-use Phase 22's ConversationSession model as the global help desk session
    // scopeItemId is required by schema, we use a placeholder for global help
    const GLOBAL_SCOPE = "GLOBAL_HELP";

    // Find existing open session for this user/assessment combo
    let session = await prisma.conversationSession.findFirst({
      where: {
        userId: user.id,
        status: "in_progress",
        scopeItemId: GLOBAL_SCOPE,
        ...(assessmentId ? { assessmentId } : {}),
      },
      orderBy: { startedAt: "desc" },
    });

    if (!session) {
      let targetAssessmentId = assessmentId;
      if (!targetAssessmentId) {
        const firstAssessment = await prisma.assessmentStakeholder.findFirst({
          where: { userId: user.id },
        });
        if (!firstAssessment) {
          return NextResponse.json({ error: "No assessment context found for user." }, { status: 400 });
        }
        targetAssessmentId = firstAssessment.assessmentId;
      }

      session = await prisma.conversationSession.create({
        data: {
          assessmentId: targetAssessmentId,
          userId: user.id,
          scopeItemId: GLOBAL_SCOPE,
          status: "in_progress",
          responses: [],
        },
      });
    }

    return NextResponse.json({
      sessionId: session.id,
      responses: session.responses
    });
  } catch (error) {
    console.error("Init Help Session Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const parsed = PutMessageSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const { sessionId, message } = parsed.data;

    // Ownership check: only the session owner can append messages
    const session = await prisma.conversationSession.findFirst({
      where: { id: sessionId, userId: user.id },
    });

    if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });

    // Atomic read-append-write via transaction
    await prisma.$transaction(async (tx) => {
      const current = await tx.conversationSession.findUnique({
        where: { id: sessionId },
        select: { responses: true },
      });
      const currentResponses = Array.isArray(current?.responses) ? current.responses : [];
      await tx.conversationSession.update({
        where: { id: sessionId },
        data: {
          responses: [...currentResponses, message],
        },
      });
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Update Help Session Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const sessionId = url.searchParams.get("sessionId");

  if (!sessionId) return NextResponse.json({ error: "Missing sessionId" }, { status: 400 });

  try {
    // Ownership check: only the session owner can read their messages
    const session = await prisma.conversationSession.findFirst({
      where: { id: sessionId, userId: user.id },
      select: { responses: true },
    });

    if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });

    return NextResponse.json({ responses: session.responses });
  } catch (error) {
    console.error("Get Help Session Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
