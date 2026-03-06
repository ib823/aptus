import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";

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
      // Create new session if none exists
      // If assessmentId is missing, we must provide a fallback since it's required.
      // In a real app, you might want to fetch their most recent active assessment.
      // For now, we will require assessmentId to be passed or look up the first one.
      
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
    const { sessionId, message } = await req.json();

    const session = await prisma.conversationSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });

    const currentResponses = Array.isArray(session.responses) ? session.responses : [];
    
    await prisma.conversationSession.update({
      where: { id: sessionId },
      data: {
        responses: [...currentResponses, message],
      },
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
    const session = await prisma.conversationSession.findUnique({
      where: { id: sessionId },
      select: { responses: true },
    });

    if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });

    return NextResponse.json({ responses: session.responses });
  } catch (error) {
    console.error("Get Help Session Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}