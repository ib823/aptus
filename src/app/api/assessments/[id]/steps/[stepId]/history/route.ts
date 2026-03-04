import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string; stepId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: assessmentId, stepId } = await params;

  try {
    // Check if assessment exists
    const assessment = await prisma.assessment.findUnique({
      where: { id: assessmentId, deletedAt: null },
      select: { id: true }
    });

    if (!assessment) {
      return NextResponse.json({ error: "Assessment not found" }, { status: 404 });
    }

    const history = await prisma.stepResponseHistory.findMany({
      where: {
        stepResponse: {
          assessmentId,
          processStepId: stepId,
        }
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ data: history });
  } catch (error) {
    console.error("Step History API Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
