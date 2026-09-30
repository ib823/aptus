import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getScopeDetail } from "@/lib/product-scope/detail";
import { renderScopeDiagram } from "@/lib/product-scope/diagram";

export async function GET(_request: Request, { params }: { params: Promise<{ origin: string; id: string }> }) {
  if (!(await getCurrentUser())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { origin, id } = await params;
  const detail = await getScopeDetail(origin, id);
  if (!detail || detail.steps.length === 0) return NextResponse.json({ error: "Diagram unavailable" }, { status: 404 });
  const svg = renderScopeDiagram(detail);
  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Content-Disposition": `inline; filename="${detail.code.replace(/[^a-zA-Z0-9_-]/g, "-")}-process.svg"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
