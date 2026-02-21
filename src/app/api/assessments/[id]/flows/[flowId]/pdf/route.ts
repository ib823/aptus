/** GET: Single flow diagram as PDF */

import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { isMfaRequired } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";
import { ERROR_CODES } from "@/types/api";
import { jsPDF } from "jspdf";

export const preferredRegion = "sin1";
export const maxDuration = 30;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; flowId: string }> },
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

  const { id: assessmentId, flowId } = await params;

  const diagram = await prisma.processFlowDiagram.findFirst({
    where: { id: flowId, assessmentId },
    select: { svgContent: true, scopeItemId: true, processFlowName: true },
  });

  if (!diagram) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.NOT_FOUND, message: "Flow diagram not found" } },
      { status: 404 },
    );
  }

  // Generate a simple PDF with SVG reference
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  doc.setFontSize(14);
  doc.text(`${diagram.scopeItemId} — ${diagram.processFlowName}`, 20, 20);
  doc.setFontSize(10);
  doc.setTextColor(107, 114, 128);
  doc.text("Flow diagram — see SVG for interactive version", 20, 30);
  doc.setFontSize(8);
  doc.text(`SVG content length: ${diagram.svgContent.length} characters`, 20, 38);

  const pdf = new Uint8Array(doc.output("arraybuffer"));

  return new NextResponse(pdf as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${diagram.scopeItemId}_${diagram.processFlowName}_Flow_Diagram.pdf"`,
    },
  });
}
