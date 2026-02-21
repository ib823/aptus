/** POST: Dismiss a contextual tooltip */

import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { ERROR_CODES } from "@/types/api";
import { z } from "zod";

const dismissSchema = z.object({
  tooltipKey: z.string().min(1),
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
  const parsed = dismissSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: parsed.error.issues[0]?.message ?? "Validation failed" } },
      { status: 400 },
    );
  }

  const tooltip = await prisma.onboardingTooltip.upsert({
    where: {
      userId_tooltipKey: {
        userId: user.id,
        tooltipKey: parsed.data.tooltipKey,
      },
    },
    update: {
      dismissedAt: new Date(),
    },
    create: {
      userId: user.id,
      tooltipKey: parsed.data.tooltipKey,
    },
  });

  return NextResponse.json({ data: tooltip });
}
