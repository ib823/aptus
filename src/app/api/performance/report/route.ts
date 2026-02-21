/** POST: Report web vitals performance metrics (Phase 27) */

import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { ERROR_CODES } from "@/types/api";
import { z } from "zod";

export const preferredRegion = "sin1";

const reportSchema = z.object({
  route: z.string().min(1),
  metrics: z.array(
    z.object({
      name: z.enum(["LCP", "FID", "CLS", "TTFB", "FCP", "INP"]),
      value: z.number(),
      rating: z.enum(["good", "needs-improvement", "poor"]),
    }),
  ),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.UNAUTHORIZED, message: "Not authenticated" } },
      { status: 401 },
    );
  }

  const body: unknown = await request.json();
  const parsed = reportSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: ERROR_CODES.VALIDATION_ERROR,
          message: "Invalid performance report data",
          details: parsed.error.flatten().fieldErrors as Record<string, string>,
        },
      },
      { status: 400 },
    );
  }

  // Fire-and-forget: metrics will be stored when the PerformanceBaseline model is available.
  // For now, accept and acknowledge the report.

  return new NextResponse(null, { status: 204 });
}
