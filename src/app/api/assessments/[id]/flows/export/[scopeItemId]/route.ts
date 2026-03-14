/** GET: Export flow diagram as SVG, PNG, or PDF */

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { ERROR_CODES } from "@/types/api";
import { jsPDF } from "jspdf";
import { requireAssessmentAccess, isAssessmentAccessError } from "@/lib/auth/assessment-guard";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; scopeItemId: string }> },
): Promise<NextResponse> {
  const { id: assessmentId, scopeItemId } = await params;
  const access = await requireAssessmentAccess(assessmentId);
  if (isAssessmentAccessError(access)) return access;
  const { user } = access;
  const format = request.nextUrl.searchParams.get("format") ?? "svg";

  const diagram = await prisma.processFlowDiagram.findFirst({
    where: { assessmentId, scopeItemId },
    select: {
      svgContent: true,
      processFlowName: true,
      scopeItemId: true,
    },
  });

  if (!diagram) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.NOT_FOUND, message: "Flow diagram not found" } },
      { status: 404 },
    );
  }

  const assessment = await prisma.assessment.findUnique({
    where: { id: assessmentId },
    select: { companyName: true },
  });

  const baseName = `${diagram.scopeItemId}_${diagram.processFlowName}_Flow`;

  if (format === "svg") {
    return new NextResponse(diagram.svgContent, {
      headers: {
        "Content-Type": "image/svg+xml",
        "Content-Disposition": `attachment; filename="${baseName}.svg"`,
      },
    });
  }

  if (format === "png") {
    // Use sharp to render SVG to PNG
    const sharp = (await import("sharp")).default;
    const pngBuffer = await sharp(Buffer.from(diagram.svgContent))
      .resize({ width: 1920, withoutEnlargement: true })
      .png()
      .toBuffer();

    return new NextResponse(pngBuffer as unknown as BodyInit, {
      headers: {
        "Content-Type": "image/png",
        "Content-Disposition": `attachment; filename="${baseName}.png"`,
      },
    });
  }

  if (format === "pdf") {
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    doc.setFontSize(16);
    doc.text(`Process Flow: ${diagram.processFlowName}`, 20, 20);
    doc.setFontSize(10);
    doc.setTextColor(107, 114, 128);
    doc.text(`Assessment: ${assessment?.companyName ?? assessmentId}`, 20, 30);
    doc.text(`Scope Item: ${diagram.scopeItemId}`, 20, 37);
    doc.text(`Generated: ${new Date().toISOString().slice(0, 10)}`, 20, 44);
    doc.setFontSize(8);
    doc.text("See the exported SVG file for the interactive flow diagram.", 20, 54);

    const pdf = new Uint8Array(doc.output("arraybuffer"));

    return new NextResponse(pdf as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${baseName}.pdf"`,
      },
    });
  }

  return NextResponse.json(
    { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Invalid format. Use: svg, png, or pdf" } },
    { status: 400 },
  );
}
