import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { verifyAssessmentAccess } from "@/lib/auth/verify-assessment-access";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string; stepId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: assessmentId, stepId } = await params;

  // Verify the user has access to this assessment
  const hasAccess = await verifyAssessmentAccess(user, assessmentId);
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
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
