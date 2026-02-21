/** GET: Get active (not yet dismissed) tooltips for the current user */

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { ERROR_CODES } from "@/types/api";
import { TOOLTIP_REGISTRY } from "@/types/onboarding";

export const preferredRegion = "sin1";
export const maxDuration = 30;

export async function GET(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.UNAUTHORIZED, message: "Not authenticated" } },
      { status: 401 },
    );
  }

  const dismissed = await prisma.onboardingTooltip.findMany({
    where: { userId: user.id },
    select: { tooltipKey: true },
  });

  const dismissedKeys = new Set(dismissed.map((d) => d.tooltipKey));
  const activeTooltips = TOOLTIP_REGISTRY.filter((t) => !dismissedKeys.has(t.key));

  return NextResponse.json({ data: activeTooltips });
}
